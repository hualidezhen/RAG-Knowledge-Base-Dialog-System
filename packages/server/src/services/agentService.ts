/**
 * AgentService — ReAct 推理循环引擎
 *
 * ===== 整体架构 =====
 *
 * 本文件实现了 Agent 的核心推理循环，采用 ReAct（Reasoning + Acting）范式：
 *
 *   Thought（思考） → Action（工具调用） → Observation（观察结果） → Loop（循环）
 *                                                      ↓
 *                                           Final Answer（最终回答）
 *
 * ===== 流式输出设计（SSE） =====
 *
 * 推理过程通过 Server-Sent Events（SSE）流式推送给前端，事件类型包括：
 *
 *   - agent_thinking  : LLM 当前的思考过程（thought）
 *   - agent_tool_use  : Agent 决定调用哪个工具及其参数
 *   - agent_observation : 工具执行后的观察结果（经摘要截断）
 *   - token           : 最终答案的文本片段（Final Answer 时发送）
 *   - error           : 发生异常时发送错误信息
 *   - [DONE]          : 流结束标记
 *
 * ===== 工具失败恢复 =====
 *
 * 工具调用失败时自动重试 1 次（P2-4），仍失败则告知 LLM 跳过并尝试其他方式回答。
 * 最大迭代次数为 10（maxIterations），防止无限循环。
 *
 * ===== 非流式模式 =====
 *
 * executeAgent() 提供非流式执行接口，返回结构化结果，用于 Agent 评估系统（P7）。
 */

import { Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'

import { Tool, ChatMessage, ToolResult } from '../types'
import { getToolRegistry } from './toolRegistry'
import { getMonitorService } from './monitorService'
import { getContextManager } from './contextManager'
import { getMemoryService } from './memoryService'

// ---- Types ----

/** 解析后的 ReAct 输出，从 LLM 文本中提取结构化的思考/行动/最终答案 */
interface ParsedReAct {
  thought: string                                      /**< LLM 的思考过程文本 */
  action?: { name: string; args: Record<string, any> } /**< 要调用的工具名称和参数 */
  finalAnswer?: string                                 /**< 最终回答（循环结束标志） */
}

/** ReAct 循环中每一步的记录，包含思考、行动、结果和观察 */
interface StepRecord {
  thought: string                                      /**< 该步骤的 LLM 思考过程 */
  action: { name: string; args: Record<string, any> }  /**< 调用的工具及参数 */
  result: ToolResult                                   /**< 工具执行结果 */
  observation: string                                  /**< 截断后的观察摘要（用于后续 LLM 调用） */
}

/** Agent 执行选项，控制推理行为的各项参数 */
interface AgentOptions {
  apiKey?: string       /**< 自定义 API Key，不传则使用环境变量 DEEPSEEK_API_KEY */
  temperature?: number  /**< LLM 温度参数，默认 0.3 */
  history?: ChatMessage[] /**< 对话历史消息列表 */
  collection?: string   /**< 指定知识库集合名称 */
  sessionId?: string    /**< 会话 ID，用于关联记忆和摘要 */
}

// ---- Helpers ----

/**
 * 构建工具的文本描述字符串，用于注入 System Prompt 中让 LLM 知道可用工具及其参数。
 * 每个工具包含名称、描述和参数列表（参数名、类型、是否必填、说明）。
 * @param tools - 已注册的工具列表
 * @returns 格式化后的工具描述文本
 */
function buildToolsDescription(tools: Tool[]): string {
  return tools
    .map((t) => {
      const params = t.parameters
        .map((p) => `    - ${p.name} (${p.type}${p.required ? ', 必填' : ', 可选'}): ${p.description}`)
        .join('\n')
      return `工具名称: ${t.name}\n  描述: ${t.description}\n  参数:\n${params}`
    })
    .join('\n\n')
}

/**
 * 对工具返回的结果数据进行摘要截断，避免 SSE 负载过大。
 * 不同类型工具使用不同的摘要策略：
 *   - retrieve_knowledge：列出每个片段的前 100 字符
 *   - list_documents：只列文档名
 *   - get_document_content：取前 500 字符
 *   - chat_with_context：只报告字符数
 * @param toolName - 工具名称，决定摘要策略
 * @param data - 工具返回的原始数据
 * @returns 截断后的观察摘要文本
 */
function summarizeObservation(toolName: string, data: any): string {
  if (!data) return '无返回数据'
  if (toolName === 'retrieve_knowledge') {
    const chunks = data.chunks || []
    if (chunks.length === 0) return '未检索到相关文档片段'
    const summary = chunks.map((c: any) => `[${c.fileName} 段落${(c.chunkIndex ?? 0) + 1}] ${c.content.slice(0, 100)}...`)
    return `检索到 ${chunks.length} 个相关片段：\n${summary.join('\n')}`
  }
  if (toolName === 'list_documents') {
    const docs = data.documents || []
    if (docs.length === 0) return '知识库中暂无文档'
    return `知识库中有 ${docs.length} 个文档：\n${docs.map((d: any) => `- ${d.fileName}`).join('\n')}`
  }
  if (toolName === 'get_document_content') {
    const content = data.content || ''
    return `文档 "${data.fileName}" 内容（共 ${content.length} 字符）：\n${content.slice(0, 500)}...`
  }
  // chat_with_context：报告生成的回答字符数
  return `回答已生成（${(data.answer || '').length} 字符）`
}

/**
 * 解析 LLM 返回的文本，提取结构化的 ReAct 指令（Thought + Action / Final Answer）。
 *
 * 正则匹配逻辑：
 *   1. 先提取 "Thought:" 之后到 "Action:" 或 "Final Answer:" 之前的内容作为思考过程
 *   2. 然后尝试匹配 "Final Answer:" 之后的文本作为最终答案
 *   3. 若未命中 Final Answer，再尝试匹配 "Action: 工具名({...})" 格式提取工具调用
 *   4. 若均未匹配，将整段文本作为纯思考内容返回
 * @param text - LLM 返回的原始文本
 * @returns 解析后的 ParsedReAct 结构
 */
function parseReAct(text: string): ParsedReAct {
  const trimmed = text.trim()

  // 提取 Thought：匹配 "Thought:" 之后到 "Action:" 或 "Final Answer:" 之前的内容
  let thought = ''
  const thoughtMatch = trimmed.match(/Thought:\s*(.*?)(?=\n\s*(?:Action|Final Answer)\s*:)/s)
  if (thoughtMatch) {
    thought = thoughtMatch[1].trim()
  }

  // 提取 Final Answer：匹配 "Final Answer:" 之后的所有文本
  const finalMatch = trimmed.match(/Final Answer:\s*(.*)/s)
  if (finalMatch) {
    return { thought, finalAnswer: finalMatch[1].trim() }
  }

  // 提取 Action：匹配 "Action: 工具名({...})" 格式，其中 {...} 为 JSON 参数
  const actionMatch = trimmed.match(/Action:\s*(\w+)\s*\(\s*(\{.*?\})\s*\)/s)
  if (actionMatch) {
    try {
      const name = actionMatch[1]
      const args = JSON.parse(actionMatch[2])
      return { thought, action: { name, args } }
    } catch {
      // JSON 解析失败，将整段文本作为纯思考内容返回
      return { thought: trimmed }
    }
  }

  // 没有任何结构化输出，将整段 LLM 响应作为纯思考内容
  return { thought: trimmed.length > 0 ? trimmed : text }
}

// ---- AgentService ----

/**
 * AgentService — ReAct 推理循环引擎
 *
 * 职责：
 *   1. 管理 Anthropic SDK 客户端（支持自定义 API Key）
 *   2. 组装 System Prompt（工具描述 + 集合信息 + 记忆摘要）
 *   3. 执行 ReAct 循环（Thought → Action → Observation → Loop/Final Answer）
 *   4. 通过 SSE 流式输出推理过程（agent_thinking / agent_tool_use / agent_observation / token）
 *   5. 提供非流式 executeAgent() 供评估系统使用（P7）
 *
 * 使用 getAgentService() Singleton 获取实例。
 */
export class AgentService {
  /** 缓存的 Anthropic SDK 客户端实例（复用连接，避免重复创建） */
  private anthropic: Anthropic | null = null

  /** 获取或创建默认 Anthropic SDK 客户端（使用环境变量配置） */
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
   * 获取 Anthropic SDK 客户端。
   * 如果传入了自定义 API Key 则创建新实例，否则复用缓存的默认客户端。
   */
  private getClient(options?: AgentOptions): Anthropic {
    if (options?.apiKey) {
      return new Anthropic({
        apiKey: options.apiKey,
        baseURL: process.env.DEEPSEEK_ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic',
      })
    }
    return this.ensureClient()
  }

  /**
   * 组装 System Prompt，包含：
   *   1. 所有已注册工具的文本描述（名称、参数、说明）—— 由 buildToolsDescription() 生成
   *   2. 当前知识库集合名称（如果有指定）
   *   3. 历史对话摘要（L2 记忆，如果有 sessionId）
   *   4. ReAct 格式指令（Thought / Action / Final Answer 格式说明）
   *   5. 工具失败处理和闲聊场景的应对策略
   */
  private buildSystemPrompt(collection?: string, memorySummary?: string): string {
    const registry = getToolRegistry()
    const tools = registry.list()
    const toolsDesc = buildToolsDescription(tools)

    const collectionHint = collection
      ? `\n当前知识库: ${collection}\n`
      : ''

    const memoryHint = memorySummary ? `\n\n${memorySummary}` : ''

    return `你是 RAG 知识库系统的智能助手。你可以使用以下工具来回答用户的问题：

${toolsDesc}${collectionHint}${memoryHint}

请严格按照以下格式思考和行动：

Thought: 你当前的想法和计划
Action: 工具名称({"参数名": "参数值"})

当工具返回结果后，你会看到 Observation。根据观察结果继续思考。
当你获得足够信息可以回答用户时，输出：

Thought: 我已经获得足够的信息
Final Answer: 你对用户的最终回答

注意事项：
- 每次只调用一个工具，等待结果后再决定下一步
- 如果工具调用失败，尝试重试一次，仍失败则尝试其他方式回答
- 如果用户问候或闲聊，直接给出 Final Answer，不需要调用工具
- 你的回答应基于知识库内容，若不在知识库范围内则如实告知用户`
  }

  /**
   * 执行 ReAct 循环，通过 SSE 流式输出推理过程和最终答案。
   *
   * 每轮迭代流程：
   *   1. 构建消息列表（含滑动窗口后的历史 + 已有 ReAct 追踪链）
   *   2. 调用 LLM 获取下一步的 Thought + Action/FinalAnswer
   *   3. 发送 agent_thinking SSE 事件
   *   4. 如果是 Final Answer → 发送 token 事件结束
   *   5. 如果是 Action → 调用工具，失败时重试 1 次（P2-4）
   *   6. 发送 agent_tool_use + agent_observation SSE 事件
   *   7. 回到步骤 1，直到达到最大迭代次数（maxIterations=10）
   *
   * SSE 事件：agent_thinking, agent_tool_use, agent_observation, token, error
   *
   * @param userMessage - 用户输入的消息
   * @param res - Express Response 对象，用于写入 SSE 事件
   * @param options - Agent 执行选项（温度、历史、集合、会话 ID 等）
   */
  async streamChat(
    userMessage: string,
    res: Response,
    options?: AgentOptions
  ): Promise<void> {
    const trimmed = userMessage.trim()
    if (!trimmed) {
      res.status(400).json({ error: '消息不能为空' })
      return
    }

    // 设置 SSE 响应头：Content-Type 为 text/event-stream，禁用缓存和连接复用
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    try {
      // 对对话历史应用滑动窗口策略（P6）：保留最近 N 轮对话，超出部分截断并生成摘要
      let windowedHistory: ChatMessage[] = options?.history ?? []
      try {
        const result = await getContextManager().applyWindow(options?.history ?? [], options?.sessionId)
        windowedHistory = result.messages
      } catch {
        windowedHistory = options?.history ?? []
      }

      // 如果传入了 sessionId，从记忆服务中获取该会话的 L2 摘要（历史对话摘要 + 关键信息）
      let memorySummary = ''
      if (options?.sessionId) {
        try {
          const mem = getMemoryService()
          const l2 = mem.getLatestSummary(options.sessionId)
          if (l2) {
            memorySummary = `【历史对话摘要】\n${l2.summary}\n关键信息：${l2.keyFacts.join('、')}\n`
          }
        } catch { /* ignore */ }
      }

      const systemPrompt = this.buildSystemPrompt(options?.collection, memorySummary)
      const client = this.getClient(options)
      const maxIterations = 10
      const temperature = options?.temperature ?? 0.3

      // 累积每一步的 ReAct 记录（Thought/Action/Result/Observation），用于构造后续 LLM 调用的追踪链
      const steps: StepRecord[] = []

      for (let i = 0; i < maxIterations; i++) {
        // 构建本轮 LLM 调用的消息列表：包含滑动窗口后的历史 + 累积的 ReAct 追踪链
        const msgs: Anthropic.MessageParam[] = []

        // 将经过滑动窗口截断后的对话历史加入消息列表
        for (const h of windowedHistory) {
          msgs.push({ role: h.role as 'user' | 'assistant', content: h.content })
        }

        // 将累积的 ReAct 追踪链（之前步骤的 Thought/Action/Observation）拼入本轮消息
        // 首次迭代直接使用原始问题；后续迭代将整个追踪链作为 user 消息发送给 LLM
        if (steps.length === 0) {
          msgs.push({ role: 'user', content: trimmed })
        } else {
          // 从原始问题开始，构造完整的 ReAct 追踪链文本
          let trace = `原始问题: ${trimmed}\n\n`
          for (const s of steps) {
            trace += `Thought: ${s.thought}\n`
            trace += `Action: ${s.action.name}(${JSON.stringify(s.action.args)})\n`
            trace += `Observation: ${s.observation}\n\n`
          }
          trace += '请根据以上信息继续。'
          msgs.push({ role: 'user', content: trace })
        }

        // --- 步骤 1：调用 LLM 获取下一步的 Thought + Action/FinalAnswer ---
        const reactStart = Date.now()
        const response = await client.messages.create({
          model: 'deepseek-v4-flash',
          max_tokens: 512,
          temperature,
          system: systemPrompt,
          messages: msgs,
        })
        const reactDuration = Date.now() - reactStart
        const reactUsage = (response as any).usage
        getMonitorService().recordLLMMetric(
          'agent_reasoning', reactDuration,
          reactUsage?.input_tokens || 0, reactUsage?.output_tokens || 0,
          'deepseek-v4-flash', true
        )

        const content = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('')
          .trim()

        const parsed = parseReAct(content)

        // --- 步骤 2：发送 agent_thinking SSE 事件，将 LLM 的思考过程推送给前端 ---
        res.write(
          `data: ${JSON.stringify({ type: 'agent_thinking', content: parsed.thought || content })}\n\n`
        )

        // --- 步骤 3：判断是否为 Final Answer（LLM 已完成推理） ---
        if (parsed.finalAnswer) {
          // 非阻塞地将本轮对话写入记忆服务（L2 摘要检查点），不等待完成
          if (options?.sessionId) {
            const allMessages: ChatMessage[] = [
              ...(options?.history ?? []),
              { role: 'user', content: trimmed },
              { role: 'assistant', content: parsed.finalAnswer },
            ]
            getMemoryService().checkpoint(options.sessionId, allMessages).catch(() => {})
          }

          // 将最终答案以 token SSE 事件发送给前端，然后发送 [DONE] 结束流
          res.write(
            `data: ${JSON.stringify({ type: 'token', content: parsed.finalAnswer })}\n\n`
          )
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }

        // --- 步骤 4：LLM 决定调用工具，进入 Tool Execution ---
        if (parsed.action) {
          const { name, args } = parsed.action

          // 发送 agent_tool_use SSE 事件，告知前端 Agent 正在调用哪个工具
          res.write(
            `data: ${JSON.stringify({ type: 'agent_tool_use', tool: name, args })}\n\n`
          )

          // 通过 ToolRegistry 执行工具调用
          // 工具失败重试逻辑（P2-4）：首次失败后自动重试 1 次，仍失败则跳过
          const registry = getToolRegistry()
          let toolResult = await registry.execute(name, args)

          if (!toolResult.success) {
            // 重试 1 次
            toolResult = await registry.execute(name, args)
          }

          let observation: string
          if (!toolResult.success) {
            observation = `工具 "${name}" 调用失败: ${toolResult.error}。请尝试其他方式回答用户。`
          } else {
            observation = toolResult.data
              ? summarizeObservation(name, toolResult.data)
              : '工具返回空结果'
          }

          // 将本轮步骤记录到 steps 数组中，用于后续迭代构造 ReAct 追踪链
          steps.push({
            thought: parsed.thought,
            action: { name, args },
            result: toolResult,
            observation,
          })

          // 发送 agent_observation SSE 事件，将工具执行结果摘要推送给前端
          res.write(
            `data: ${JSON.stringify({ type: 'agent_observation', content: observation })}\n\n`
          )
        } else if (!parsed.finalAnswer) {
          // 降级处理：LLM 返回了文本但没有 Action 也没有 Final Answer（格式异常）
          // 非阻塞地将本轮对话写入记忆服务检查点
          if (options?.sessionId) {
            const answer = parsed.thought || content
            const allMessages: ChatMessage[] = [
              ...(options?.history ?? []),
              { role: 'user', content: trimmed },
              { role: 'assistant', content: answer },
            ]
            getMemoryService().checkpoint(options.sessionId, allMessages).catch(() => {})
          }

          // LLM 返回了文本但未包含 Action 和 Final Answer（格式不符预期）
          // 将 LLM 返回的思考内容本身作为最终答案发送给用户
          res.write(
            `data: ${JSON.stringify({ type: 'token', content: parsed.thought || content })}\n\n`
          )
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }
      }

      // 达到最大迭代次数（maxIterations=10），未能得出最终答案，输出超时提示
      if (options?.sessionId) {
        const allMessages: ChatMessage[] = [
          ...(options?.history ?? []),
          { role: 'user', content: trimmed },
        ]
        getMemoryService().checkpoint(options.sessionId, allMessages).catch(() => {})
      }
      res.write(
        `data: ${JSON.stringify({ type: 'token', content: '我已经尝试了多种方法但仍未能完整回答问题。请尝试简化或重新描述您的问题。' })}\n\n`
      )
      res.write('data: [DONE]\n\n')
      res.end()
    } catch (err: any) {
      // 捕获 streamChat 中的未处理异常，记录错误日志并通过 SSE 发送 error 事件
      getMonitorService().logError('error', err.message || 'Agent 处理异常', 'agent')
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: err.message || 'Agent 处理异常' })}\n\n`
      )
      res.end()
    }
  }
  /**
   * 非流式 ReAct 执行 — 返回结构化结果而非 SSE 流。
   *
   * 与 streamChat() 逻辑相同，但：
   *   - 不输出 SSE 事件，直接返回 { answer, steps, totalTokens }
   *   - 累积 Token 消耗到 totalTokens 中
   *   - 用于 Agent 评估系统（P7-3）批量运行测试用例
   *
   * @param userMessage - 用户输入的消息
   * @param options - Agent 执行选项
   * @returns 包含最终答案、步骤记录和 Token 数的结构化结果
   */
  async executeAgent(
    userMessage: string,
    options?: AgentOptions
  ): Promise<{ answer: string; steps: StepRecord[]; totalTokens: number }> {
    const trimmed = userMessage.trim()
    if (!trimmed) {
      throw new Error('消息不能为空')
    }

    // 对对话历史应用滑动窗口策略（P6）
    let windowedHistory: ChatMessage[] = options?.history ?? []
    try {
      const result = await getContextManager().applyWindow(options?.history ?? [], options?.sessionId)
      windowedHistory = result.messages
    } catch {
      windowedHistory = options?.history ?? []
    }

    // 如果传入了 sessionId，从记忆服务获取 L2 摘要
    let memorySummary = ''
    if (options?.sessionId) {
      try {
        const mem = getMemoryService()
        const l2 = mem.getLatestSummary(options.sessionId)
        if (l2) {
          memorySummary = `【历史对话摘要】\n${l2.summary}\n关键信息：${l2.keyFacts.join('、')}\n`
        }
      } catch { /* ignore */ }
    }

    const systemPrompt = this.buildSystemPrompt(options?.collection, memorySummary)
    const client = this.getClient(options)
    const maxIterations = 10
    const temperature = options?.temperature ?? 0.3
    const steps: StepRecord[] = []
    let totalTokens = 0

    for (let i = 0; i < maxIterations; i++) {
      // 构建本轮 LLM 调用的消息列表（滑动窗口历史 + ReAct 追踪链）
      const msgs: Anthropic.MessageParam[] = []

      for (const h of windowedHistory) {
        msgs.push({ role: h.role as 'user' | 'assistant', content: h.content })
      }

      if (steps.length === 0) {
        msgs.push({ role: 'user', content: trimmed })
      } else {
        let trace = `原始问题: ${trimmed}\n\n`
        for (const s of steps) {
          trace += `Thought: ${s.thought}\n`
          trace += `Action: ${s.action.name}(${JSON.stringify(s.action.args)})\n`
          trace += `Observation: ${s.observation}\n\n`
        }
        trace += '请根据以上信息继续。'
        msgs.push({ role: 'user', content: trace })
      }

      // 调用 LLM 获取下一步的 Thought + Action/FinalAnswer
      const response = await client.messages.create({
        model: 'deepseek-v4-flash',
        max_tokens: 512,
        temperature,
        system: systemPrompt,
        messages: msgs,
      })

      const usage = (response as any).usage
      totalTokens += (usage?.input_tokens || 0) + (usage?.output_tokens || 0)

      getMonitorService().recordLLMMetric(
        'agent_reasoning', 0,
        usage?.input_tokens || 0, usage?.output_tokens || 0,
        'deepseek-v4-flash', true
      )

      const content = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()

      const parsed = parseReAct(content)

      if (parsed.finalAnswer) {
        if (options?.sessionId) {
          const allMessages: ChatMessage[] = [
            ...(options?.history ?? []),
            { role: 'user', content: trimmed },
            { role: 'assistant', content: parsed.finalAnswer },
          ]
          getMemoryService().checkpoint(options.sessionId, allMessages).catch(() => {})
        }
        return { answer: parsed.finalAnswer, steps, totalTokens }
      }

      if (parsed.action) {
        const { name, args } = parsed.action
        const registry = getToolRegistry()
        let toolResult = await registry.execute(name, args)

        if (!toolResult.success) {
          toolResult = await registry.execute(name, args)
        }

        let observation: string
        if (!toolResult.success) {
          observation = `工具 "${name}" 调用失败: ${toolResult.error}。请尝试其他方式回答用户。`
        } else {
          observation = toolResult.data
            ? summarizeObservation(name, toolResult.data)
            : '工具返回空结果'
        }

        steps.push({
          thought: parsed.thought,
          action: { name, args },
          result: toolResult,
          observation,
        })
      } else if (!parsed.finalAnswer) {
        const answer = parsed.thought || content
        if (options?.sessionId) {
          const allMessages: ChatMessage[] = [
            ...(options?.history ?? []),
            { role: 'user', content: trimmed },
            { role: 'assistant', content: answer },
          ]
          getMemoryService().checkpoint(options.sessionId, allMessages).catch(() => {})
        }
        // 降级处理：LLM 返回文本但无 Action/Final Answer，将思考内容作为答案返回
        return { answer, steps, totalTokens }
      }
    }

    // 达到最大迭代次数（maxIterations=10），未能得出最终答案
    if (options?.sessionId) {
      const allMessages: ChatMessage[] = [
        ...(options?.history ?? []),
        { role: 'user', content: trimmed },
      ]
      getMemoryService().checkpoint(options.sessionId, allMessages).catch(() => {})
    }
    return {
      answer: '我已经尝试了多种方法但仍未能完整回答问题。请尝试简化或重新描述您的问题。',
      steps,
      totalTokens,
    }
  }
}

// ---- Singleton 模式 ----

/**
 * 缓存的 AgentService 单例实例
 */
let agentServiceInstance: AgentService | null = null

/**
 * 获取 AgentService 的单例实例。
 * 遵循项目的 Singleton 服务层规范，首次调用时创建实例，后续复用。
 * 所有模块通过此函数获取 AgentService，而非直接 new。
 */
export function getAgentService(): AgentService {
  if (!agentServiceInstance) {
    agentServiceInstance = new AgentService()
  }
  return agentServiceInstance
}
