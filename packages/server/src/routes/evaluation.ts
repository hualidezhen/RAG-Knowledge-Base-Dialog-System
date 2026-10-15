// ========== 路由: 在线评估 ==========
// 挂载路径: /api/evaluation
// 提供测试集批量评估触发和评分趋势查询功能

import { Router } from 'express'

import { runEvaluation, getTrend } from '../controllers/evaluationController'

const router = Router()

router.post('/run', runEvaluation)
router.get('/trend', getTrend)

export default router
