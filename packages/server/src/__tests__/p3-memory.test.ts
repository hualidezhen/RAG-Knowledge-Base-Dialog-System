/**
 * P3: 结构化记忆管理
 *
 * Tests session CRUD, L2 summary generation, L3 semantic memory,
 * auto-maintenance, checkpoint, and cascade cleanup.
 *
 * NOTE: Tests requiring DEEPSEEK_API_KEY will be skipped if not configured.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'
import { getMemoryService } from '../services/memoryService'
import { ChatMessage } from '../types'

const hasApiKey =
  process.env.DEEPSEEK_API_KEY &&
  process.env.DEEPSEEK_API_KEY !== 'your_key_here'

const MEMORIES_DIR = path.resolve(__dirname, '../../data/memories')

beforeEach(() => {
  // Clean up any leftover test sessions
  const service = getMemoryService()
  for (const s of service.listSessions()) {
    if (s.id.startsWith('sess_') && s.name.includes('测试') || s.name.includes('test')) {
      try { service.deleteSession(s.id) } catch { /* ignore */ }
    }
  }
})

afterEach(() => {
  // Clean up sessions created during tests
  const service = getMemoryService()
  for (const s of service.listSessions()) {
    if (s.id.startsWith('sess_') && s.name.includes('测试') || s.name.includes('test') || s.name.includes('MEMORY')) {
      try { service.deleteSession(s.id) } catch { /* ignore */ }
    }
  }
})

// ---- P3-3: Session CRUD ----

describe('P3-3: 会话管理', () => {
  it('createSession 应创建新会话并返回 id', () => {
    const service = getMemoryService()
    const session = service.createSession('测试会话')
    expect(session).toHaveProperty('id')
    expect(session).toHaveProperty('name', '测试会话')
    expect(session).toHaveProperty('createdAt')
    expect(session).toHaveProperty('messageCount', 0)
  })

  it('getSession 应返回已创建的会话', () => {
    const service = getMemoryService()
    const created = service.createSession('测试会话 get')
    const found = service.getSession(created.id)
    expect(found).toBeDefined()
    expect(found!.id).toBe(created.id)
  })

  it('getSession 对不存在的 id 应返回 undefined', () => {
    const service = getMemoryService()
    const found = service.getSession('nonexistent-session-id')
    expect(found).toBeUndefined()
  })

  it('listSessions 应返回所有会话', () => {
    const service = getMemoryService()
    const before = service.listSessions().length
    service.createSession('测试会话 list')
    const after = service.listSessions().length
    expect(after).toBe(before + 1)
  })

  it('deleteSession 应删除会话', () => {
    const service = getMemoryService()
    const session = service.createSession('测试会话 delete')
    const result = service.deleteSession(session.id)
    expect(result).toBe(true)
    expect(service.getSession(session.id)).toBeUndefined()
  })

  it('deleteSession 应清理 L2 摘要目录', () => {
    const service = getMemoryService()
    const session = service.createSession('测试会话 cascade')
    const sessionDir = path.join(MEMORIES_DIR, session.id)
    // Create a fake summary file
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true })
    fs.writeFileSync(path.join(sessionDir, 'summary_1.json'), '{}', 'utf-8')
    expect(fs.existsSync(sessionDir)).toBe(true)

    service.deleteSession(session.id)
    expect(fs.existsSync(sessionDir)).toBe(false)
  })
})

// ---- P3-1: L2 Summary ----

describe('P3-1: L2 对话摘要', () => {
  it('getLatestSummary 无摘要时应返回 null', () => {
    const service = getMemoryService()
    const result = service.getLatestSummary('nonexistent-session')
    expect(result).toBeNull()
  })

  it('getAllSummaries 无摘要时应返回空数组', () => {
    const service = getMemoryService()
    const result = service.getAllSummaries('nonexistent-session')
    expect(result).toEqual([])
  })

  it('generateSummary 应返回 L2Memory 结构', async () => {
    if (!hasApiKey) return

    const service = getMemoryService()
    const session = service.createSession('MEMORY SUMMARY TEST')
    const messages: ChatMessage[] = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！有什么可以帮助你的吗？' },
    ]

    const result = await service.generateSummary(session.id, messages)
    expect(result).toHaveProperty('sessionId', session.id)
    expect(result).toHaveProperty('summary')
    expect(result).toHaveProperty('keyFacts')
    expect(Array.isArray(result.keyFacts)).toBe(true)
    expect(result).toHaveProperty('messageCount', 2)

    service.deleteSession(session.id)
  }, 30000)
})

// ---- P3-2: L3 Semantic Memory ----

describe('P3-2: L3 语义记忆', () => {
  it('storeFacts 不应抛出异常', async () => {
    const service = getMemoryService()
    // Should not throw even if ChromaDB is unavailable
    await expect(
      service.storeFacts('test-session', ['fact 1', 'fact 2'])
    ).resolves.toBeUndefined()
  })

  it('storeFacts 空数组应静默返回', async () => {
    const service = getMemoryService()
    await expect(
      service.storeFacts('test-session', [])
    ).resolves.toBeUndefined()
  })

  it('retrieveRelevantMemories 应返回数组（可能为空）', async () => {
    const service = getMemoryService()
    const result = await service.retrieveRelevantMemories('test-session', 'test query')
    expect(Array.isArray(result)).toBe(true)
  })
})

// ---- P3-5: Auto-maintenance ----

describe('P3-5: 记忆自动维护', () => {
  it('autoMaintain 摘要数 <=10 时应直接返回', async () => {
    if (!hasApiKey) return

    const service = getMemoryService()
    // Should not throw when there are few summaries
    await expect(
      service.autoMaintain('test-session-few')
    ).resolves.toBeUndefined()
  })
})

// ---- Checkpoint ----

describe('Memory checkpoint', () => {
  it('checkpoint 不应抛出异常（session 存在但消息少）', async () => {
    if (!hasApiKey) return

    const service = getMemoryService()
    const session = service.createSession('MEMORY CHECKPOINT TEST')
    const messages: ChatMessage[] = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！' },
    ]

    await expect(
      service.checkpoint(session.id, messages)
    ).resolves.toBeUndefined()

    service.deleteSession(session.id)
  })

  it('checkpoint 对不存在的 session 不应抛出', async () => {
    await expect(
      getMemoryService().checkpoint('nonexistent-session', [])
    ).resolves.toBeUndefined()
  })
})
