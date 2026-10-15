/**
 * P2: Agent Engine — 智能体编排引擎
 *
 * Tests ReAct reasoning loop, tool invocation, error recovery,
 * SSE streaming format, and the newly-added checkpoint integration.
 *
 * NOTE: Tests that require DEEPSEEK_API_KEY will be skipped if not configured.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { PassThrough } from 'stream'
import { Response } from 'express'
import { getAgentService } from '../services/agentService'
import { getMemoryService } from '../services/memoryService'
import { getToolRegistry } from '../services/toolRegistry'
import { retrieveKnowledgeTool } from '../tools/retrieveKnowledge'
import { listDocumentsTool } from '../tools/listDocuments'
import { getDocumentContentTool } from '../tools/getDocumentContent'
import { chatWithContextTool } from '../tools/chatWithContext'

const hasApiKey =
  process.env.DEEPSEEK_API_KEY &&
  process.env.DEEPSEEK_API_KEY !== 'your_key_here'

beforeAll(() => {
  // Ensure tools are registered
  const registry = getToolRegistry()
  registry.register(retrieveKnowledgeTool)
  registry.register(listDocumentsTool)
  registry.register(getDocumentContentTool)
  registry.register(chatWithContextTool)
})

// ---- P2-1: ReAct 循环 ----

describe('P2-1: ReAct 推理循环', () => {
  it('executeAgent 应返回 answer/steps/totalTokens 结构', async () => {
    const agentService = getAgentService()
    const result = await agentService.executeAgent('你好')
    expect(result).toHaveProperty('answer')
    expect(result).toHaveProperty('steps')
    expect(result).toHaveProperty('totalTokens')
    expect(typeof result.answer).toBe('string')
    expect(Array.isArray(result.steps)).toBe(true)
    expect(typeof result.totalTokens).toBe('number')
  })

  it('问候应直接返回 Final Answer 无需工具调用', async () => {
    if (!hasApiKey) return // skip without key

    const agentService = getAgentService()
    const result = await agentService.executeAgent('你好', { temperature: 0.1 })
    expect(result.answer.length).toBeGreaterThan(0)
    // Simple greeting should not trigger any tool calls
    expect(result.steps.length).toBe(0)
  }, 20000)

  it('空消息应抛出错误', async () => {
    const agentService = getAgentService()
    await expect(
      agentService.executeAgent('  ')
    ).rejects.toThrow('消息不能为空')
  })
})

// ---- P2-2: 工具调用 ----

describe('P2-2: 工具调用', () => {
  it('"列出我的文档" 应触发 list_documents 工具', async () => {
    if (!hasApiKey) return

    const agentService = getAgentService()
    const result = await agentService.executeAgent('列出我的文档', { temperature: 0.1 })
    expect(result.answer.length).toBeGreaterThan(0)
    // Should have at least attempted to use list_documents
    const toolNames = result.steps.map(s => s.action.name)
    expect(toolNames).toContain('list_documents')
  }, 30000)
})

// ---- P2-4: 错误恢复 ----

describe('P2-4: 工具调用错误恢复', () => {
  it('调用不存在的工具应降级回答而非崩溃', async () => {
    if (!hasApiKey) return

    const agentService = getAgentService()
    const result = await agentService.executeAgent(
      '调用一个叫 send_email 的工具',
      { temperature: 0.1 }
    )
    expect(result.answer.length).toBeGreaterThan(0)
  }, 30000)
})

// ---- P2-3: SSE 流式输出 ----

describe('P2-3: SSE 流式输出', () => {
  it('streamChat 应发送 SSE 事件 (agent_thinking)', async () => {
    if (!hasApiKey) return

    const agentService = getAgentService()
    const res = createMockResponse()
    await agentService.streamChat('你好', res as unknown as Response, { temperature: 0.1 })

    const events = parseSSEEvents(res.output)
    const types = events.map(e => e.type)
    expect(types).toContain('agent_thinking')
    expect(types).toContain('token')
  }, 20000)

  it('streamChat 工具调用应发送 agent_tool_use 和 agent_observation', async () => {
    if (!hasApiKey) return

    const agentService = getAgentService()
    const res = createMockResponse()
    await agentService.streamChat('列出我的文档', res as unknown as Response, { temperature: 0.1 })

    const events = parseSSEEvents(res.output)
    const types = events.map(e => e.type)
    expect(types).toContain('agent_tool_use')
    expect(types).toContain('agent_observation')
  }, 30000)

  it('streamChat 应正确发送 [DONE] 结束标记', async () => {
    if (!hasApiKey) return

    const agentService = getAgentService()
    const res = createMockResponse()
    await agentService.streamChat('你好', res as unknown as Response, { temperature: 0.1 })

    expect(res.output).toContain('[DONE]')
  }, 20000)
})

// ---- checkpoint 集成验证 ----

describe('Agent checkpoint 集成', () => {
  it('executeAgent 带 sessionId 时不应抛出 checkpoint 异常', async () => {
    if (!hasApiKey) return

    const memService = getMemoryService()
    const session = memService.createSession('agent-checkpoint-test')
    const agentService = getAgentService()

    // This should not throw even if checkpoint fails
    const result = await agentService.executeAgent('你好', {
      temperature: 0.1,
      sessionId: session.id,
    })
    expect(result.answer.length).toBeGreaterThan(0)

    // Cleanup
    memService.deleteSession(session.id)
  }, 20000)
})

// ---- Helpers ----

function createMockResponse() {
  const chunks: string[] = []
  return {
    output: '',
    chunks,
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) { this.headers[key] = value },
    status(code: number) { this.statusCode = code; return this },
    json(obj: any) { this.output = JSON.stringify(obj) },
    write(data: string) {
      this.output += data
      this.chunks.push(data)
    },
    end() { /* no-op */ },
  }
}

function parseSSEEvents(output: string): Array<Record<string, any>> {
  const events: Array<Record<string, any>> = []
  const lines = output.split('\n')
  for (const line of lines) {
    if (line.startsWith('data: ') && line.slice(6) !== '[DONE]') {
      try {
        events.push(JSON.parse(line.slice(6)))
      } catch { /* skip invalid JSON */ }
    }
  }
  return events
}
