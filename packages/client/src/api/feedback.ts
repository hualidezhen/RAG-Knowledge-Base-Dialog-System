import request from './index'

/**
 * 用户反馈提交请求体
 */
export interface FeedbackRequest {
  messageId: string    // 被评价的助手指令消息 ID
  rating: number       // 评分（1-5，5 为最好）
  comment?: string     // 文字评语（可选）
  tags?: string[]      // 标签（可选，如 ["回答不准确", "格式混乱"]）
}

/**
 * 反馈统计数据
 */
export interface FeedbackStats {
  total: number                                    // 总反馈数
  avgRating: number                                // 平均评分
  distribution: Record<number, number>             // 评分分布，如 { 1: 3, 2: 1, 3: 5, 4: 8, 5: 12 }
  recentComments: { rating: number; comment: string; timestamp: string }[]  // 最近带评语的反馈列表
}

/**
 * 提交用户反馈（评分 + 可选评论和标签）
 */
export function submitFeedback(data: FeedbackRequest) {
  return request.post('/api/feedback', data)
}

/**
 * 获取反馈统计（总数、平均分、评分分布、近期评论）
 */
export function getFeedbackStats() {
  return request.get<FeedbackStats>('/api/feedback/stats')
}

/**
 * 触发反馈分析 —— 汇总低分回答的模式并生成分析报告
 */
export function triggerAnalysis() {
  return request.post('/api/feedback/analyze')
}

/**
 * 触发在线评估 —— 用测试集对当前问答效果进行批量评测
 */
export function triggerEvaluation() {
  return request.post('/api/evaluation/run')
}

/**
 * 获取评估趋势（最近 N 次评分变化趋势）
 */
export function getEvaluationTrend() {
  return request.get('/api/evaluation/trend')
}
