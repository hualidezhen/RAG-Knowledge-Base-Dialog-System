/**
 * P6: 对话历史滑动窗口与摘要管理
 *
 * Tests token estimation, sliding window truncation, and
 * token budget truncation in ContextManager.
 *
 * NOTE: Tests requiring DEEPSEEK_API_KEY will be skipped if not configured.
 */

import { describe, it, expect } from 'vitest'
import { getContextManager } from '../services/contextManager'
import { ChatMessage } from '../types'

const hasApiKey =
  process.env.DEEPSEEK_API_KEY &&
  process.env.DEEPSEEK_API_KEY !== 'your_key_here'

// ---- P6-3: Token Count ----

describe('P6-3: Token 计数', () => {
  const cm = getContextManager()

  it('纯中文文本应估算正确（约 1 token / 2 字）', () => {
    // '你好世界' = 4 Chinese chars → ceil(4/2) = 2
    const count = cm.estimateTokens('你好世界')
    expect(count).toBe(2)
  })

  it('纯英文文本应估算正确（约 1 token / 4 字符）', () => {
    // 'Hello World' = 10 non-Chinese chars → no Chinese, so englishChars = 10 → ceil(10/4) = 3
    const count = cm.estimateTokens('Hello World')
    expect(count).toBe(3)
  })

  it('混合文本应估算正确', () => {
    // 'Hello' = 5 english → ceil(5/4) = 2, '你好' = 2 chinese → ceil(2/2) = 1
    // english uppercase is \S, not Chinese range, so englishChars
    const count = cm.estimateTokens('Hello 你好')
    expect(count).toBe(3)
  })

  it('空字符串应返回 0', () => {
    const count = cm.estimateTokens('')
    expect(count).toBe(0)
  })
})

// ---- P6-1: Sliding Window ----

describe('P6-1: 滑动窗口策略', () => {
  const cm = getContextManager()

  function makeHistory(count: number): ChatMessage[] {
    const history: ChatMessage[] = []
    for (let i = 1; i <= count; i++) {
      history.push({ role: 'user', content: `用户消息 ${i}` })
      history.push({ role: 'assistant', content: `助手回复 ${i}` })
    }
    return history
  }

  it('未超阈值（<=6 条）不应截断', async () => {
    const history = makeHistory(2) // 4 messages
    const result = await cm.applyWindow(history)
    expect(result.messages.length).toBe(4)
    expect(result.summary).toBe('')
  })

  it('超阈值（>6 条）应截断到最近 6 条', async () => {
    if (!hasApiKey) return

    const history = makeHistory(4) // 8 messages
    const result = await cm.applyWindow(history)
    expect(result.messages.length).toBeLessThanOrEqual(6)
  })

  it('正好 6 条不应截断', async () => {
    const history = makeHistory(3) // 6 messages
    const result = await cm.applyWindow(history)
    expect(result.messages.length).toBe(6)
    expect(result.summary).toBe('')
  })
})

// ---- P6-2: Token Budget Truncation ----

describe('P6-2: Token 预算截断', () => {
  const cm = getContextManager()

  function makeLargeHistory(): ChatMessage[] {
    const history: ChatMessage[] = []
    for (let i = 1; i <= 5; i++) {
      history.push({
        role: 'user' as const,
        content: 'A'.repeat(200) + '用户消息 ' + i, // ~50 + tokens each
      })
      history.push({
        role: 'assistant' as const,
        content: 'B'.repeat(200) + '助手回复 ' + i,
      })
    }
    return history // 10 messages, each ~50-60 tokens ≈ 500+ total
  }

  it('未超预算不应截断', async () => {
    const history = makeLargeHistory()
    const totalTokens = history.reduce(
      (sum, m) => sum + cm.estimateTokens(m.content),
      0
    )
    // Use a large budget
    const result = await cm.truncateByTokenBudget(history, totalTokens + 1000)
    expect(result.messages.length).toBe(history.length)
    expect(result.summary).toBe('')
  })

  it('超预算应截断并生成摘要', async () => {
    if (!hasApiKey) return

    const history = makeLargeHistory()
    const result = await cm.truncateByTokenBudget(history, 100)
    expect(result.messages.length).toBeLessThan(history.length)
  })

  it('超预算且无 API key 不应抛出', async () => {
    const history = makeLargeHistory()
    // Should not throw even if LLM call fails
    await expect(
      cm.truncateByTokenBudget(history, 1)
    ).resolves.toBeDefined()
  }, 10000)
})

// ---- P6-4: Empty history ----

describe('P6-4: 边界情况', () => {
  it('空历史应返回空数组', async () => {
    const cm = getContextManager()
    const result = await cm.applyWindow([])
    expect(result.messages).toEqual([])
    expect(result.summary).toBe('')
  })

  it('单条消息不应截断', async () => {
    const cm = getContextManager()
    const history: ChatMessage[] = [
      { role: 'user', content: '你好' },
    ]
    const result = await cm.applyWindow(history)
    expect(result.messages.length).toBe(1)
  })
})
