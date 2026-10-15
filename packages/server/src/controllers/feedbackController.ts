import { Request, Response } from 'express'
import { getFeedbackService } from '../services/feedbackService'
import { FeedbackRequest } from '../types'

/**
 * 反馈控制器
 * 提供用户反馈提交、统计汇总和低分分析功能
 * 反馈数据持久化存储在 JSON 文件中
 */

/**
 * 提交用户反馈
 * 验证 messageId 和 rating（1-5），保存后返回反馈条目
 */
export async function submitFeedback(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as FeedbackRequest

    if (!body.messageId) {
      res.status(400).json({ error: 'messageId 不能为空' })
      return
    }
    if (!body.rating || body.rating < 1 || body.rating > 5) {
      res.status(400).json({ error: 'rating 必须在 1-5 之间' })
      return
    }

    const entry = getFeedbackService().submitFeedback(body)
    res.json({ success: true, entry })
  } catch (err: any) {
    res.status(500).json({ error: `提交反馈异常: ${err.message}` })
  }
}

/**
 * 获取反馈统计
 * 返回总反馈数、平均评分和评分分布（1-5 星的各自数量）
 */
export async function getStats(_req: Request, res: Response): Promise<void> {
  try {
    const stats = getFeedbackService().getStats()
    res.json(stats)
  } catch (err: any) {
    res.status(500).json({ error: `获取统计异常: ${err.message}` })
  }
}

/**
 * 运行反馈分析
 * 汇总低分（rating <= 2）回答的共性问题，输出分析结果
 */
export async function runAnalysis(_req: Request, res: Response): Promise<void> {
  try {
    const result = getFeedbackService().runAnalysis()
    res.json({ success: true, ...result })
  } catch (err: any) {
    res.status(500).json({ error: `分析异常: ${err.message}` })
  }
}
