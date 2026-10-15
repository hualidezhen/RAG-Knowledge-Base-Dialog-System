import { Request, Response } from 'express'
import { getRagService } from '../services/ragService'
import { ChatRequest } from '../types'

/**
 * 聊天控制器
 * 处理对话请求，从请求体中提取参数后委托给 ragService 生成流式响应
 */

/**
 * 处理聊天请求
 * 验证输入消息，提取 API Key（从 Authorization 头），委托给 ragService 以 SSE 流式返回回答
 */
export async function chat(req: Request, res: Response): Promise<void> {
  const { message, temperature, history, collection, sessionId } = req.body as ChatRequest

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

  await getRagService().generateAnswerStream(message.trim(), res, {
    apiKey: apiKey || undefined,
    temperature,
    history,
    collection,
    sessionId,
  })
}
