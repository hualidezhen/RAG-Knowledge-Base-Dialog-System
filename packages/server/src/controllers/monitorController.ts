import { Request, Response } from 'express'
import { getMonitorService } from '../services/monitorService'

/**
 * 监控控制器
 * 提供 LLM 调用、工具调用和 RAG 检索的指标查询，以及实时状态和错误日志查看
 */

/**
 * 获取聚合指标
 * 支持按时间范围（1h/24h/7d）和类别过滤，返回延迟、Token 消耗等统计数据
 */
export async function getMetrics(req: Request, res: Response): Promise<void> {
  try {
    const timeRange = (req.query.timeRange as '1h' | '24h' | '7d') || '1h'
    const category = req.query.category as string | undefined
    const metrics = getMonitorService().getMetrics(timeRange, category)
    res.json({ timeRange, category, metrics })
  } catch (err: any) {
    res.status(500).json({ error: `获取指标异常: ${err.message}` })
  }
}

/**
 * 获取系统实时运行状态
 * 返回当前 QPS、活跃请求数、内存使用等信息
 */
export async function getRealtime(req: Request, res: Response): Promise<void> {
  try {
    const status = getMonitorService().getRealtimeStatus()
    res.json({ success: true, data: status })
  } catch (err: any) {
    res.status(500).json({ error: `获取实时状态异常: ${err.message}` })
  }
}

/**
 * 获取错误日志
 * 支持按日志级别过滤和限制返回条数
 */
export async function getLogs(req: Request, res: Response): Promise<void> {
  try {
    const level = req.query.level as string | undefined
    const limit = parseInt(req.query.limit as string, 10) || 50
    const logs = getMonitorService().getErrorLogs(level, limit)
    res.json({ level, limit, logs })
  } catch (err: any) {
    res.status(500).json({ error: `获取日志异常: ${err.message}` })
  }
}
