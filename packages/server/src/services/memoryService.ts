/**
 * 记忆管理服务 — 三层记忆系统的持久化与检索实现
 *
 * 整体架构：
 *   L1（瞬时记忆）：对话历史滑动窗口（由 contextManager 管理），保留最近 N 轮对话
 *   L2（短期记忆）：对话摘要（Conversation Summary），每 4 轮对话后由 LLM 生成摘要和关键事实，
 *                   以 JSON 文件形式存储在 data/memories/{sessionId}/ 目录下
 *   L3（长期记忆）：语义记忆（Semantic Memory），从对话中提取关键事实，通过 Embedding 存入
 *                   ChromaDB（collection: memory_store），支持向量相似性检索
 *
 * 数据流：
 *   每次对话响应完成后调用 checkpoint() → 更新消息计数 → 触发 L2 摘要生成 →
 *   提取 keyFacts 写入 L3 ChromaDB → 触发自动维护合并
 */

import * as path from 'path'
import * as fs from 'fs'

import Anthropic from '@anthropic-ai/sdk'

import { ChatMessage } from '../types'
import { getEmbeddings, getOrCreateCollection } from './vectorStoreService'

// ---- 类型定义 ----

/** L2 对话摘要记忆 — 由 LLM 对多轮对话生成的摘要及关键事实 */
interface L2Memory {
  sessionId: string     // 所属会话 ID
  summary: string       // 对话摘要文本（100 字以内）
  keyFacts: string[]    // 提取的关键事实列表
  timestamp: string     // 摘要生成时间（ISO 8601）
  messageCount: number  // 触发摘要时的消息总数，用于排序和去重
}

/** 会话元信息 — 会话列表中的基本描述 */
interface SessionMeta {
  id: string            // 唯一会话 ID（格式: sess_xxx）
  name: string          // 会话显示名称（默认: "对话 <创建时间>"）
  createdAt: string     // 创建时间（ISO 8601）
  messageCount: number  // 累计消息数
}

// ---- 持久化路径 ----

/** 记忆数据根目录 */
const MEMORIES_DIR = path.resolve(__dirname, '../../data/memories')
/** 会话列表文件 */
const SESSIONS_FILE = path.resolve(__dirname, '../../data/memories/sessions.json')

// ---- Helpers ----

/** 确保 data/memories/ 目录存在，不存在则递归创建 */
function ensureDir() {
  if (!fs.existsSync(MEMORIES_DIR)) {
    fs.mkdirSync(MEMORIES_DIR, { recursive: true })
  }
}

/**
 * 从 data/memories/sessions.json 加载所有会话元信息
 * 文件损坏或不存在时返回空数组
 */
function loadSessions(): SessionMeta[] {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'))
    }
  } catch {
    /* 文件损坏 — 重置为空 */
  }
  return []
}

/** 将会话列表写回 data/memories/sessions.json */
function saveSessions(sessions: SessionMeta[]) {
  ensureDir()
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8')
}

/**
 * 从 data/memories/{sessionId}/ 目录加载该会话的所有 L2 摘要文件
 * 文件名格式: summary_{messageCount}.json，按 messageCount 升序排列
 */
function loadL2Summaries(sessionId: string): L2Memory[] {
  const dir = path.join(MEMORIES_DIR, sessionId)
  try {
    if (!fs.existsSync(dir)) return []
    const files = fs.readdirSync(dir)
      .filter((f) => f.startsWith('summary_'))
      .sort()
    return files.map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf-8')
      return JSON.parse(raw) as L2Memory
    })
  } catch {
    return []
  }
}

/**
 * 将 L2 摘要保存至 data/memories/{sessionId}/summary_{messageCount}.json
 * 使用 messageCount 作为索引，便于排序和后续按索引删除
 */
function saveL2Summary(sessionId: string, memory: L2Memory) {
  const dir = path.join(MEMORIES_DIR, sessionId)
  ensureDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const idx = memory.messageCount
  fs.writeFileSync(
    path.join(dir, `summary_${idx}.json`),
    JSON.stringify(memory, null, 2),
    'utf-8'
  )
}

/**
 * 删除指定会话的多个 L2 摘要文件（使用 messageCount 索引定位文件）
 * 用于自动维护时的旧摘要清理
 */
function deleteL2Summaries(sessionId: string, indices: number[]) {
  const dir = path.join(MEMORIES_DIR, sessionId)
  for (const idx of indices) {
    const file = path.join(dir, `summary_${idx}.json`)
    try { fs.unlinkSync(file) } catch { /* ignore */ }
  }
}

/** 生成唯一会话 ID：前缀 sess_ + 时间戳（36 进制）+ 随机数（36 进制取 6 位） */
function generateId(): string {
  return 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ---- MemoryService 类 — 管理 L2 对话摘要和 L3 语义记忆的全生命周期 ----

export class MemoryService {
  /** Anthropic SDK 客户端（延迟初始化） */
  private anthropic: Anthropic | null = null

  /**
   * 确保 Anthropic 客户端已初始化
   * 从环境变量读取 DEEPSEEK_API_KEY，使用 DeepSeek 兼容接口（Anthropic 协议）
   */
  private ensureClient(): Anthropic {
    if (!this.anthropic) {
      const apiKey = process.env.DEEPSEEK_API_KEY
      if (!apiKey || apiKey === 'your_key_here') {
        throw new Error('DEEPSEEK_API_KEY 未配置')
      }
      this.anthropic = new Anthropic({
        apiKey,
        baseURL: process.env.DEEPSEEK_ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic',
      })
    }
    return this.anthropic
  }

  // ---- 会话管理 (P3-3) ----

  /**
   * 创建新会话
   * 生成唯一 ID，设置默认名称（"对话 <创建时间>"），插入列表头部
   */
  createSession(name?: string): SessionMeta {
    const sessions = loadSessions()
    const session: SessionMeta = {
      id: generateId(),
      name: name || `对话 ${new Date().toLocaleString('zh-CN')}`,
      createdAt: new Date().toISOString(),
      messageCount: 0,
    }
    sessions.unshift(session)
    saveSessions(sessions)
    return session
  }

  /** 按 ID 获取会话元信息 */
  getSession(id: string): SessionMeta | undefined {
    return loadSessions().find((s) => s.id === id)
  }

  /** 获取所有会话列表 */
  listSessions(): SessionMeta[] {
    return loadSessions()
  }

  /**
   * 删除会话及其关联的所有记忆数据
   * 清理项：
   *   1. 会话列表中的条目
   *   2. data/memories/{id}/ 下的所有 L2 摘要文件
   *   3. ChromaDB memory_store collection 中的 L3 语义记忆
   */
  deleteSession(id: string): boolean {
    const sessions = loadSessions().filter((s) => s.id !== id)
    saveSessions(sessions)

    // 删除 L2 摘要文件目录
    const dir = path.join(MEMORIES_DIR, id)
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    } catch { /* ignore */ }

    // 删除 L3 语义记忆（ChromaDB）
    try {
      this.deleteL3Memories(id).catch(() => {})
    } catch { /* ignore */ }

    return true
  }

  // ---- L2: 对话摘要 (P3-1) ----
  // 触发条件：每 4 轮对话（8 条消息：4 条 user + 4 条 assistant）后自动生成
  // 使用 LLM 对历史对话生成 JSON 格式的摘要和关键事实

  /**
   * 使用 LLM 对对话历史生成 L2 摘要
   * @param sessionId - 会话 ID
   * @param messages - 完整的对话消息列表
   * @returns L2Memory 对象（摘要文本 + 关键事实列表）
   *
   * Prompt 结构：
   *   1. System: "你是一个对话摘要生成助手。只输出JSON，不要其他内容。"
   *   2. User:  包含完整对话历史 + 要求输出 JSON 格式的指令
   *
   * 容错：LLM 输出可能包含 Markdown 包裹（```json...```），
   *       使用正则 /\{[\s\S]*\}/ 提取 JSON；解析失败时回退为纯文本截取
   */
  async generateSummary(sessionId: string, messages: ChatMessage[]): Promise<L2Memory> {
    const client = this.ensureClient()

    const historyStr = messages
      .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .join('\n')

    const prompt = `请对以下对话生成摘要，提取关键事实。

对话：
${historyStr}

请以JSON格式输出：
{
  "summary": "对话摘要（100字以内）",
  "keyFacts": ["关键事实1", "关键事实2", ...]
}`
    const response = await client.messages.create({
      model: 'deepseek-v4-flash',
      max_tokens: 512,
      temperature: 0,
      system: '你是一个对话摘要生成助手。只输出JSON，不要其他内容。',
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    let parsed: { summary: string; keyFacts: string[] }
    try {
      // 尝试从响应中提取 JSON（可能被 Markdown 代码块包裹）
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text)
    } catch {
      // 降级：将原始文本截取前 200 字符作为摘要
      parsed = { summary: text.slice(0, 200), keyFacts: [] }
    }

    return {
      sessionId,
      summary: parsed.summary || text.slice(0, 200),
      keyFacts: parsed.keyFacts || [],
      timestamp: new Date().toISOString(),
      messageCount: messages.length,
    }
  }

  /** 获取该会话最新的 L2 摘要（列表末尾的元素） */
  getLatestSummary(sessionId: string): L2Memory | null {
    const summaries = loadL2Summaries(sessionId)
    return summaries.length > 0 ? summaries[summaries.length - 1] : null
  }

  /** 获取该会话的所有 L2 摘要（按消息数升序） */
  getAllSummaries(sessionId: string): L2Memory[] {
    return loadL2Summaries(sessionId)
  }

  // ---- L3: 语义记忆 (P3-2) ----
  // 将对话中提取的关键事实通过 Embedding 向量化后存入 ChromaDB
  // Collection 名称: memory_store（全局共享，通过 sessionId 元数据区分会话）

  /**
   * 将关键事实向量化后存入 ChromaDB（memory_store collection）
   * 每条事实的 metadata 包含 sessionId 和 type: 'fact'，便于按会话过滤
   * ID 格式: fact_{sessionId}_{timestamp}_{index}
   */
  async storeFacts(sessionId: string, facts: string[]): Promise<void> {
    if (facts.length === 0) return

    try {
      const collection = await getOrCreateCollection('memory_store')
      const embedder = await getEmbeddings()

      const now = Date.now()
      const ids = facts.map((_, i) => `fact_${sessionId}_${now}_${i}`)
      const documents = facts
      const metadatas = facts.map(() => ({
        sessionId,
        type: 'fact',
        timestamp: new Date().toISOString(),
      }))

      const vectors = await embedder.embedDocuments(facts)

      await collection.add({
        ids,
        embeddings: vectors,
        metadatas,
        documents,
      })
    } catch (err: any) {
      console.warn(`[MemoryService] L3 事实存储失败: ${err.message}`)
    }
  }

  /**
   * 通过向量相似性检索与 query 相关的 L3 语义记忆
   * 使用 ChromaDB 的 query 接口，按 sessionId 过滤，返回最相关的事实文本
   * @param topK - 请求数量（实际查询 topK*2 以对抗空值过滤后的减少）
   */
  async retrieveRelevantMemories(
    sessionId: string,
    query: string,
    topK: number = 5
  ): Promise<string[]> {
    try {
      const collection = await getOrCreateCollection('memory_store')
      const embedder = await getEmbeddings()
      const vector = await embedder.embedQuery(query)

      const result = await collection.query({
        queryEmbeddings: [vector],
        nResults: topK * 2,
        where: { sessionId },
      })

      const docs = result.documents?.[0] ?? []
      return docs.filter((d): d is string => d !== null)
    } catch {
      return []
    }
  }

  /** 删除 ChromaDB 中指定会话的所有 L3 语义记忆（按 sessionId 过滤） */
  private async deleteL3Memories(sessionId: string): Promise<void> {
    try {
      const collection = await getOrCreateCollection('memory_store')
      await collection.delete({ where: { sessionId } })
    } catch { /* ignore */ }
  }

  // ---- 自动维护 (P3-5) ----
  // 当 L2 摘要数量超过 10 个时，合并最旧的 5 个为一篇新摘要
  // 避免摘要文件无限增长

  /**
   * L2 摘要自动合并维护
   * 触发条件：摘要数量 > 10
   * 合并策略：
   *   1. 选取最旧的 5 个摘要
   *   2. 调用 LLM 合并去重，生成新的综合摘要（150 字以内）
   *   3. 保存新摘要
   *   4. 删除原来的 5 个旧摘要文件
   */
  async autoMaintain(sessionId: string): Promise<void> {
    const summaries = loadL2Summaries(sessionId)
    if (summaries.length <= 10) return

    // 合并最旧的 5 个摘要
    const toMerge = summaries.slice(0, 5)
    const mergeText = toMerge
      .map((s, i) => `[摘要 ${i + 1}]: ${s.summary}\n关键事实: ${s.keyFacts.join(', ')}`)
      .join('\n\n')

    const client = this.ensureClient()
    const prompt = `请合并以下多个对话摘要为一个综合摘要，去重并保留所有关键信息。

${mergeText}

以JSON格式输出：
{
  "summary": "合并后的摘要（150字以内）",
  "keyFacts": ["去重后的关键事实列表"]
}`

    try {
      const response = await client.messages.create({
        model: 'deepseek-v4-flash',
        max_tokens: 512,
        temperature: 0,
        system: '你是一个对话摘要合并助手。只输出JSON。',
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()

      const jsonMatch = text.match(/\{[\s\S]*\}/)
      const merged = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: text, keyFacts: [] }

      const mergedSummary: L2Memory = {
        sessionId,
        summary: merged.summary || '',
        keyFacts: merged.keyFacts || [],
        timestamp: new Date().toISOString(),
        messageCount: summaries[summaries.length - 1].messageCount,
      }

      // 保存合并后的新摘要
      saveL2Summary(sessionId, mergedSummary)

      // 删除原始的 5 个旧摘要文件
      const indicesToRemove = toMerge.map((s) => s.messageCount)
      deleteL2Summaries(sessionId, indicesToRemove)
    } catch (err: any) {
      console.warn(`[MemoryService] 自动维护失败: ${err.message}`)
    }
  }

  // ---- Checkpoint：每次对话响应完成后调用 ----
  // 完整触发链路：
  //   1. 更新会话消息计数
  //   2. 检查是否达到 4 轮对话（8 条消息）的阈值
  //   3. 是 → 调用 generateSummary 生成 L2 摘要
  //   4.      → 保存摘要文件
  //   5.      → 提取 keyFacts 存入 L3 ChromaDB
  //   6.      → 触发 autoMaintain 检查是否需要合并
  //   7. 否 → 跳过，等待后续对话累积

  /**
   * 记忆检查点：每次对话完成后调用，串联整个记忆写入链路
   * @param sessionId - 当前会话 ID
   * @param messages  - 当前会话的完整消息列表
   *
   * 触发条件：
   *   - 消息总数 >= 8 且为 4 的倍数（每 4 轮对话 = 8 条消息）
   *   - 即第 8、12、16... 条消息时触发
   */
  async checkpoint(sessionId: string, messages: ChatMessage[]): Promise<void> {
    try {
      const sessions = loadSessions()
      const session = sessions.find((s) => s.id === sessionId)
      if (session) {
        session.messageCount = messages.length
        saveSessions(sessions)
      }

      // 每 4 轮对话（8 条消息：4 条 user + 4 条 assistant）生成一次 L2 摘要
      if (messages.length >= 8 && messages.length % 4 === 0) {
        const summary = await this.generateSummary(sessionId, messages)
        saveL2Summary(sessionId, summary)

        // 将关键事实写入 L3 语义记忆（ChromaDB）
        if (summary.keyFacts.length > 0) {
          await this.storeFacts(sessionId, summary.keyFacts)
        }

        // 检查是否需要合并旧摘要
        await this.autoMaintain(sessionId)
      }
    } catch (err: any) {
      console.warn(`[MemoryService] Checkpoint 失败: ${err.message}`)
    }
  }
}

// ---- Singleton 模式 ----
// 遵循编码规范 2.3 节：所有 Service 必须使用 Singleton
// getMemoryService() 保证全局只有一个 MemoryService 实例

let memoryServiceInstance: MemoryService | null = null

export function getMemoryService(): MemoryService {
  if (!memoryServiceInstance) {
    memoryServiceInstance = new MemoryService()
  }
  return memoryServiceInstance
}
