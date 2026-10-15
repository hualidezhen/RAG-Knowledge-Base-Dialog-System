/**
 * 对话历史滑动窗口与上下文管理。
 * 负责控制传递给 LLM 的消息数量与 Token 开销：
 * - 保留最近 6 轮对话（滑动窗口）
 * - 超出部分自动生成摘要以压缩上下文
 * - Token 预算超过 2000 时触发截断
 */

import Anthropic from '@anthropic-ai/sdk'

import { ChatMessage } from '../types'

const MAX_HISTORY_TURNS = 6    // 最多保留的对话轮数（每轮含 user + assistant）
const MAX_TOKEN_BUDGET = 2000  // 估算 Token 预算上限

export class ContextManager {
  private anthropic: Anthropic | null = null

  /** 确保 Anthropic SDK 客户端已初始化，使用 DeepSeek 兼容接口 */
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
   * 启发式估算中英文混合文本的 Token 数量。
   * 中文字符 ~0.5 token/字，英文字符 ~0.25 token/字符。
   * @param text 待估算的文本
   * @returns 估算的 Token 数（向上取整）
   */
  estimateTokens(text: string): number {
    let chineseChars = 0
    let englishChars = 0
    for (const ch of text) {
      if (/[一-鿿㐀-䶿]/.test(ch)) {
        chineseChars++
      } else if (/\S/.test(ch)) {
        englishChars++
      }
    }
    return Math.ceil(chineseChars / 2) + Math.ceil(englishChars / 4)
  }

  /**
   * 应用滑动窗口策略：保留最近 N 轮对话，为被截断的早期对话生成摘要。
   * 任何异常下静默降级，返回完整历史（永不抛出异常）。
   * @param history   完整的对话历史
   * @param _sessionId 会话 ID（暂未使用，保留接口）
   * @returns 截断后的消息数组 + 摘要文本
   */
  async applyWindow(
    history: ChatMessage[],
    _sessionId?: string
  ): Promise<{ messages: ChatMessage[]; summary: string }> {
    try {
      if (history.length <= MAX_HISTORY_TURNS) {
        return { messages: history, summary: '' }
      }

      const keepCount = MAX_HISTORY_TURNS
      const truncated = history.slice(0, -keepCount)
      const keep = history.slice(-keepCount)

      // 异步生成摘要，不阻塞请求响应
      const summaryPromise = this.generateEphemeralSummary(truncated)

      // 立即返回保留的消息
      return {
        messages: keep,
        summary: await summaryPromise,
      }
    } catch {
      return { messages: history, summary: '' }
    }
  }

  /**
   * 按 Token 预算截断：当总估算 Token 超过预算时，从最早的消息开始移除，
   * 直到低于预算为止。始终至少保留 1 轮对话（2 条消息）。
   * @param history    完整的对话历史
   * @param maxBudget  Token 预算上限，默认 2000
   * @param _sessionId 会话 ID（暂未使用，保留接口）
   * @returns 截断后的消息数组 + 摘要文本
   */
  async truncateByTokenBudget(
    history: ChatMessage[],
    maxBudget: number = MAX_TOKEN_BUDGET,
    _sessionId?: string
  ): Promise<{ messages: ChatMessage[]; summary: string }> {
    try {
      const totalTokens = history.reduce(
        (sum, m) => sum + this.estimateTokens(m.content),
        0
      )
      if (totalTokens <= maxBudget) {
        return { messages: history, summary: '' }
      }

      const result = [...history]
      const removed: ChatMessage[] = []

      while (result.length > 2) {
        const removedMsg = result.shift()!
        removed.push(removedMsg)
        const currentTokens = result.reduce(
          (s, m) => s + this.estimateTokens(m.content),
          0
        )
        if (currentTokens <= maxBudget) break
      }

      let summary = ''
      if (removed.length > 0) {
        summary = await this.generateEphemeralSummary(removed)
      }

      return { messages: result, summary }
    } catch {
      return { messages: history, summary: '' }
    }
  }

  /**
   * 调用 LLM 为被截断的对话生成简洁摘要（私有方法，不对外暴露）。
   * 调用失败时静默返回空字符串，不中断主流程。
   * @param messages 需要生成摘要的对话消息
   * @returns 摘要文本，失败时返回空字符串
   */
  private async generateEphemeralSummary(
    messages: ChatMessage[]
  ): Promise<string> {
    if (messages.length === 0) return ''

    const client = this.ensureClient()

    const historyStr = messages
      .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .join('\n')

    const prompt = `请对以下对话片段生成简洁摘要（50字以内），提取关键信息。

对话：
${historyStr}

只输出摘要内容，不要额外格式。`

    try {
      const response = await client.messages.create({
        model: 'deepseek-v4-flash',
        max_tokens: 256,
        temperature: 0,
        system: '你是一个对话摘要生成助手。只输出摘要文本。',
        messages: [{ role: 'user', content: prompt }],
      })

      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()
    } catch (err: any) {
      console.warn(`[ContextManager] Summary generation failed: ${err.message}`)
      return ''
    }
  }
}

// ---- Singleton 单例模式 ----

let instance: ContextManager | null = null

export function getContextManager(): ContextManager {
  if (!instance) {
    instance = new ContextManager()
  }
  return instance
}
