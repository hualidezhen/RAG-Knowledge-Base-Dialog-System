// ========== 路由: 用户反馈 ==========
// 挂载路径: /api/feedback
// 提供用户反馈提交、统计汇总和自动分析功能

import { Router } from 'express'

import { submitFeedback, getStats, runAnalysis } from '../controllers/feedbackController'

const router = Router()

router.post('/', submitFeedback)
router.get('/stats', getStats)
router.post('/analyze', runAnalysis)

export default router
