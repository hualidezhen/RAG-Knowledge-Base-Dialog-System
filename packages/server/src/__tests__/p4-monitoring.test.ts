/**
 * P4: Agent 运行时监控系统
 *
 * Tests LLM/tool/retrieval metric recording, error logging,
 * realtime status, and timeRange query behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getMonitorService } from '../services/monitorService'
import { getMetricsStore } from '../services/metricsStore'

beforeEach(() => {
  // Reset the metrics store's in-memory state by accessing the singleton
  // and clearing its internal buffer. Since MetricsStore doesn't expose a
  // clear method, we push to a fresh scope by working through the singleton.
  const store = getMetricsStore()
  // Flush then dispose to stop timer, then recreate will happen on next get
  store.dispose()
  // Clear the singleton reference so next getMetricsStore() creates a fresh one
  // We use require cache busting — but simpler: just test through the service
})

afterEach(() => {
  const store = getMetricsStore()
  store.dispose()
})

// ---- P4-1: LLM Metrics ----

describe('P4-1: LLM 指标采集', () => {
  it('recordLLMMetric 应记录并可通过 getMetrics 查询', () => {
    const service = getMonitorService()
    service.recordLLMMetric('chat_completion', 150, 100, 50, 'deepseek-v4-flash', true)

    const metrics = service.getMetrics('1h', 'llm')
    expect(metrics.length).toBeGreaterThanOrEqual(1)
    const llmMetric = metrics.find((m) => m.name === 'chat_completion')
    expect(llmMetric).toBeDefined()
    expect(llmMetric!.category).toBe('llm')
    expect(llmMetric!.sum).toBeGreaterThan(0)
  })

  it('recordLLMMetric 应记录失败的调用', () => {
    const service = getMonitorService()
    service.recordLLMMetric('chat_completion', 0, 0, 0, 'deepseek-v4-flash', false)

    const metrics = service.getMetrics('1h', 'llm')
    const failMetrics = metrics.filter((m) => m.name === 'chat_completion')
    expect(failMetrics.length).toBeGreaterThanOrEqual(1)
  })
})

// ---- P4-2: Tool Metrics ----

describe('P4-2: 工具调用指标采集', () => {
  it('recordToolMetric 应记录工具调用', () => {
    const service = getMonitorService()
    service.recordToolMetric('list_documents', 200, true)

    const metrics = service.getMetrics('1h', 'tool')
    const toolMetric = metrics.find((m) => m.name === 'list_documents')
    expect(toolMetric).toBeDefined()
    expect(toolMetric!.category).toBe('tool')
    expect(toolMetric!.count).toBeGreaterThanOrEqual(1)
  })

  it('recordToolMetric 应记录失败的工具调用', () => {
    const service = getMonitorService()
    service.recordToolMetric('nonexistent_tool', 0, false)

    const metrics = service.getMetrics('1h', 'tool')
    const failMetric = metrics.find((m) => m.name === 'nonexistent_tool')
    expect(failMetric).toBeDefined()
  })
})

// ---- P4-3: Retrieval Metrics ----

describe('P4-3: 检索指标采集', () => {
  it('recordRetrievalMetric 应记录检索调用', () => {
    const service = getMonitorService()
    service.recordRetrievalMetric(300, 8, 5, 3, 8)

    const metrics = service.getMetrics('1h', 'retrieval')
    const retrievalMetric = metrics.find((m) => m.name === 'hybrid_search')
    expect(retrievalMetric).toBeDefined()
    expect(retrievalMetric!.category).toBe('retrieval')
    expect(retrievalMetric!.count).toBeGreaterThanOrEqual(1)
  })
})

// ---- P4-4: Error Logging ----

describe('P4-4: 错误日志', () => {
  it('logError 应记录并被 getErrorLogs 返回', () => {
    const service = getMonitorService()
    service.logError('error', '测试错误', 'test')

    const logs = service.getErrorLogs()
    expect(logs.length).toBeGreaterThanOrEqual(1)
    const found = logs.find((l) => l.message === '测试错误')
    expect(found).toBeDefined()
    expect(found!.level).toBe('error')
    expect(found!.category).toBe('test')
  })

  it('getErrorLogs 应支持按级别过滤', () => {
    const service = getMonitorService()
    service.logError('warn', '测试警告', 'test')
    service.logError('info', '测试信息', 'test')

    const errorLogs = service.getErrorLogs('error')
    const warnLogs = service.getErrorLogs('warn')
    const infoLogs = service.getErrorLogs('info')

    expect(errorLogs.filter((l) => l.message === '测试警告').length).toBe(0)
    expect(warnLogs.filter((l) => l.message === '测试警告').length).toBeGreaterThanOrEqual(1)
    expect(infoLogs.filter((l) => l.message === '测试信息').length).toBeGreaterThanOrEqual(1)
  })
})

// ---- P4-6: Realtime Status ----

describe('P4-6: 实时状态', () => {
  it('getRealtimeStatus 应返回标准结构', () => {
    const service = getMonitorService()
    const status = service.getRealtimeStatus()

    expect(status).toHaveProperty('qps')
    expect(status).toHaveProperty('avgLatencyMs')
    expect(status).toHaveProperty('toolCallCount')
    expect(status).toHaveProperty('errorCount')
    expect(typeof status.qps).toBe('number')
    expect(typeof status.avgLatencyMs).toBe('number')
    expect(typeof status.toolCallCount).toBe('number')
    expect(typeof status.errorCount).toBe('number')
  })
})

// ---- TimeRange Edge Cases ----

describe('监控 timeRange', () => {
  it('无效 timeRange 应默认返回最近 1h 数据（不抛出）', () => {
    const service = getMonitorService()
    // @ts-expect-error testing invalid timeRange
    const metrics = service.getMetrics('invalid')
    expect(Array.isArray(metrics)).toBe(true)
  })
})
