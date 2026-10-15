import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { RetrievedChunk, HistoryMessage } from '../api/chat'
import { chatStream } from '../api/chat'
import { submitFeedback as apiSubmitFeedback } from '../api/feedback'

// 聊天消息接口
export interface ChatMessage {
  id: string                        // 消息唯一标识
  role: 'user' | 'assistant'       // 消息角色：用户或助手
  content: string                   // 消息文本内容（流式响应时会逐步追加）
  sources?: RetrievedChunk[]        // 引用的知识库文档片段
  error?: string                    // 错误信息（生成失败时填充）
  feedback?: { rating: number; comment?: string }  // 用户评分反馈
}

// 已保存的会话接口
export interface SavedSession {
  id: string          // 会话唯一标识
  name: string        // 会话名称（自动生成或用户自定义）
  timestamp: number   // 保存时的时间戳
  messages: ChatMessage[]  // 会话包含的消息列表
}

// 生成唯一 ID：基于当前时间戳（36 进制）和随机数组合
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// 生成默认会话名称：格式为"对话 MM-DD HH:mm"
function formatSessionName(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `对话 ${month}-${day} ${hours}:${minutes}`
}

// 格式化时间戳为完整日期时间字符串（用于导出文件名和时间显示）
function formatExportTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const SESSIONS_KEY = 'rag_saved_sessions'  // localStorage 键名

// 从 localStorage 加载已保存的会话列表
function loadSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []  // 数据损坏时返回空列表
  }
}

// 将会话列表持久化到 localStorage
function persistSessions(sessions: SavedSession[]) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
  } catch {
    // localStorage 满时静默失败
  }
}

// 聊天 Store：管理消息列表、流式响应、会话持久化和反馈提交
export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])  // 当前会话的消息列表
  const streaming = ref(false)  // 是否正在流式接收响应
  const savedSessions = ref<SavedSession[]>(loadSessions())  // 已保存的会话列表（从 localStorage 加载）
  const currentCollection = ref(localStorage.getItem('currentCollection') || 'rag_knowledge')  // 当前知识库名称
  let abortController: AbortController | null = null  // 用于中断流式请求的 AbortController

  // 清空当前会话的所有消息
  function clearMessages() {
    messages.value = []
  }

  // 保存当前会话到 localStorage，可选自定义名称
  function saveSession(name?: string) {
    const sessionName = name?.trim() || formatSessionName()
    const session: SavedSession = {
      id: generateId(),
      name: sessionName,
      timestamp: Date.now(),
      messages: JSON.parse(JSON.stringify(messages.value)),  // 深拷贝消息列表
    }
    savedSessions.value.unshift(session)
    persistSessions(savedSessions.value)
  }

  // 从已保存的会话中加载指定会话的消息
  function loadSession(id: string) {
    const session = savedSessions.value.find((s) => s.id === id)
    if (session) {
      messages.value = JSON.parse(JSON.stringify(session.messages))  // 深拷贝恢复
    }
  }

  // 删除指定 ID 的已保存会话
  function deleteSession(id: string) {
    savedSessions.value = savedSessions.value.filter((s) => s.id !== id)
    persistSessions(savedSessions.value)
  }

  // 导出当前会话为 Markdown 格式字符串
  function exportMarkdown(): string {
    const timestamp = formatExportTime(Date.now())
    const lines: string[] = [
      `# 对话记录\n`,
      `导出时间: ${timestamp}\n`,
      `---\n`,
    ]

    for (const msg of messages.value) {
      if (msg.role === 'user') {
        lines.push(`## 用户\n`)
        lines.push(`${msg.content}\n`)
      } else if (msg.role === 'assistant') {
        if (msg.error) {
          lines.push(`## 助手\n`)
          lines.push(`*[回答生成失败]* ${msg.error}\n`)
        } else {
          lines.push(`## 助手\n`)
          lines.push(`${msg.content}\n`)
          if (msg.sources && msg.sources.length > 0) {
            lines.push(`**参考资料:**\n`)
            for (const src of msg.sources) {
              lines.push(`- [${src.fileName} 片段 #${src.chunkIndex + 1}]\n`)
            }
            lines.push(`\n`)
          }
        }
      }
      lines.push(`---\n`)
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n')
  }

  // 中断当前正在进行的流式请求
  function abortStream() {
    abortController?.abort()
    abortController = null
  }

  // ---- 核心：启动流式请求，通过 SSE 接收逐 token 响应 ----
  async function startStream(msgIndex: number, userMessage: string) {
    if (streaming.value) {
      abortStream()
    }

    streaming.value = true
    abortController = new AbortController()

    const temperature = localStorage.getItem('temperature')
    const temp = temperature ? parseFloat(temperature) : undefined

    // 构建对话历史：取当前用户消息之前的消息（排除当前消息和空的助手消息）
    const history: HistoryMessage[] = messages.value
      .slice(0, msgIndex - 1)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const response = await chatStream(userMessage, temp, history, currentCollection.value)

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(body ? `请求失败: ${body}` : `请求失败 (${response.status})`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      // ---- SSE 流式解析循环 ----
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop()!

        for (const part of parts) {
          const trimmedPart = part.trim()
          if (!trimmedPart) continue

          if (trimmedPart === 'data: [DONE]') {
            streaming.value = false
            return
          }

          if (trimmedPart.startsWith('data: ')) {
            const jsonStr = trimmedPart.slice(6)
            try {
              const event = JSON.parse(jsonStr)
              const msg = messages.value[msgIndex]
              if (!msg) continue

              if (event.type === 'heartbeat') {
                // 心跳事件，静默忽略（用于保持连接活跃）
              } else if (event.type === 'sources') {
                msg.sources = event.sources  // 收到知识库引用来源
              } else if (event.type === 'token') {
                msg.content += event.content  // 追加流式生成的文本 token
              } else if (event.type === 'error') {
                streaming.value = false
                msg.error = event.message
                ElMessage.error(event.message)
                return
              }
            } catch {
              console.warn('SSE 解析警告：无法解析数据', jsonStr)
            }
          }
        }
      }

      streaming.value = false
    } catch (err: unknown) {
      streaming.value = false
      if (err instanceof Error && err.name === 'AbortError') return

      const errMsg = err instanceof Error ? err.message : '网络连接失败'
      const msg = messages.value[msgIndex]
      if (msg) {
        msg.error = errMsg
      }
      ElMessage.error(errMsg)
    }
  }

  // 发送用户消息：将消息加入列表后启动流式请求
  async function sendMessage(userMessage: string) {
    const trimmed = userMessage.trim()
    if (!trimmed) return

    messages.value.push({ id: generateId(), role: 'user', content: trimmed })
    const msgIndex = messages.value.length
    messages.value.push({ id: generateId(), role: 'assistant', content: '' })

    await startStream(msgIndex, trimmed)
  }

  // 提交用户评分反馈（同时更新本地状态并发送到后端）
  async function submitFeedback(messageId: string, rating: number, comment?: string) {
    const msg = messages.value.find((m) => m.id === messageId)
    if (!msg) return
    msg.feedback = { rating, comment }
    try {
      await apiSubmitFeedback({ messageId, rating, comment })
    } catch {
      // 后端提交失败时，本地状态已保存，无需回滚
    }
  }

  // 重试生成：重置错误消息状态后重新流式请求
  async function retry(errorIndex: number) {
    if (streaming.value) {
      abortStream()
    }

    const userMsg = messages.value[errorIndex - 1]
    if (!userMsg || userMsg.role !== 'user') return

    // 重置错误消息的字段为初始状态
    const msg = messages.value[errorIndex]
    if (msg) {
      msg.content = ''
      msg.error = undefined
      msg.sources = undefined
    }

    await startStream(errorIndex, userMsg.content)
  }

  return { messages, streaming, savedSessions, currentCollection, sendMessage, clearMessages, abortStream, retry, submitFeedback, saveSession, loadSession, deleteSession, exportMarkdown }
})