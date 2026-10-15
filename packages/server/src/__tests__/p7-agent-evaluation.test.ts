/**
 * P7: Agent 评估系统升级
 *
 * Tests testSet structure, category coverage, expectedToolCalls
 * configuration, and TestCase interface compliance.
 */

import { describe, it, expect } from 'vitest'
import { testSet, agentTestSet } from '../evaluation/testSet'

// ---- P7-1: TestSet Structure ----

describe('P7-1: 测试用例结构', () => {
  it('testSet 应包含至少 17 个用例', () => {
    expect(testSet.length).toBeGreaterThanOrEqual(17)
  })

  it('每个用例应有 id/question/expectedTopics/category', () => {
    for (const tc of testSet) {
      expect(tc).toHaveProperty('id')
      expect(tc).toHaveProperty('question')
      expect(tc).toHaveProperty('expectedTopics')
      expect(tc).toHaveProperty('category')
      expect(typeof tc.id).toBe('string')
      expect(typeof tc.question).toBe('string')
      expect(Array.isArray(tc.expectedTopics)).toBe(true)
    }
  })

  it('agentTestSet 应过滤出 Agent 相关用例', () => {
    const agentCategories = ['agent_tool_use', 'agent_reasoning', 'agent_error_recovery', 'agent_memory']
    for (const tc of agentTestSet) {
      expect(agentCategories).toContain(tc.category)
    }
  })

  it('agentTestSet 应包含至少 8 个 Agent 用例', () => {
    expect(agentTestSet.length).toBeGreaterThanOrEqual(8)
  })

  it('agent_tool_use 类用例应配置 expectedToolCalls', () => {
    const toolUseCases = agentTestSet.filter((tc) => tc.category === 'agent_tool_use')
    for (const tc of toolUseCases) {
      expect(tc.expectedToolCalls).toBeDefined()
      expect(Array.isArray(tc.expectedToolCalls)).toBe(true)
      expect(tc.expectedToolCalls!.length).toBeGreaterThanOrEqual(1)
    }
  })
})

// ---- P7-2: Category Coverage ----

describe('P7-2: 分类覆盖', () => {
  it('应覆盖 4 种 Agent 类别', () => {
    const categories = new Set(agentTestSet.map((tc) => tc.category))
    expect(categories.has('agent_tool_use')).toBe(true)
    expect(categories.has('agent_reasoning')).toBe(true)
    expect(categories.has('agent_error_recovery')).toBe(true)
    expect(categories.has('agent_memory')).toBe(true)
  })

  it('每个类别至少应有 2 个用例', () => {
    const categoryCount: Record<string, number> = {}
    for (const tc of agentTestSet) {
      categoryCount[tc.category] = (categoryCount[tc.category] || 0) + 1
    }
    for (const [cat, count] of Object.entries(categoryCount)) {
      expect(count, `类别 ${cat} 应有至少 2 个用例`).toBeGreaterThanOrEqual(2)
    }
  })
})

// ---- P7-3: ExpectedToolCalls ----

describe('P7-3: expectedToolCalls 配置', () => {
  it('所有 expectedToolCalls 应包含 toolName', () => {
    for (const tc of agentTestSet) {
      if (!tc.expectedToolCalls) continue
      for (const call of tc.expectedToolCalls) {
        expect(call).toHaveProperty('toolName')
        expect(typeof call.toolName).toBe('string')
      }
    }
  })

  it('expectedToolCalls 应引用已注册的工具', () => {
    const registeredTools = [
      'list_documents',
      'retrieve_knowledge',
      'get_document_content',
      'chat_with_context',
    ]
    for (const tc of agentTestSet) {
      if (!tc.expectedToolCalls) continue
      for (const call of tc.expectedToolCalls) {
        if (call.toolName !== 'send_email') {
          // send_email is intentionally nonexistent for error recovery tests
          expect(registeredTools).toContain(call.toolName)
        }
      }
    }
  })
})
