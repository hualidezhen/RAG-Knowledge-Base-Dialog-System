// ========== 路由: 对话聊天 ==========
// 挂载路径: /api/chat
// 接收用户消息并返回 SSE 流式响应（RAG 增强对话）

import { Router } from 'express'
import { chat } from '../controllers/chatController'

const router = Router()

router.post('/', chat)

export default router
