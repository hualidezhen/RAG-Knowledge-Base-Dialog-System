// ========== 路由: 智能体对话 ==========
// 挂载路径: /api/agent
// 接收用户消息并返回 SSE 流式响应（ReAct 推理 + 工具调用）

import { Router } from 'express'
import { agentChat } from '../controllers/agentController'

const router = Router()

router.post('/chat', agentChat)

export default router
