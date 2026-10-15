import { Request, Response } from 'express'
import { getEvaluationService } from '../services/evaluationService'

/**
 * 评估控制器
 * 提供在线评估运行和评估趋势查看功能
 * 评估测试集运行后生成 Markdown 格式报告
 */

/**
 * 运行在线评估
 * 执行测试集中的所有用例，输出评估报告并记录本次运行摘要
 */
export async function runEvaluation(_req: Request, res: Response): Promise<void> {
  try {
    const svc = getEvaluationService()
    const { reportPath } = await svc.runEvaluation()
    const record = svc.recordRun()
    res.json({ success: true, reportPath, summary: record })
  } catch (err: any) {
    res.status(500).json({ error: `评估运行异常: ${err.message}` })
  }
}

/**
 * 获取评估趋势
 * 返回最近多次评估的运行记录，供前端展示评分变化趋势
 */
export async function getTrend(_req: Request, res: Response): Promise<void> {
  try {
    const trend = getEvaluationService().getTrend()
    res.json({ success: true, runs: trend })
  } catch (err: any) {
    res.status(500).json({ error: `获取趋势异常: ${err.message}` })
  }
}
