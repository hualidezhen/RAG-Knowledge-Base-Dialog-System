import { Request, Response } from 'express'
import { getAgentService } from '../services/agentService'

/**
 * Agent 控制器
 * 处理智能体聊天请求，委托给 agentService 进行 ReAct 推理并流式输出
 */

/**
 * 处理 Agent 聊天请求
 * 验证输入消息，提取 API Key，委托给 agentService 执行 ReAct 推理循环并流式输出思考和工具调用过程
 */
export async function agentChat(req: Request, res: Response): Promise<void> {
  const { message, temperature, history, collection, sessionId } = req.body

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({ error: '消息不能为空' })
    return
  }

  // 从 Authorization 请求头中提取 Deepseek API Key（可选，用于覆盖默认 Key）
  let apiKey: string | undefined
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7).trim()
  }

  await getAgentService().streamChat(message.trim(), res, {
    apiKey: apiKey || undefined,
    temperature,
    history,
    collection,
    sessionId,
  })
}
