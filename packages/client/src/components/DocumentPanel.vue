<template>
  <div class="document-panel">
    <!-- ---- 页眉 ---- -->
    <div class="panel-header">
      <el-icon :size="18"><FolderOpened /></el-icon>
      <span>知识库文档</span>
    </div>

    <!-- ---- 导航栏：对话 / 监控看板 ---- -->
    <div class="nav-bar">
      <el-button
        size="small"
        :type="route.path === '/' ? 'primary' : 'default'"
        @click="$router.push('/')"
        style="flex: 1"
      >
        对话
      </el-button>
      <el-button
        size="small"
        :type="route.path === '/monitor' ? 'primary' : 'default'"
        @click="$router.push('/monitor')"
        style="flex: 1"
      >
        监控看板
      </el-button>
    </div>

    <!-- ---- 知识库选择器 ---- -->
    <div class="kb-selector">
      <el-select
        v-model="currentKb"
        size="small"
        @change="handleKbChange"
        placeholder="选择知识库"
        style="width: 100%"
      >
        <el-option
          v-for="kb in kbList"
          :key="kb.name"
          :label="kb.name === 'rag_knowledge' ? '默认知识库' : kb.name"
          :value="kb.name"
        />
      </el-select>
      <el-button size="small" :icon="Plus" @click="showCreateKbDialog" style="flex-shrink: 0" />
    </div>

    <!-- ---- 上传按钮 ---- -->
    <div class="panel-actions">
      <el-button type="primary" @click="openUpload" :icon="Upload" style="width: 100%">
        上传文档
      </el-button>
    </div>

    <!-- ---- 文档表格 ---- -->
    <div class="panel-body">
      <el-skeleton v-if="store.loading" :rows="4" animated />
      <el-empty v-else-if="store.documents.length === 0" description="暂无文档" />

      <el-table
        v-else
        :data="store.documents"
        stripe
        size="small"
        style="width: 100%"
        :show-header="true"
      >
        <el-table-column label="文件名" prop="fileName" min-width="110" show-overflow-tooltip />
        <el-table-column label="块数" prop="chunkCount" width="50" align="center" />
        <el-table-column label="上传时间" width="90" align="center">
          <template #default="{ row }">
            <span class="time-cell">{{ formatTime(row.uploadTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="center">
          <template #default="{ row }">
            <span class="action-group">
              <el-button text size="small" type="primary" @click="handleViewContent(row)">
                查看
              </el-button>
              <el-button text size="small" type="danger" @click="handleDelete(row)">
                删除
              </el-button>
            </span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <MiniMonitorPanel />

    <!-- ---- 底部配置区：API Key / Temperature / 清空 ---- -->
    <div class="panel-footer">
      <div class="footer-section">
        <div class="footer-label">API Key <span class="footer-optional">(可选)</span></div>
        <el-input
          v-model="apiKey"
          type="password"
          show-password
          placeholder="输入 DeepSeek API Key"
          size="small"
          clearable
        />
      </div>

      <div class="footer-section">
        <div class="footer-label">Temperature: {{ temperature.toFixed(1) }}</div>
        <el-slider
          v-model="temperature"
          :min="0"
          :max="1"
          :step="0.1"
          size="small"
        />
      </div>

      <div class="footer-actions">
        <el-button
          size="small"
          :icon="Delete"
          :disabled="!chatStore.messages.length"
          @click="handleClear"
          style="width: 100%"
        >
          清空对话
        </el-button>
      </div>
    </div>

    <!-- ---- 文档内容查看器 ---- -->
    <el-dialog
      v-model="contentDialogVisible"
      :title="contentDialogTitle"
      width="700px"
      top="5vh"
      destroy-on-close
    >
      <div v-if="contentLoading" style="text-align: center; padding: 40px;">
        <el-skeleton :rows="8" animated />
      </div>
      <div v-else-if="contentError" class="content-error">
        <el-alert :title="contentError" type="error" show-icon />
      </div>
      <pre v-else class="content-body">{{ documentContent }}</pre>
    </el-dialog>

    <UploadDialog ref="uploadDialogRef" :collection="currentKb" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { FolderOpened, Upload, Delete, Plus } from '@element-plus/icons-vue'
import { useDocumentStore } from '../stores/documents'
import { useChatStore } from '../stores/chat'
import { getDocumentContent, deleteDocument } from '../api/document'
import { getKnowledgeBases, createKnowledgeBase } from '../api/knowledgeBase'
import type { KnowledgeBase } from '../api/knowledgeBase'
import { ElMessageBox, ElMessage } from 'element-plus'
import UploadDialog from './UploadDialog.vue'  // 上传文档弹窗组件
import MiniMonitorPanel from './MiniMonitorPanel.vue'  // 实时监控迷你面板

const route = useRoute()

const store = useDocumentStore()  // 文档管理 Store
const chatStore = useChatStore()  // 聊天 Store
const uploadDialogRef = ref<InstanceType<typeof UploadDialog>>()  // 上传弹窗组件引用

const kbList = ref<KnowledgeBase[]>([])  // 知识库列表
const currentKb = ref(chatStore.currentCollection)  // 当前选中的知识库名称

// 获取所有知识库列表
async function fetchKbList() {
  try {
    kbList.value = await getKnowledgeBases()
  } catch {
    // 静默降级，忽略错误
  }
}

// 切换知识库：更新 Store、本地存储并重新拉取文档列表
async function handleKbChange(name: string) {
  chatStore.currentCollection = name
  localStorage.setItem('currentCollection', name)
  store.fetchDocuments(name)
}

// 弹出创建知识库对话框
async function showCreateKbDialog() {
  try {
    const { value } = await ElMessageBox.prompt('请输入知识库名称', '创建知识库', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputValidator: (val: string) => !!val.trim() || '名称不能为空',
    })
    if (value) {
      await createKnowledgeBase(value.trim())
      await fetchKbList()
      ElMessage.success(`知识库 "${value}" 创建成功`)
    }
  } catch {
    // 用户取消操作，不做处理
  }
}

onMounted(() => {
  fetchKbList()  // 组件挂载时加载知识库列表
})

// API Key，持久化到 localStorage 中
const apiKey = ref(localStorage.getItem('apiKey') || '')
watch(apiKey, (val) => {
  localStorage.setItem('apiKey', val)
})

// Temperature 参数，持久化到 localStorage，默认 0.3
const temperature = ref(parseFloat(localStorage.getItem('temperature') || '0.3'))
watch(temperature, (val) => {
  if (isNaN(val)) temperature.value = 0.3
  localStorage.setItem('temperature', String(val))
})

// ---- 文档内容查看器状态 ----
const contentDialogVisible = ref(false)  // 查看器弹窗显示状态
const contentLoading = ref(false)  // 文档内容加载中
const documentContent = ref('')  // 加载到的文档内容
const contentError = ref('')  // 加载错误信息
const contentDialogTitle = ref('')  // 查看器弹窗标题

// 查看文档内容：调用后端接口获取原始文本
async function handleViewContent(doc: { fileName: string }) {
  contentDialogVisible.value = true
  contentLoading.value = true
  contentError.value = ''
  documentContent.value = ''
  contentDialogTitle.value = doc.fileName

  try {
    const content = await getDocumentContent(doc.fileName)
    documentContent.value = content
  } catch (err: any) {
    contentError.value = err?.message || '获取文件内容失败'
  } finally {
    contentLoading.value = false
  }
}

// 打开上传文件弹窗
function openUpload() {
  uploadDialogRef.value?.open()
}

// 删除文档：二次确认后调用接口删除并刷新列表
async function handleDelete(doc: { fileName: string }) {
  try {
    await ElMessageBox.confirm(`确定删除文档 "${doc.fileName}" 吗？`, '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await deleteDocument(doc.fileName, currentKb.value)
    ElMessage.success(`文档 "${doc.fileName}" 已删除`)
    store.fetchDocuments(currentKb.value)
  } catch {
    // 用户取消删除，不做处理
  }
}

// 清空对话消息
function handleClear() {
  chatStore.clearMessages()
}

// 格式化 ISO 时间字符串为 MM-DD HH:mm 格式
function formatTime(iso: string): string {
  const d = new Date(iso)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${min}`
}
</script>

<style scoped>
/* ===== 文档面板容器 ===== */
.document-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* ===== 页眉 ===== */
.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  background-color: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

/* ===== 知识库选择器 ===== */
.kb-selector {
  display: flex;
  gap: 6px;
  padding: 8px 16px 4px;
  flex-shrink: 0;
}

/* ===== 操作按钮区 ===== */
.panel-actions {
  padding: 8px 16px 12px;
  flex-shrink: 0;
}

.panel-actions .el-button {
  width: 100%;
}

/* ===== 文档列表主体 ===== */
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}

.time-cell {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* ===== 底部配置区 ===== */
.panel-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background-color: var(--aside-bg);
}

.footer-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.footer-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.footer-optional {
  font-weight: 400;
  color: var(--text-secondary);
  opacity: 0.7;
}

.footer-actions {
  padding-top: 2px;
}

/* ===== 文档内容查看器 ===== */
.content-body {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
  line-height: 1.7;
  max-height: 65vh;
  overflow-y: auto;
  background-color: #fafafa;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.content-error {
  padding: 20px;
}

.action-group {
  display: inline-flex;
  gap: 1px;
}
</style>
