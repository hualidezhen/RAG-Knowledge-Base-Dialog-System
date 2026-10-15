// ========== 路由: 会话管理 ==========
// 挂载路径: /api/sessions
// 提供会话的创建、列表、查询和删除功能

import { Router } from 'express'
import { createSession, listSessions, getSession, deleteSession } from '../controllers/sessionController'

const router = Router()

router.post('/', createSession)
router.get('/', listSessions)
router.get('/:id', getSession)
router.delete('/:id', deleteSession)

export default router
