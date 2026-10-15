<template>
  <el-container class="chat-container" direction="vertical">
    <el-main class="chat-main">
      <!-- ---- 空状态引导区 ---- -->
      <!-- 无消息时显示欢迎引导，建议用户上传文档后尝试提问 -->
      <div v-if="!chatStore.messages.length" class="empty-state">
        <div class="welcome-icon">
          <el-icon :size="48"><ChatLineSquare /></el-icon>
        </div>
        <h2 class="welcome-title">欢迎使用知识库问答系统</h2>
        <p class="welcome-desc">上传文档后，试试问我这些问题：</p>
        <div class="suggestion-grid">
          <div
            v-for="(q, i) in suggestions"
            :key="i"
            class="suggestion-card"
            @click="fillSuggestion(q)"
          >
            <el-icon><ChatDotRound /></el-icon>
            <span>{{ q }}</span>
          </div>
        </div>
      </div>

      <!-- ---- 消息列表区 ---- -->
      <el-scrollbar
        v-show="chatStore.messages.length > 0"
        ref="scrollbarRef"
        class="chat-scrollbar"
        view-class="chat-scrollbar-view"
      >
        <div class="chat-messages">
          <div
            v-for="(msg, idx) in chatStore.messages"
            :key="idx"
            class="message-wrapper"
            :class="{ 'is-user': msg.role === 'user', 'is-assistant': msg.role === 'assistant' }"
          >
            <div
              class="message-bubble"
              :class="msg.role === 'user' ? 'message-user' : 'message-assistant'"
            >
              <!-- ---- 错误状态区 ---- -->
              <div v-if="msg.role === 'assistant' && msg.error" class="message-error">
                <div class="error-header">
                  <el-icon :size="16" color="#f56c6c"><WarningFilled /></el-icon>
                  <span>回答生成失败</span>
                </div>
                <div class="error-body">{{ msg.error }}</div>
                <el-button
                  size="small"
                  type="danger"
                  round
                  :disabled="chatStore.streaming"
                  @click="chatStore.retry(idx)"
                >
                  重新发送
                </el-button>
              </div>

              <!-- ---- 正常内容区 ---- -->
              <template v-else>
                <div
                  v-if="msg.role === 'assistant'"
                  class="message-content markdown-body"
                  v-html="renderMarkdown(msg.content)"
                />
                <div v-else class="message-content">{{ msg.content }}</div>
              </template>

              <!-- ---- 知识库引用来源区 ---- -->
              <div v-if="msg.sources && msg.sources.length > 0" class="sources-section">
                <el-collapse accordion>
                  <el-collapse-item :title="`参考资料 (${msg.sources.length} 条)`" name="sources">
                    <div v-for="(source, si) in msg.sources" :key="si" class="source-item">
                      <div class="source-header">
                        <el-tag size="small" type="info">
                          {{ source.fileName }}
                        </el-tag>
                        <span class="source-index">片段 #{{ source.chunkIndex + 1 }}</span>
                      </div>
                      <div class="source-content">{{ source.content }}</div>
                    </div>
                  </el-collapse-item>
                </el-collapse>
              </div>

              <!-- ---- 用户反馈区 ---- -->
              <div v-if="msg.role === 'assistant' && !msg.error" class="feedback-section">
                <!-- 已评分状态 -->
                <div v-if="msg.feedback" class="feedback-done">
                  <span class="rated-text">已评分 {{ msg.feedback.rating }} 星</span>
                </div>
                <!-- 未评分状态 -->
                <div v-else>
                  <div class="feedback-buttons">
                    <el-button
                      size="small"
                      text
                      :type="activeFeedback === msg.id ? 'primary' : 'default'"
                      @click="activeFeedback = activeFeedback === msg.id ? '' : msg.id"
                    >
                      <el-icon :size="14"><Star /></el-icon>
                      <span style="margin-left: 4px">评价</span>
                    </el-button>
                  </div>
                  <Transition name="fade">
                    <div v-if="activeFeedback === msg.id" class="feedback-form">
                      <el-rate v-model="feedbackRating" :max="5" show-score score-template="{value}" />
                      <el-input
                        v-model="feedbackComment"
                        placeholder="选填：补充说明"
                        size="small"
                        :rows="2"
                        type="textarea"
                        style="margin-top: 8px"
                      />
                      <div style="margin-top: 8px; text-align: right">
                        <el-button size="small" @click="cancelFeedback">取消</el-button>
                        <el-button size="small" type="primary" @click="submitRating(msg.id)">提交</el-button>
                      </div>
                    </div>
                  </Transition>
                </div>
              </div>
            </div>
          </div>

          <!-- ---- 流式响应指示器 ---- -->
          <div v-if="chatStore.streaming" class="streaming-indicator">
            <span class="streaming-dot" />
            <span class="streaming-text">正在生成回答...</span>
          </div>
        </div>
      </el-scrollbar>
    </el-main>

    <!-- ---- 输入区 ---- -->
    <div class="input-area">
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="3"
        :disabled="chatStore.streaming"
        placeholder="输入您的问题，Enter 发送，Shift+Enter 换行"
        @keydown.enter.prevent="handleSend"
      />
      <div class="input-actions">
        <div class="input-actions-left">
          <el-button
            :icon="Collection"
            size="small"
            text
            :disabled="!chatStore.messages.length || chatStore.streaming"
            @click="handleSaveClick"
          >
            保存对话
          </el-button>
          <el-button
            :icon="FolderOpened"
            size="small"
            text
            :disabled="!chatStore.savedSessions.length"
            @click="handleLoadClick"
          >
            加载已保存
          </el-button>
          <el-button
            :icon="Download"
            size="small"
            text
            :disabled="!chatStore.messages.length"
            @click="handleExportMarkdown"
          >
            导出 Markdown
          </el-button>
          <el-button
            :icon="Delete"
            size="small"
            text
            :disabled="!chatStore.messages.length || chatStore.streaming"
            @click="handleClear"
          >
            清空对话
          </el-button>
        </div>
        <el-button
          type="primary"
          :icon="Promotion"
          :loading="chatStore.streaming"
          :disabled="!inputText.trim()"
          @click="handleSend"
        >
          发送
        </el-button>
      </div>
    </div>
  </el-container>

  <!-- ---- 保存会话对话框 ---- -->
  <el-dialog v-model="saveDialogVisible" title="保存对话" width="400px">
    <el-input v-model="saveSessionName" placeholder="输入对话名称（可选）" maxlength="50" />
    <template #footer>
      <el-button @click="saveDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="handleSaveConfirm">确认保存</el-button>
    </template>
  </el-dialog>

  <!-- ---- 加载已保存会话对话框 ---- -->
  <el-dialog v-model="loadDialogVisible" title="加载已保存的对话" width="500px">
    <el-table :data="chatStore.savedSessions" style="width: 100%" size="small">
      <el-table-column label="名称" prop="name" min-width="140" />
      <el-table-column label="保存时间" width="150">
        <template #default="scope">
          {{ formatExportTime(scope.row.timestamp) }}
        </template>
      </el-table-column>
      <el-table-column label="消息数" width="80" align="center">
        <template #default="scope">
          {{ scope.row.messages.length }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" align="center">
        <template #default="scope">
          <el-button
            size="small"
            type="primary"
            link
            :disabled="chatStore.streaming"
            @click="handleLoadSession(scope.row.id)"
          >
            加载
          </el-button>
          <el-button
            size="small"
            type="danger"
            link
            @click="chatStore.deleteSession(scope.row.id)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="loadDialogVisible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { Delete, Promotion, ChatLineSquare, ChatDotRound, WarningFilled, Collection, FolderOpened, Download, Star } from '@element-plus/icons-vue'
import type { ElScrollbar } from 'element-plus'
import MarkdownIt from 'markdown-it'  // Markdown 渲染引擎，将 Markdown 文本转换为 HTML
import { useChatStore } from '../stores/chat'

// 初始化 Markdown 渲染器
const md = new MarkdownIt({
  linkify: true,   // 自动识别 URL 并转为可点击链接
  breaks: true,    // 将换行转换为 <br>
})

const chatStore = useChatStore()  // 聊天 Store，管理消息列表和流式响应状态
const inputText = ref('')  // 输入框绑定的文本
const scrollbarRef = ref<InstanceType<typeof ElScrollbar>>()  // 滚动条组件引用，用于自动滚动到底部
const saveDialogVisible = ref(false)  // 保存会话弹窗显示状态
const saveSessionName = ref('')  // 保存时自定义的会话名称
const loadDialogVisible = ref(false)  // 加载会话弹窗显示状态

// ---- 反馈相关状态 ----
const activeFeedback = ref('')       // 当前展开评价面板的消息 ID，空值表示无展开
const feedbackRating = ref(0)        // 用户选择的评分（1-5 星）
const feedbackComment = ref('')      // 用户填写的评价补充说明

// 取消评价：重置所有反馈状态并关闭评价面板
function cancelFeedback() {
  activeFeedback.value = ''
  feedbackRating.value = 0
  feedbackComment.value = ''
}

// 提交评分：调用 Store 方法并重置表单
function submitRating(messageId: string) {
  if (feedbackRating.value < 1) return  // 至少选择 1 星
  chatStore.submitFeedback(messageId, feedbackRating.value, feedbackComment.value || undefined)
  cancelFeedback()
}

// 格式化时间戳为完整的日期时间字符串
function formatExportTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 预设的快捷提问建议列表
const suggestions = [
  '知识库中有哪些文档？',
  '文档的主要内容是什么？',
  '帮我总结一下知识库的内容',
  '搜索关于某个主题的信息',
]

// 点击建议卡片时填充到输入框，并聚焦文本框
function fillSuggestion(text: string) {
  inputText.value = text
  nextTick(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('.input-area textarea')
    textarea?.focus()
  })
}

// 使用 markdown-it 将 Markdown 文本渲染为 HTML
function renderMarkdown(content: string): string {
  if (!content) return '<span class="thinking-placeholder">思考中…</span>'
  return md.render(content)
}

// 将消息列表滚动到底部，确保最新消息可见
function scrollToBottom() {
  nextTick(() => {
    const wrap = scrollbarRef.value?.wrapRef
    if (wrap) {
      wrap.scrollTop = wrap.scrollHeight
    }
  })
}

// 发送用户输入的消息
function handleSend() {
  const text = inputText.value
  if (!text.trim() || chatStore.streaming) return

  inputText.value = ''  // 清空输入框
  chatStore.sendMessage(text)
  scrollToBottom()  // 发送后滚动到底部等待响应
}

// 清空当前对话消息
function handleClear() {
  chatStore.clearMessages()
}

// 打开保存会话对话框
function handleSaveClick() {
  saveSessionName.value = ''
  saveDialogVisible.value = true
}

// 确认保存当前会话
function handleSaveConfirm() {
  chatStore.saveSession(saveSessionName.value || undefined)
  saveDialogVisible.value = false
}

// 导出当前对话为 Markdown 文件并触发下载
function handleExportMarkdown() {
  const markdown = chatStore.exportMarkdown()
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
  a.download = `对话记录_${ts}.md`
  a.click()
  URL.revokeObjectURL(url)
}

// 打开加载会话对话框
function handleLoadClick() {
  loadDialogVisible.value = true
}

// 加载指定 ID 的已保存会话
function handleLoadSession(id: string) {
  chatStore.loadSession(id)
  loadDialogVisible.value = false
}

// 监听消息数量变化，新增消息后自动滚动到底部
watch(
  () => chatStore.messages.length,
  () => scrollToBottom(),
)

// 监听流式响应内容变化，持续滚动到底部以显示最新 token
watch(
  () => {
    if (chatStore.messages.length === 0) return ''
    const last = chatStore.messages[chatStore.messages.length - 1]
    return last.role === 'assistant' ? last.content : ''
  },
  () => {
    if (chatStore.streaming) scrollToBottom()
  },
)

// 组件卸载时中断未完成的流式请求
onUnmounted(() => {
  chatStore.abortStream()
})
</script>

<style scoped>
.chat-container {
  height: 100%;
  background-color: var(--main-bg);
}

/* ===== 空状态引导区 ===== */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.welcome-icon {
  color: var(--el-color-primary);
  opacity: 0.6;
  margin-bottom: 16px;
}

.welcome-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.welcome-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.suggestion-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  max-width: 480px;
  width: 100%;
}

.suggestion-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--main-bg);
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.suggestion-card:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.12);
  transform: translateY(-1px);
}

/* ===== 消息列表区 ===== */
.chat-main {
  flex: 1;
  overflow: hidden;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.chat-scrollbar {
  flex: 1;
  height: 100%;
}

.chat-scrollbar-view {
  padding: 20px;
}

.chat-messages {
  max-width: 800px;
  margin: 0 auto;
}

.message-wrapper {
  display: flex;
  margin-bottom: 20px;
  animation: fadeIn 0.25s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.message-wrapper.is-user {
  justify-content: flex-end;
}

.message-wrapper.is-assistant {
  justify-content: flex-start;
}

.message-bubble {
  max-width: 75%;
  padding: 12px 16px;
  border-radius: 12px;
  line-height: 1.6;
  word-break: break-word;
  font-size: 14px;
}

.message-user {
  background-color: var(--el-color-primary);
  color: #fff;
  border-bottom-right-radius: 4px;
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.2);
}

.message-assistant {
  background-color: #f5f7fa;
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.message-content {
  white-space: pre-wrap;
}

.message-user .message-content {
  color: #fff;
}

/* ===== 错误状态区 ===== */
.message-error {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #f56c6c;
  font-size: 13px;
}

.error-body {
  font-size: 13px;
  color: #606266;
  background: #fef0f0;
  padding: 8px 10px;
  border-radius: 6px;
  line-height: 1.5;
  word-break: break-all;
}

.message-error .el-button {
  align-self: flex-start;
}

/* ===== Markdown 渲染 ===== */
.thinking-placeholder {
  color: var(--text-secondary);
  font-style: italic;
}

:deep(.markdown-body p) {
  margin: 0 0 8px;
}

:deep(.markdown-body p:last-child) {
  margin-bottom: 0;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  padding-left: 20px;
  margin: 4px 0;
}

:deep(.markdown-body code) {
  background-color: rgba(0, 0, 0, 0.06);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-family: 'Courier New', Courier, monospace;
}

:deep(.markdown-body pre) {
  background-color: #282c34;
  color: #abb2bf;
  padding: 14px 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

:deep(.markdown-body pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

:deep(.markdown-body table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 13px;
}

:deep(.markdown-body th),
:deep(.markdown-body td) {
  border: 1px solid var(--border-color);
  padding: 6px 10px;
  text-align: left;
}

:deep(.markdown-body th) {
  background-color: #f0f2f5;
  font-weight: 600;
}

:deep(.markdown-body blockquote) {
  border-left: 3px solid var(--el-color-primary);
  padding-left: 12px;
  color: var(--text-secondary);
  margin: 8px 0;
}

/* ===== 流式响应指示器 ===== */
.streaming-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 4px;
  margin-top: -12px;
  margin-bottom: 8px;
}

.streaming-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  background-color: var(--el-color-primary);
  border-radius: 50%;
  animation: pulse 1.2s ease-in-out infinite;
}

.streaming-text {
  font-size: 12px;
  color: var(--text-secondary);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ===== 知识库引用来源区 ===== */
.sources-section {
  margin-top: 12px;
  border-top: 1px solid var(--border-color);
  padding-top: 8px;
}

.source-item {
  padding: 8px 0;
}

.source-item + .source-item {
  border-top: 1px dashed var(--border-color);
  margin-top: 4px;
}

.source-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

/* ===== 用户反馈区 ===== */
.feedback-section {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.feedback-buttons {
  display: flex;
  gap: 8px;
}

.feedback-form {
  margin-top: 10px;
  padding: 12px;
  background: var(--aside-bg);
  border-radius: 8px;
}

.feedback-done {
  font-size: 12px;
  color: var(--text-secondary);
}

.rated-text {
  color: var(--el-color-primary);
  font-weight: 500;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.source-index {
  font-size: 12px;
  color: var(--text-secondary);
}

.source-content {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-y: auto;
  padding: 6px 8px;
  background-color: #fafafa;
  border-radius: 6px;
}

/* ===== 输入区 ===== */
.input-area {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border-color);
  background: var(--main-bg);
  flex-shrink: 0;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.input-actions-left {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
