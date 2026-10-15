/**
 * 检索到的文档片段 —— 由 RAG 向量检索返回的结果
 */
export interface RetrievedChunk {
  content: string      // 片段文本内容
  fileName: string     // 来源文档文件名
  chunkIndex: number   // 在文档中的分片序号
  distance: number     // 与查询向量的距离（越小越相关）
}

/**
 * SSE 事件 —— 来源数据（知识库检索到的相关片段列表）
 */
export interface SourceEvent {
  type: 'sources'
  sources: RetrievedChunk[]
}

/**
 * SSE 事件 —— 流式生成的文本 token（逐块传输）
 */
export interface TokenEvent {
  type: 'token'
  content: string
}

/**
 * SSE 事件 —— 错误信息
 */
export interface ErrorEvent {
  type: 'error'
  message: string
}

/**
 * SSE 事件联合类型 —— 聊天端点返回的每一条 data 都是其中一种
 */
export type SSEEvent = SourceEvent | TokenEvent | ErrorEvent

/**
 * 对话历史中的单条消息
 */
export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * 发起流式聊天请求（SSE，Server-Sent Events）
 *
 * 使用原生 fetch 而非 axios，以便逐行读取 SSE 数据流。
 * 返回的 Response.body 需要通过 ReadableStream 逐一解析 data: 事件。
 *
 * @param message    当前用户输入的消息
 * @param temperature 生成温度（可选，控制随机性，默认由服务端决定）
 * @param history    历史对话消息数组（可选，用于多轮对话上下文）
 * @param collection 知识库名称（可选，指定检索的知识库范围）
 * @returns          标准的 Response 对象，其 body 为 SSE 流
 */
export function chatStream(
  message: string,
  temperature?: number,
  history?: HistoryMessage[],
  collection?: string
): Promise<Response> {
  const apiKey = localStorage.getItem('apiKey')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  return fetch('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, temperature, history, collection }),
  })
}