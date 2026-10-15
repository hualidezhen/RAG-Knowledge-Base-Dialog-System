/**
 * RAG 服务 —— 知识库问答的核心链路
 *
 * 完整流程：
 *   1. 查询改写（rewriteQuery）：利用对话历史将用户问题改写为独立搜索查询，提升检索命中率
 *   2. 混合检索（retrieveRelevantChunks）：向量检索 + BM25 关键词检索 + RRF 合并 + Cross-encoder 重排序 + 文档多样化
 *   3. 流式生成（streamAnswer / generateAnswerStream）：组装 System Prompt（含参考文档、记忆摘要、对话历史），通过 SSE 流式返回 LLM 回答
 *   4. 非流式生成（generateAnswerNonStreaming）：一次性调用 LLM 返回完整回答，用于 Tool 调用等无需 SSE 的场景
 *   5. 记忆集成：在生成答案前注入 L2 对话摘要，支持跨会话记忆
 *   6. 滑动窗口：通过 contextManager 截断过长历史，自动生成摘要替代
 */

import dotenv from 'dotenv'
dotenv.config()

import { Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { IncludeEnum } from 'chromadb'
import { getEmbeddings, getOrCreateCollection, listDocuments } from './vectorStoreService'
import { searchWithMetadata, ensureIndex as ensureHybridIndex } from './hybridSearchService'
import { rerank } from './rerankerService'
import { RetrievedChunk, ChatMessage } from '../types'
import { getMemoryService } from './memoryService'
import { getMonitorService } from './monitorService'
import { getContextManager } from './contextManager'

/** 流式/非流式回答的配置选项 */
interface StreamOptions {
  apiKey?: string
  temperature?: number
  history?: ChatMessage[]
  collection?: string
  sessionId?: string
}

/**
 * RAG 服务类
 *
 * 职责：
 *  - 管理 LLM 客户端（通过 DeepSeek 的 Anthropic 兼容 API 访问）
 *  - 执行完整 RAG 链路：查询改写 → 混合检索 → 重排序 → 答案生成
 *  - 集成 L2/L3 记忆系统与滑动窗口上下文管理
 *  - 采集 LLM 调用和检索环节的性能指标
 */
export class RagService {
  private anthropic: Anthropic | null = null

  /**
   * 获取或初始化 Anthropic SDK 客户端
   * 使用 DeepSeek 的 Anthropic 兼容 API，实现客户端实例的单例复用
   */
  private ensureClient(): Anthropic {
    if (!this.anthropic) {
      const apiKey = process.env.DEEPSEEK_API_KEY
      const baseURL = process.env.DEEPSEEK_ANTHROPIC_BASE_URL

      if (!apiKey || apiKey === 'your_key_here') {
        throw new Error('DEEPSEEK_API_KEY 未配置')
      }

      this.anthropic = new Anthropic({
        apiKey,
        baseURL: baseURL || 'https://api.deepseek.com/anthropic',
      })
    }
    return this.anthropic
  }

  /**
   * 利用对话历史改写用户问题，生成独立的搜索查询
   *
   * 目的：解决指代消解问题，例如用户说"它有什么用途？"时，
   *       需要结合上文才能知道"它"指代什么，从而生成有效的检索查询。
   *
   * @param question - 用户当前问题
   * @param history - 对话历史（最多取最近 2 轮）
   * @returns 改写后的独立搜索查询，失败时返回原问题
   */
  private async rewriteQuery(
    question: string,
    history?: ChatMessage[]
  ): Promise<string> {
    // 取最近 2 轮对话（4 条消息：2 条 user + 2 条 assistant）
    const recentHistory = (history ?? []).slice(-4)
    // 无历史时直接返回原问题，无需改写
    if (recentHistory.length === 0) return question

    // 将历史格式化为文本
    const historyStr = recentHistory
      .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .join('\n')

    // 构造改写提示词，要求 LLM 仅输出查询本身
    const prompt = `将以下对话历史和当前问题改写为一个独立的搜索查询，只输出改写后的查询，不要解释。

历史：
${historyStr}

当前问题：${question}`

    try {
      const client = this.ensureClient()
      const startTime = Date.now()
      // 调用 LLM 进行改写，temperature=0 保证确定性输出
      const response = await client.messages.create({
        model: 'deepseek-v4-flash',
        max_tokens: 128000,
        temperature: 0,
        system: '你是一个查询改写助手。',
        messages: [{ role: 'user', content: prompt }],
      })
      const duration = Date.now() - startTime

      // 记录改写调用的性能指标
      const usage = (response as any).usage
      getMonitorService().recordLLMMetric(
        'query_rewrite', duration,
        usage?.input_tokens || 0, usage?.output_tokens || 0,
        'deepseek-v4-flash', true
      )

      // 提取 LLM 返回的文本
      const rewritten = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()

      return rewritten || question
    } catch {
      // LLM 调用失败时降级：返回原问题，不影响后续流程
      return question
    }
  }

  /**
   * 流式生成回答（SSE 方式）
   *
   * 完整处理流程：
   *   0. 获取文档清单（用于上下文增强）
   *   1. 查询改写（利用对话历史）
   *   2. 混合检索（向量 + BM25 + 重排序）
   *   3. 发送 sources 事件（SSE）
   *   4. 调用 LLM 流式生成回答
   *   5. 完成后触发记忆检查点
   *
   * @param userMessage - 用户输入消息
   * @param res - Express Response 对象，用于 SSE 推送
   * @param options - 可选配置（temperature、history、collection、sessionId 等）
   */
  async generateAnswerStream(
    userMessage: string,
    res: Response,
    options?: StreamOptions
  ): Promise<void> {
    const trimmed = userMessage.trim()
    if (!trimmed) {
      res.status(400).json({ error: '消息不能为空' })
      return
    }

    // 设置 SSE 响应头，保持长连接
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // 立即发送心跳，确认连接建立
    res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)

    try {
      // Step 0: 获取知识库中文档清单，用于告知 LLM 可用的文档范围
      let allDocs: string[] = []
      try {
        const docs = await listDocuments(options?.collection)
        allDocs = docs.map((d) => d.fileName)
      } catch {
        // ChromaDB 不可用时静默降级
      }

      // Step 1: 利用对话历史改写查询，解决指代消解问题
      const searchQuery = await this.rewriteQuery(trimmed, options?.history)

      // Step 2: 执行混合检索（向量检索 + BM25 + RRF 合并 + 重排序）
      let chunks: RetrievedChunk[] = []
      try {
        chunks = await this.retrieveRelevantChunks(searchQuery, options?.collection)
      } catch {
        // ChromaDB 不可用时静默降级，走纯对话模式（无知识库上下文）
        chunks = []
      }

      // Step 3: 向客户端推送检索到的文档片段（前端可展示来源）
      res.write(
        `data: ${JSON.stringify({ type: 'sources', sources: chunks })}\n\n`
      )

      // Step 4: 调用 LLM 流式生成回答（有上下文时基于文档回答，否则纯对话）
      const fullAnswer = await this.streamAnswer(trimmed, chunks, allDocs, res, options)

      // Step 5: 流式完成后，将本轮对话写入记忆检查点
      if (options?.sessionId) {
        const history = options?.history ?? []
        const newMessages: ChatMessage[] = [
          ...history,
          { role: 'user', content: trimmed },
          { role: 'assistant', content: fullAnswer },
        ]
        // 异步写入，不阻塞响应
        getMemoryService().checkpoint(options.sessionId, newMessages).catch(() => {})
      }
    } catch (err: any) {
      // 整体流程异常时，向客户端推送错误事件
      const errorMsg =
        err.message || '生成回答时发生未知错误'
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`
      )
      res.end()
    }
  }

  /**
   * 非流式生成回答（一次性返回）
   *
   * 与 streamAnswer 逻辑相同，但使用非流式 API 调用，适用于 Tool 调用等不需要 SSE 的场景。
   *
   * @param userMessage - 用户输入消息
   * @param options - 可选配置
   * @returns 包含回答文本和检索到的文档片段
   */
  async generateAnswerNonStreaming(
    userMessage: string,
    options?: StreamOptions
  ): Promise<{ answer: string; chunks: RetrievedChunk[] }> {
    const trimmed = userMessage.trim()
    if (!trimmed) throw new Error('消息不能为空')

    // Step 0: 获取完整文档清单，用于 LLM 上下文增强
    let allDocs: string[] = []
    try {
      const docs = await listDocuments(options?.collection)
      allDocs = docs.map((d) => d.fileName)
    } catch {
      // ChromaDB 不可用时静默降级
    }

    // Step 1: 利用对话历史改写查询
    const searchQuery = await this.rewriteQuery(trimmed, options?.history)

    // Step 2: 执行混合检索
    let chunks: RetrievedChunk[] = []
    try {
      chunks = await this.retrieveRelevantChunks(searchQuery, options?.collection)
    } catch {
      // 检索失败时静默降级，走纯对话模式
      chunks = []
    }

    // Step 3: 构建记忆上下文（L2 对话摘要）
    let memorySummary = ''
    if (options?.sessionId) {
      const memCtx = await this.buildMemoryContext(options.sessionId)
      memorySummary = memCtx.summary
    }
    const memoryStr = memorySummary ? `\n\n${memorySummary}` : ''

    // Step 4: 应用滑动窗口，截断过长历史
    const rawHistory: ChatMessage[] = options?.history ?? []
    let windowedHistory = rawHistory
    try {
      const result = await getContextManager().applyWindow(rawHistory, options?.sessionId)
      windowedHistory = result.messages
      const ws = result.summary
      if (ws) {
        // 将滑动窗口摘要追加到记忆摘要中
        const additionalSummary = `【对话摘要】\n${ws}\n`
        memorySummary = memorySummary
          ? `${memorySummary}\n${additionalSummary}`
          : additionalSummary
      }
    } catch {
      windowedHistory = rawHistory
    }

    // Step 5: 构建 System Prompt
    const hasContext = chunks.length > 0
    const docListStr = allDocs.length > 0
      ? `当前知识库中包含以下 ${allDocs.length} 个文档：\n${allDocs.map((name, i) => `${i + 1}. ${name}`).join('\n')}\n\n`
      : ''

    const systemPrompt = hasContext
      ? `你是一个基于文档内容回答问题的助手。请使用以下参考资料回答问题，如果资料中不包含答案，请明确说"该问题不在知识库范围内"。${memoryStr}\n\n${docListStr}参考资料：\n` +
        chunks
          .map((c) => `[来源: ${c.fileName} (段落 ${c.chunkIndex + 1})]\n${c.content}`)
          .join('\n\n---\n\n')
      : `你是一个智能助手，请根据你的知识回答用户的问题。如果不知道答案，请如实说明。${memoryStr}${docListStr ? `\n\n当前知识库中的文档列表（仅供参考）：\n${allDocs.map((name, i) => `${i + 1}. ${name}`).join('\n')}` : ''}`

    // 优先使用请求级别的 API Key，否则用缓存的客户端实例
    const client =
      options?.apiKey
        ? new Anthropic({
            apiKey: options.apiKey,
            baseURL: process.env.DEEPSEEK_ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic',
          })
        : this.ensureClient()

    // 构建消息数组（含滑动窗口处理后的对话历史）
    const msgs: Anthropic.MessageParam[] = [
      ...windowedHistory.map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user' as const, content: userMessage },
    ]

    // 非流式 LLM 调用
    const llmStart = Date.now()
    const response = await client.messages.create({
      model: 'deepseek-v4-flash',
      max_tokens: parseInt(process.env.MAX_TOKENS || '32768 ', 10),
      temperature: options?.temperature ?? 0.3,
      system: systemPrompt,
      messages: msgs,
    })
    const llmDuration = Date.now() - llmStart
    const llmUsage = (response as any).usage
    getMonitorService().recordLLMMetric(
      'chat_completion', llmDuration,
      llmUsage?.input_tokens || 0, llmUsage?.output_tokens || 0,
      'deepseek-v4-flash', true
    )

    // 提取 LLM 回答文本
    const answer = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    // 异步写入记忆检查点（不阻塞响应）
    if (options?.sessionId) {
      const history = options?.history ?? []
      const newMessages: ChatMessage[] = [
        ...history,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: answer },
      ]
      getMemoryService().checkpoint(options.sessionId, newMessages).catch(() => {})
    }

    return { answer, chunks }
  }

  /**
   * 执行混合检索，返回与查询最相关的文档片段
   *
   * 检索链路（5 步）：
   *   1. 向量检索（Vector Retrieval）：用 Embedding 语义匹配，取 top-30
   *   2. BM25 检索（Keyword Retrieval）：用关键词匹配，取 top-30
   *   3. RRF 合并（Reciprocal Rank Fusion）：将两路结果按倒数排序加权合并
   *   4. Cross-encoder 重排序：对 RRF top-15 用精排模型重新打分
   *   5. 文档多样化（Diversify）：若重排序失败，用轮询策略保证每个文档都有代表
   *
   * @param message - 用户查询（已改写）
   * @param collectionName - 可选的知识库名称
   * @returns 检索到的文档片段数组（最多 8 条）
   */
  public async retrieveRelevantChunks(
    message: string,
    collectionName?: string
  ): Promise<RetrievedChunk[]> {
    const retrievalStart = Date.now()
    const embeddings = await getEmbeddings()
    const collection = await getOrCreateCollection(collectionName)

    // 对查询生成向量 Embedding
    const vector = await embeddings.embedQuery(message)

    // ---- 第 1 步：向量检索（语义匹配），取 top-30 ----
    const result = await collection.query({
      queryEmbeddings: [vector],
      nResults: 30,
      include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances],
    })

    const docs = result.documents?.[0] ?? []
    const metas = result.metadatas?.[0] ?? []
    const distances = result.distances?.[0] ?? []

    const vecCandidates: { chunk: RetrievedChunk; rank: number }[] = docs
      .map((doc, i) => ({
        chunk: {
          content: doc ?? '',
          fileName: (metas[i]?.fileName as string) ?? 'unknown',
          chunkIndex: (metas[i]?.chunkIndex as number) ?? 0,
          distance: distances[i] ?? 0,
        },
        rank: i,
      }))
      .filter((c) => c.chunk.content.trim().length > 0)

    // ---- 第 2 步：BM25 检索（关键词匹配），取 top-30 ----
    let bm25Candidates: { chunk: RetrievedChunk; rank: number }[] = []
    try {
      await ensureHybridIndex(collectionName)
      const bm25Results = await searchWithMetadata(message, 30, collectionName)
      bm25Candidates = bm25Results.map((r, i) => ({
        chunk: r.chunk,
        rank: i,
      }))
    } catch {
      // BM25 索引不可用时（如未安装依赖），降级为仅用向量检索结果
    }

    // ---- 第 3 步：RRF 合并（Reciprocal Rank Fusion）----
    // RRF 公式：score = Σ 1/(k + rank)，其中 k=60
    // 作用：将两路排序结果合并，高排名（rank 小）的文档获得更高权重
    const rrfScores = new Map<number, number>()   // 按合并后的索引存储 RRF 分数
    const merged: RetrievedChunk[] = []            // 合并后的结果列表
    const seen = new Set<string>()                 // 用于去重

    // 基于文件名 + 段落索引 + 内容前缀生成唯一键，用于跨路去重
    const contentKey = (c: RetrievedChunk) =>
      `${c.fileName}:${c.chunkIndex}:${c.content.slice(0, 50)}`

    // 先处理向量检索结果
    for (const cand of vecCandidates) {
      const key = contentKey(cand.chunk)
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(cand.chunk)
        // RRF 贡献：1/(60 + rank + 1)，rank 从 0 开始，+1 使 rank=0 时贡献为 1/61
        rrfScores.set(merged.length - 1, 1 / (60 + cand.rank + 1))
      }
    }

    // 再处理 BM25 检索结果
    for (const cand of bm25Candidates) {
      const key = contentKey(cand.chunk)
      const existingIdx = merged.findIndex(
        (m) => contentKey(m) === key
      )
      if (existingIdx >= 0) {
        // BM25 和向量检索命中同一文档：累加 RRF 分数
        rrfScores.set(
          existingIdx,
          (rrfScores.get(existingIdx) || 0) + 1 / (60 + cand.rank + 1)
        )
      } else {
        // BM25 独有的结果：作为新条目加入
        seen.add(key)
        merged.push(cand.chunk)
        rrfScores.set(merged.length - 1, 1 / (60 + cand.rank + 1))
      }
    }

    // 按 RRF 总分降序排列（分数越高越靠前）
    merged.sort((a, b) => {
      const sa = rrfScores.get(merged.indexOf(a)) || 0
      const sb = rrfScores.get(merged.indexOf(b)) || 0
      return sb - sa
    })

    // ---- 第 4 步：Cross-encoder 重排序 ----
    // 对 RRF 合并后的 top-15 用交叉编码器模型进行精确重打分
    const top15 = merged.slice(0, 15)
    const reranked = await rerank(message, top15, 8)

    if (reranked.length > 0) {
      // 重排序成功：记录指标并返回
      getMonitorService().recordRetrievalMetric(
        Date.now() - retrievalStart, reranked.length,
        vecCandidates.length, bm25Candidates.length, reranked.length
      )
      return reranked
    }

    // ---- 第 5 步：降级策略 —— 文档多样化 ----
    // 重排序模型不可用时，用轮询策略保证每个文档都有代表
    if (merged.length <= 8) {
      // 结果不足 8 条，直接返回
      getMonitorService().recordRetrievalMetric(
        Date.now() - retrievalStart, merged.length,
        vecCandidates.length, bm25Candidates.length, 0
      )
      return merged
    }
    // 超过 8 条时做多样化选择
    const diversified = this.diversifyByDocument(merged)
    getMonitorService().recordRetrievalMetric(
      Date.now() - retrievalStart, diversified.length,
      vecCandidates.length, bm25Candidates.length, 0
    )
    return diversified
  }

  /**
   * 按文档进行多样性选择（轮询策略）
   *
   * 目的：当重排序不可用时，防止单个文档占据所有 top-N 位置。
   * 策略：每个文档每次贡献一条最佳结果，轮流转，直到选够 8 条。
   *
   * @param candidates - 经 RRF 合并后的候选列表
   * @returns 多样化的 top-8 结果
   */
  private diversifyByDocument(candidates: RetrievedChunk[]): RetrievedChunk[] {
    // 将距离转为相似度（距离越小越相似）
    const toSim = (d: number) => 1 / (1 + d)
    const querySims = candidates.map((c) => toSim(c.distance))

    // 按文件名分组，将每个文档的候选项归在一起
    const byDoc = new Map<string, { chunk: RetrievedChunk; sim: number }[]>()
    candidates.forEach((c, i) => {
      if (!byDoc.has(c.fileName)) byDoc.set(c.fileName, [])
      byDoc.get(c.fileName)!.push({ chunk: c, sim: querySims[i] })
    })

    // 每个文档内部按相似度降序排列（最佳结果在前）
    for (const [, items] of byDoc) {
      items.sort((a, b) => b.sim - a.sim)
    }

    const selected: RetrievedChunk[] = []
    const docNames = [...byDoc.keys()]
    // 记录已被选中的索引，防止重复选取
    const taken = new Set<number>()

    // 轮询选择：每次遍历所有文档，每个文档取一条未被选过的最佳结果
    while (selected.length < 8) {
      let added = false
      for (const name of docNames) {
        const items = byDoc.get(name)!
        for (let i = 0; i < items.length; i++) {
          const idx = candidates.indexOf(items[i].chunk)
          if (!taken.has(idx)) {
            taken.add(idx)
            selected.push(items[i].chunk)
            added = true
            break
          }
        }
        if (selected.length >= 8) break
      }
      // 所有文档都已无可用候选项时终止
      if (!added) break
    }

    return selected
  }

  /**
   * 构建记忆上下文，用于注入到 System Prompt 中
   *
   * 从 memoryService 中获取当前会话的 L2 摘要（历史对话概述 + 关键事实），
   * 格式化为文本后提供给 LLM，使 LLM 了解更早的对话内容。
   *
   * @param sessionId - 会话 ID
   * @returns 摘要文本和记忆片段数组
   */
  private async buildMemoryContext(sessionId?: string): Promise<{ summary: string; memories: string[] }> {
    if (!sessionId) return { summary: '', memories: [] }
    try {
      const mem = getMemoryService()
      // 获取该会话最新的 L2 对话摘要
      const l2 = mem.getLatestSummary(sessionId)
      const summary = l2 ? `【历史对话摘要】\n${l2.summary}\n关键信息：${l2.keyFacts.join('、')}\n` : ''
      return { summary, memories: [] }
    } catch {
      // 记忆服务不可用时静默降级，返回空上下文
      return { summary: '', memories: [] }
    }
  }

  /**
   * 流式调用 LLM 生成回答，通过 SSE 逐 Token 推送
   *
   * System Prompt 构建逻辑：
   *   1. 文档清单：告知 LLM 知识库中有哪些文档可用
   *   2. 检索到的相关片段（有上下文时）：逐条标注来源文件名和段落号
   *   3. 记忆摘要（L2）：注入历史对话摘要，包含关键事实
   *   4. 滑动窗口摘要：注入被截断的早期对话的摘要
   *   5. 区分两种模式：有参考文档时要求基于文档回答，否则纯对话
   *
   * @param userMessage - 用户当前问题
   * @param chunks - 检索到的相关文档片段
   * @param allDocs - 知识库中所有文档的文件名列表
   * @param res - Express Response 对象，用于 SSE 推送
   * @param options - 可选配置
   * @returns 完整的回答文本（Promise）
   */
  private async streamAnswer(
    userMessage: string,
    chunks: RetrievedChunk[],
    allDocs: string[],
    res: Response,
    options?: StreamOptions
  ): Promise<string> {
    const hasContext = chunks.length > 0

    // ---- 构建文档清单上下文 ----
    // 让 LLM 了解知识库中所有可用文档的范围，即使当前未检索到相关片段也可参考
    const docListStr = allDocs.length > 0
      ? `当前知识库中包含以下 ${allDocs.length} 个文档：\n${allDocs.map((name, i) => `${i + 1}. ${name}`).join('\n')}\n\n`
      : ''

    // ---- 注入记忆上下文 ----
    // 从 memoryService 获取 L2 对话摘要（跨轮次/跨会话记忆）
    let memorySummary = ''
    if (options?.sessionId) {
      const memCtx = await this.buildMemoryContext(options.sessionId)
      memorySummary = memCtx.summary
    }

    // ---- 应用滑动窗口 ----
    // 截断过长历史，将最早对话转为摘要，减少 Token 消耗
    const historyMessages: ChatMessage[] = options?.history ?? []
    let windowSummary = ''
    let windowedHistory = historyMessages
    try {
      const result = await getContextManager().applyWindow(historyMessages, options?.sessionId)
      windowedHistory = result.messages
      windowSummary = result.summary
    } catch {
      // 滑动窗口服务不可用时降级，使用原始历史
      windowedHistory = historyMessages
    }

    // ---- 合并摘要 ----
    // 将滑动窗口摘要和记忆摘要合并为一段上下文文本
    let combinedSummary = ''
    if (windowSummary && memorySummary) {
      combinedSummary = `${windowSummary}\n\n${memorySummary}`
    } else {
      combinedSummary = windowSummary || memorySummary
    }
    const memoryStr = combinedSummary ? `\n\n${combinedSummary}` : ''

    // ---- 构建 System Prompt ----
    // 有上下文模式：要求 LLM 严格基于参考资料回答
    // 无上下文模式：允许 LLM 用自己的知识回答
    const systemPrompt = hasContext
      ? `你是一个基于文档内容回答问题的助手。请使用以下参考资料回答问题，如果资料中不包含答案，请明确说"该问题不在知识库范围内"。${memoryStr}\n\n${docListStr}参考资料：\n` +
        chunks
          .map((c) => `[来源: ${c.fileName} (段落 ${c.chunkIndex + 1})]\n${c.content}`)
          .join('\n\n---\n\n')
      : `你是一个智能助手，请根据你的知识回答用户的问题。如果不知道答案，请如实说明。${memoryStr}${docListStr ? `\n\n当前知识库中的文档列表（仅供参考）：\n${allDocs.map((name, i) => `${i + 1}. ${name}`).join('\n')}` : ''}`

    // 优先使用请求级别的 API Key，否则用缓存的客户端实例
    const client =
      options?.apiKey
        ? new Anthropic({
            apiKey: options.apiKey,
            baseURL: process.env.DEEPSEEK_ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic',
          })
        : this.ensureClient()

    // 构建消息数组（含滑动窗口处理后的对话历史）
    const msgs: Anthropic.MessageParam[] = [
      ...windowedHistory.map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user' as const, content: userMessage },
    ]

    // 发起流式 LLM 调用
    const streamStart = Date.now()
    const stream = client.messages.stream({
      model: 'deepseek-v4-flash',
      max_tokens: parseInt(process.env.MAX_TOKENS || '32768 ', 10),
      temperature: options?.temperature ?? 0.3,
      system: systemPrompt,
      messages: msgs,
    })

    let streamTokenUsage: { input_tokens: number; output_tokens: number } | null = null
    let fullResponse = ''

    return new Promise((resolve, reject) => {
      // 每收到一个文本块，立即通过 SSE 推送给前端
      stream.on('text', (text: string) => {
        fullResponse += text
        res.write(
          `data: ${JSON.stringify({ type: 'token', content: text })}\n\n`
        )
      })

      // 捕获最终消息以获取 Token 使用统计
      stream.on('message', (msg: any) => {
        if (msg?.usage) streamTokenUsage = msg.usage
      })

      stream.on('end', () => {
        res.write('data: [DONE]\n\n')
        res.end()
        const duration = Date.now() - streamStart
        getMonitorService().recordLLMMetric(
          'stream_chat', duration,
          streamTokenUsage?.input_tokens || 0, streamTokenUsage?.output_tokens || 0,
          'deepseek-v4-flash', true
        )
        resolve(fullResponse)
      })

      stream.on('error', (error: Error) => {
        const msg = error.message || '流式响应异常'
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`
        )
        res.end()
        const duration = Date.now() - streamStart
        getMonitorService().recordLLMMetric(
          'stream_chat', duration, 0, 0, 'deepseek-v4-flash', false
        )
        reject(error)
      })
    })
  }
}

// ---- Singleton 模式 ----
// 确保整个应用生命周期中只创建一个 RagService 实例
// 所有模块通过 getRagService() 获取同一实例，避免重复初始化 LLM 客户端
// 这是项目约定的服务层模式

let ragServiceInstance: RagService | null = null

export function getRagService(): RagService {
  if (!ragServiceInstance) {
    ragServiceInstance = new RagService()
  }
  return ragServiceInstance
}
