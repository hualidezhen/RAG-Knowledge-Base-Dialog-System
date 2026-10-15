/**
 * 基于知识库上下文执行问答的 Tool，供 Agent 调用。
 * 接收完整的对话消息列表，自动提取最后一条用户消息作为当前问题，
 * 之前的消息作为历史上下文，调用 RAG 服务生成非流式回答。
 */

import { Tool, ChatMessage } from '../types'
import { getRagService } from '../services/ragService'

export const chatWithContextTool: Tool = {
  name: 'chat_with_context',                                   // 工具名称，Agent 通过此名称调用
  description: '基于知识库上下文进行问答',                       // 工具描述，告诉 LLM 此工具的功能
  parameters: [                                                 // 参数定义列表
    { name: 'messages', type: 'array', description: '对话消息列表', required: true },
    { name: 'temperature', type: 'number', description: '生成温度 (0-1)', required: false },
  ],
  async execute(args) {
    // 从参数中提取消息列表和可选温度参数
    const messages = args.messages as ChatMessage[]
    const temperature = args.temperature as number | undefined

    // 检查消息列表是否为空
    if (!messages || messages.length === 0) {
      throw new Error('messages 不能为空')
    }

    // 筛选出所有用户消息，最后一条作为当前问题
    const userMessages = messages.filter((m) => m.role === 'user')
    const lastMessage = userMessages[userMessages.length - 1]

    // 历史消息 = 最后一条用户消息之前的所有消息（包括 system/assistant 消息）
    const lastUserIdx = messages.lastIndexOf(lastMessage)
    const history = messages.slice(0, lastUserIdx)

    // 调用 RAG 服务的非流式问答接口，传入当前问题和历史上下文
    const result = await getRagService().generateAnswerNonStreaming(lastMessage.content, {
      temperature,
      history,
    })

    return result
  },
}
