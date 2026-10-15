// ========== 路由: 监控系统 ==========
// 挂载路径: /api/monitor
// 提供指标查询、实时状态和错误日志查看功能

import { Router } from 'express'

import { getMetrics, getRealtime, getLogs } from '../controllers/monitorController'

const router = Router()

router.get('/metrics', getMetrics)
router.get('/realtime', getRealtime)
router.get('/logs', getLogs)

export default router
