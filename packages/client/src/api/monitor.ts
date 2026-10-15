import request from './index'

/**
 * 聚合后的指标数据点
 */
export interface AggregatedMetric {
  hour: string                                    // 聚合时间窗口（ISO 格式，精确到小时）
  category: string                                // 指标类别（llm / tool / retrieval 等）
  name: string                                    // 指标名称（如 chat_completion、retrieve_knowledge、hybrid_search）
  sum: number                                     // 该时段内累计值
  avg: number                                     // 该时段内平均值（如平均延迟）
  max: number                                     // 该时段内最大值
  min: number                                     // 该时段内最小值
  count: number                                   // 该时段内采样次数
  tags: Record<string, string | number | boolean> // 附加标签（如 model、success 状态等）
}

/**
 * 指标查询响应
 */
export interface MetricsResponse {
  timeRange: string          // 查询的时间范围（1h / 24h / 7d）
  category?: string          // 按类别筛选时的类别值
  metrics: AggregatedMetric[] // 聚合指标数据数组
}

/**
 * 系统实时运行状态
 */
export interface RealtimeStatus {
  success: boolean           // 是否成功获取到状态
  data: {
    qps: number              // 每秒查询数（当前吞吐量）
    avgLatencyMs: number     // 平均响应延迟（毫秒）
    toolCallCount: number    // 工具调用总数（累计）
    errorCount: number       // 错误总数（累计）
  }
}

/**
 * 系统错误日志条目
 */
export interface ErrorLog {
  timestamp: string  // 错误发生时间
  level: string      // 日志级别（error / warn / info）
  message: string    // 错误消息
  category: string   // 错误所属类别
  stack?: string     // 堆栈跟踪（可选）
}

/**
 * 日志查询响应
 */
export interface LogsResponse {
  level?: string    // 按日志级别筛选时的过滤值
  limit: number     // 返回的最大条数
  logs: ErrorLog[]   // 错误日志数组
}

/**
 * 获取聚合指标数据
 * @param timeRange 时间范围：1h（最近1小时）/ 24h（最近24小时）/ 7d（最近7天）
 * @param category  按类别筛选（可选，如 llm / tool / retrieval）
 */
export function getMetrics(timeRange: '1h' | '24h' | '7d', category?: string) {
  return request.get<MetricsResponse>('/api/monitor/metrics', {
    params: { timeRange, category },
  })
}

/**
 * 获取系统当前实时状态（QPS、平均延迟、工具调用数、错误数）
 */
export function getRealtime() {
  return request.get<RealtimeStatus>('/api/monitor/realtime')
}

/**
 * 获取系统错误日志
 * @param level 日志级别过滤（可选，如 error / warn）
 * @param limit 最大返回条数（可选，默认由服务端决定）
 */
export function getLogs(level?: string, limit?: number) {
  return request.get<LogsResponse>('/api/monitor/logs', {
    params: { level, limit },
  })
}
