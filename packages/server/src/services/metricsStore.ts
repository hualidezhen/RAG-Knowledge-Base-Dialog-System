import * as path from 'path'
import * as fs from 'fs'

import { MetricPoint, AggregatedMetric, ErrorLog } from '../types'

// ---- 持久化辅助方法（参考 CLAUDE.md §2.8）----
// 指标聚合存储：按小时聚合 sum/avg/max/min/count，保留 7 天

const DATA_DIR = path.resolve(__dirname, '../../data/metrics')

/** 确保数据目录存在，不存在则递归创建 */
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

/** 根据日期字符串生成对应的 JSON 文件路径 */
function dateFile(date: string): string {
  return path.join(DATA_DIR, `${date}.json`)
}

/** 加载指定日期的所有指标点数据 */
function loadPoints(date: string): MetricPoint[] {
  const file = dateFile(date)
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    /* 文件损坏 — 重置为空数组 */
  }
  return []
}

/** 将指定日期的指标点数据写入磁盘 */
function savePoints(date: string, points: MetricPoint[]) {
  ensureDir()
  fs.writeFileSync(dateFile(date), JSON.stringify(points, null, 2), 'utf-8')
}

// ---- 时间解析辅助方法 ----

/** 从 ISO 时间戳中提取日期键（YYYY-MM-DD） */
function toDateKey(ts: string): string {
  return ts.slice(0, 10) // 'YYYY-MM-DD'
}

/** 从 ISO 时间戳中提取小时键（YYYY-MM-DDTHH:00:00.000Z） */
function toHourKey(ts: string): string {
  return ts.slice(0, 13) + ':00:00.000Z' // 'YYYY-MM-DDTHH:00:00.000Z'
}

// ---- 清理：删除 7 天前的旧文件 ----

/** 扫描指标数据目录，删除所有早于 7 天前的 JSON 文件 */
function cleanOldFiles() {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  try {
    const files = fs.readdirSync(DATA_DIR)
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      const dateStr = f.replace('.json', '')
      const ts = new Date(dateStr).getTime()
      if (!isNaN(ts) && ts < cutoff) {
        fs.unlinkSync(path.join(DATA_DIR, f))
      }
    }
  } catch {
    // 忽略错误
  }
}

// ---- MetricsStore：指标聚合存储（缓冲区 + 定时刷盘模式）----
// 功能：按小时聚合 sum/avg/max/min/count，保留 7 天，超出则自动清理

export class MetricsStore {
  private buffer: MetricPoint[] = []          // 内存缓冲区的指标点
  private flushTimer: NodeJS.Timeout | null = null  // 定时刷盘定时器
  private errorLogs: ErrorLog[] = []           // 内存中的错误日志（上限 1000 条）

  constructor() {
    cleanOldFiles()            // 启动时清理过期文件
    this.flushTimer = setInterval(() => this.flush(), 30_000)  // 每 30 秒自动刷盘
  }

  /** 缓冲一个指标点，每满 100 条自动触发刷盘 */
  push(point: MetricPoint): void {
    this.buffer.push(point)
    if (this.buffer.length >= 100) this.flush()
  }

  /** 记录错误日志到内存（上限 1000 条，超出则移除最旧的） */
  logError(log: ErrorLog): void {
    this.errorLogs.push(log)
    if (this.errorLogs.length > 1000) this.errorLogs.shift()
  }

  /** 将缓冲区中的指标点按日期分组写入磁盘文件 */
  flush(): void {
    if (this.buffer.length === 0) return
    const grouped = new Map<string, MetricPoint[]>()
    for (const p of this.buffer) {
      const key = toDateKey(p.timestamp)
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(p)
    }
    for (const [date, points] of grouped) {
      const existing = loadPoints(date)
      existing.push(...points)
      savePoints(date, existing)
    }
    this.buffer = []
  }

  /**
   * 按时间范围查询聚合指标。
   * 先刷盘确保数据最新，然后按小时 + 类别 + 名称分组聚合。
   * @param timeRange 时间范围：1h | 24h | 7d
   * @param category  可选类别过滤（llm / tool / retrieval）
   */
  query(
    timeRange: '1h' | '24h' | '7d',
    category?: string
  ): AggregatedMetric[] {
    this.flush() // 确保磁盘数据是最新的
    const now = Date.now()
    const ranges: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    }
    const rangeMs = ranges[timeRange] || ranges['1h']
    const cutoff = new Date(now - rangeMs).toISOString()

    // 收集时间范围内的所有指标点
    const all: MetricPoint[] = []
    for (let d = new Date(cutoff); d.getTime() <= now; d.setDate(d.getDate() + 1)) {
      const dateKey = toDateKey(d.toISOString())
      const points = loadPoints(dateKey).filter(
        (p) => p.timestamp >= cutoff && (!category || p.category === category)
      )
      all.push(...points)
    }

    // 按小时 + 类别 + 名称分组聚合
    const groups = new Map<string, MetricPoint[]>()
    for (const p of all) {
      const key = `${toHourKey(p.timestamp)}|${p.category}|${p.name}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    }

    const result: AggregatedMetric[] = []
    for (const [key, points] of groups) {
      const [hour, cat, name] = key.split('|')
      const values = points.map((p) => p.value)
      const sum = values.reduce((a, b) => a + b, 0)
      result.push({
        hour,
        category: cat,
        name,
        sum: Math.round(sum * 100) / 100,          // 总和
        avg: Math.round((sum / values.length) * 100) / 100,  // 平均值
        max: Math.round(Math.max(...values) * 100) / 100,    // 最大值
        min: Math.round(Math.min(...values) * 100) / 100,    // 最小值
        count: values.length,                                 // 计数
        tags: points[0]?.tags ?? {},
      })
    }

    result.sort((a, b) => a.hour.localeCompare(b.hour))
    return result
  }

  /**
   * 获取错误日志，可按级别过滤。
   * @param level 可选错误级别过滤
   * @param limit 返回条数上限，默认 50
   */
  getErrorLogs(level?: string, limit: number = 50): ErrorLog[] {
    let filtered = this.errorLogs
    if (level) filtered = filtered.filter((l) => l.level === level)
    return filtered.slice(-limit)
  }

  /**
   * 获取实时运行状态：最近 5 分钟内的 QPS、平均延迟、工具调用次数、错误次数。
   */
  getRealtimeStatus(): {
    qps: number
    avgLatencyMs: number
    toolCallCount: number
    errorCount: number
  } {
    const cutoff = Date.now() - 5 * 60 * 1000
    const recent = this.buffer.filter((p) => new Date(p.timestamp).getTime() >= cutoff)

    const llmPoints = recent.filter((p) => p.category === 'llm')
    const toolPoints = recent.filter((p) => p.category === 'tool')
    const errors = recent.filter((p) => p.tags.success === false).length

    const avgLat =
      llmPoints.length > 0
        ? llmPoints.reduce((s, p) => s + p.value, 0) / llmPoints.length
        : 0

    return {
      qps: Math.round((recent.length / 300) * 100) / 100,     // 每秒请求数
      avgLatencyMs: Math.round(avgLat * 100) / 100,           // 平均延迟（毫秒）
      toolCallCount: toolPoints.length,                        // 工具调用次数
      errorCount: errors,                                      // 错误次数
    }
  }

  /** 停止定时刷盘并执行最后一次刷盘（清理用） */
  dispose(): void {
    if (this.flushTimer) clearInterval(this.flushTimer)
    this.flush()
  }
}

// ---- Singleton 单例模式 ----

let storeInstance: MetricsStore | null = null

export function getMetricsStore(): MetricsStore {
  if (!storeInstance) {
    storeInstance = new MetricsStore()
  }
  return storeInstance
}
