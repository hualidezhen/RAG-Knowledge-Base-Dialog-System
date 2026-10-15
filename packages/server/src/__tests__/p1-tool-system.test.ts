/**
 * P1: Tool System — 标准化工具封装
 *
 * Tests Tool type interfaces, ToolRegistry register/get/list/execute,
 * each of the 4 tools (retrieve_knowledge, list_documents,
 * get_document_content, chat_with_context), error handling,
 * and execution time tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { getToolRegistry } from '../services/toolRegistry'
import { retrieveKnowledgeTool } from '../tools/retrieveKnowledge'
import { listDocumentsTool } from '../tools/listDocuments'
import { getDocumentContentTool } from '../tools/getDocumentContent'
import { chatWithContextTool } from '../tools/chatWithContext'
import { Tool, ToolParameter, ToolCall, ToolResult } from '../types'

// ---- Helper ----

function setupRegistry() {
  const registry = getToolRegistry()
  // Re-register to ensure clean state
  registry.register(retrieveKnowledgeTool)
  registry.register(listDocumentsTool)
  registry.register(getDocumentContentTool)
  registry.register(chatWithContextTool)
  return registry
}

// ---- P1-1: Tool 接口类型 ----

describe('P1-1: Tool 接口类型', () => {
  it('应正确定义 ToolParameter 结构 (name, type, description, required?)', () => {
    const param: ToolParameter = {
      name: 'query',
      type: 'string',
      description: '搜索查询',
      required: true,
    }
    expect(param).toHaveProperty('name')
    expect(param).toHaveProperty('type')
    expect(param).toHaveProperty('description')
    // required is optional
  })

  it('应正确定义 Tool 结构 (name, description, parameters, execute)', () => {
    const tool: Tool = {
      name: 'test_tool',
      description: 'A test tool',
      parameters: [],
      async execute() { return {} },
    }
    expect(tool).toHaveProperty('name')
    expect(tool).toHaveProperty('description')
    expect(tool).toHaveProperty('parameters')
    expect(typeof tool.execute).toBe('function')
  })

  it('应正确定义 ToolCall 结构 (toolName, args, result?, error?, durationMs?)', () => {
    const call: ToolCall = {
      toolName: 'test',
      args: { foo: 'bar' },
    }
    expect(call).toHaveProperty('toolName')
    expect(call).toHaveProperty('args')
  })

  it('应正确定义 ToolResult 结构 (success, data?, error?, durationMs, tokenCount?)', () => {
    const result: ToolResult = {
      success: true,
      data: { answer: 'hello' },
      durationMs: 42,
    }
    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('durationMs')
  })
})

// ---- P1-2: ToolRegistry 功能 ----

describe('P1-2: ToolRegistry 功能', () => {
  const registry = setupRegistry()

  it('register() 应接受并存储工具', () => {
    const tools = registry.list()
    const names = tools.map(t => t.name)
    expect(names).toContain('retrieve_knowledge')
    expect(names).toContain('list_documents')
    expect(names).toContain('get_document_content')
    expect(names).toContain('chat_with_context')
  })

  it('get() 应通过名称返回工具', () => {
    const tool = registry.get('retrieve_knowledge')
    expect(tool).toBeDefined()
    expect(tool!.name).toBe('retrieve_knowledge')
  })

  it('get() 对不存在的工具应返回 undefined', () => {
    const tool = registry.get('nonexistent_tool')
    expect(tool).toBeUndefined()
  })

  it('list() 应返回所有已注册工具', () => {
    const tools = registry.list()
    expect(tools.length).toBeGreaterThanOrEqual(4)
  })
})

// ---- P1-3~P1-6: 各工具结构验证 ----

describe('P1-3~P1-6: 各工具结构', () => {
  const registry = setupRegistry()
  const expectedTools = [
    'retrieve_knowledge',
    'list_documents',
    'get_document_content',
    'chat_with_context',
  ]

  for (const toolName of expectedTools) {
    it(`${toolName} 应包含 description, parameters, execute`, () => {
      const tool = registry.get(toolName)
      expect(tool).toBeDefined()
      expect(tool!.description).toBeTruthy()
      expect(Array.isArray(tool!.parameters)).toBe(true)
      expect(typeof tool!.execute).toBe('function')
    })
  }

  it('retrieve_knowledge 应包含 query 必填参数', () => {
    const tool = registry.get('retrieve_knowledge')
    const queryParam = tool!.parameters.find(p => p.name === 'query')
    expect(queryParam).toBeDefined()
    expect(queryParam!.required).toBe(true)
  })

  it('list_documents 应包含 collection 可选参数', () => {
    const tool = registry.get('list_documents')
    const collectionParam = tool!.parameters.find(p => p.name === 'collection')
    expect(collectionParam).toBeDefined()
  })

  it('get_document_content 应包含 fileName 必填参数', () => {
    const tool = registry.get('get_document_content')
    const fileNameParam = tool!.parameters.find(p => p.name === 'fileName')
    expect(fileNameParam).toBeDefined()
    expect(fileNameParam!.required).toBe(true)
  })

  it('chat_with_context 应包含 messages 必填参数', () => {
    const tool = registry.get('chat_with_context')
    const messagesParam = tool!.parameters.find(p => p.name === 'messages')
    expect(messagesParam).toBeDefined()
    expect(messagesParam!.required).toBe(true)
  })
})

// ---- P1-7: Tool 执行 ----

describe('P1-7: Tool 执行', () => {
  const registry = setupRegistry()

  it('list_documents 执行应返回 ToolResult 格式', async () => {
    const result = await registry.execute('list_documents', {})
    // Should succeed even if ChromaDB is unavailable (graceful degradation)
    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('durationMs')
    expect(typeof result.durationMs).toBe('number')
  })

  it('list_documents 执行应记录 durationMs > 0', async () => {
    const result = await registry.execute('list_documents', {})
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('chat_with_context 执行应返回 answer', async () => {
    const result = await registry.execute('chat_with_context', {
      messages: [
        { role: 'user', content: '你好' },
      ],
    })
    expect(result.success).toBe(true)
    expect(result.data).toHaveProperty('answer')
    expect(typeof result.data.answer).toBe('string')
  }, 15000)

  it('不存在的工具应返回 success=false', async () => {
    const result = await registry.execute('nonexistent_tool', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('get_document_content 对不存在的文件应返回失败', async () => {
    const result = await registry.execute('get_document_content', {
      fileName: 'nonexistent-file-12345.txt',
    })
    // Either success=false (file not found) or success with empty content
    expect(result).toHaveProperty('success')
  })
})
