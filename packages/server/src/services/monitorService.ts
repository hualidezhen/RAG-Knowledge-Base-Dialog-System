/**
 * LLM 调用、工具调用、RAG 检索的指标采集服务。
 * 作为 MetricsStore 的封装层，提供按类别区分的指标记录方法。
 */

import { MetricPoint, AggregatedMetric, ErrorLog } from '../types'
import { getMetricsStore } from './metricsStore'

export class MonitorService {
  private store = getMetricsStore()

  /**
   * 记录一次 LLM 调用指标（模型名称、Token 消耗、耗时、是否成功）。
   * @param name       调用名称（如 chat_completion）
   * @param durationMs 耗时（毫秒）
   * @param tokensIn   输入 Token 数
   * @param tokensOut  输出 Token 数
   * @param model      使用的模型名称
   * @param success    是否成功
   */
  recordLLMMetric(
    name: string,
    durationMs: number,
    tokensIn: number,
    tokensOut: number,
    model: string,
    success: boolean
  ): void {
    this.store.push({
      timestamp: new Date().toISOString(),
      category: 'llm',
      name,
      value: durationMs,
      tags: { model, tokensIn, tokensOut, success },
    })
  }

  /**
   * 记录一次工具执行指标（工具名称、耗时、是否成功）。
   * @param toolName   工具名称
   * @param durationMs 耗时（毫秒）
   * @param success    是否成功
   * @param args       调用参数（可选）
   */
  recordToolMetric(
    toolName: string,
    durationMs: number,
    success: boolean,
    args?: Record<string, any>
  ): void {
    const point: MetricPoint = {
      timestamp: new Date().toISOString(),
      category: 'tool',
      name: toolName,
      value: durationMs,
      tags: { success },
    }
    if (args) {
      point.metadata = { args }
    }
    this.store.push(point)
  }

  /**
   * 记录一次 RAG 混合检索指标（向量数、BM25 数、重排数、耗时）。
   * @param durationMs  耗时（毫秒）
   * @param chunkCount  最终返回的块数
   * @param vectorCount 向量检索结果数
   * @param bm25Count   BM25 检索结果数
   * @param rerankCount 重排序结果数
   */
  recordRetrievalMetric(
    durationMs: number,
    chunkCount: number,
    vectorCount: number,
    bm25Count: number,
    rerankCount: number
  ): void {
    this.store.push({
      timestamp: new Date().toISOString(),
      category: 'retrieval',
      name: 'hybrid_search',
      value: durationMs,
      tags: { chunkCount, vectorCount, bm25Count, rerankCount },
    })
  }

  /**
   * 记录一条错误日志，委托给 MetricsStore 存储。
   * @param level    错误级别（error / warn / info）
   * @param message  错误消息
   * @param category 所属类别（如 llm / tool / retrieval）
   * @param stack    可选堆栈信息
   */
  logError(level: 'error' | 'warn' | 'info', message: string, category: string, stack?: string): void {
    this.store.logError({
      timestamp: new Date().toISOString(),
      level,
      message,
      category,
      stack,
    })
  }

  /** 获取聚合指标（按时间范围 + 可选类别过滤） */
  getMetrics(timeRange: '1h' | '24h' | '7d', category?: string): AggregatedMetric[] {
    return this.store.query(timeRange, category)
  }

  /** 获取错误日志（可按级别过滤和限制数量） */
  getErrorLogs(level?: string, limit?: number): ErrorLog[] {
    return this.store.getErrorLogs(level, limit)
  }

  /** 获取实时运行状态（QPS、平均延迟、工具调用数、错误数） */
  getRealtimeStatus(): {
    qps: number
    avgLatencyMs: number
    toolCallCount: number
    errorCount: number
  } {
    return this.store.getRealtimeStatus()
  }
}

// ---- Singleton 单例模式 ----

let instance: MonitorService | null = null

export function getMonitorService(): MonitorService {
  if (!instance) {
    instance = new MonitorService()
  }
  return instance
}
