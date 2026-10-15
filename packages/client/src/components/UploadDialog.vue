<template>
  <el-dialog
    v-model="visible"
    title="上传文档"
    width="500px"
    :close-on-click-modal="false"
    destroy-on-close
    @closed="resetUploadState"
  >
    <!-- ---- 上传区域（上传成功后隐藏） ---- -->
    <template v-if="!uploadSuccess">
      <el-upload
        ref="uploadRef"
        action="/api/documents/upload"
        multiple
        :accept="acceptTypes"
        :name="'files'"
        :auto-upload="true"
        :limit="0"
        :data="props.collection ? { collection: props.collection } : undefined"
        :on-success="handleSuccess"
        :on-error="handleError"
        :on-progress="handleProgress"
        :file-list="fileList"
        drag
      >
        <el-icon :size="40" class="upload-icon"><UploadFilled /></el-icon>
        <div class="upload-text">
          将文件拖拽到此处，或<em>点击上传</em>
        </div>
        <template #tip>
          <div class="upload-tip">
            支持 PDF、DOCX、TXT 格式，单个文件最大 50MB
          </div>
        </template>
      </el-upload>

      <!-- ---- 上传进度条 ---- -->
      <div v-if="uploadProgress > 0" class="progress-wrapper">
        <el-progress
          :percentage="uploadProgress"
          :status="uploadProgress === 100 ? 'success' : undefined"
          :stroke-width="16"
          :text-inside="true"
        />
      </div>
    </template>

    <!-- ---- 上传成功状态 ---- -->
    <div v-else class="success-wrapper">
      <el-result icon="success" :title="successMessage" sub-title="">
        <template #extra>
          <el-button type="primary" @click="visible = false">知道了</el-button>
        </template>
      </el-result>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { useDocumentStore } from '../stores/documents'

// 组件属性：指定上传到的知识库名称（可选）
const props = withDefaults(defineProps<{
  collection?: string
}>(), {
  collection: undefined,
})

const acceptTypes = '.pdf,.docx,.txt'  // 支持的文件类型

const visible = ref(false)  // 弹窗显示状态
const uploadRef = ref<any>(null)  // el-upload 组件引用
const fileList = ref<any[]>([])  // 已选取的文件列表

const uploadProgress = ref(0)  // 上传进度百分比（0-100）
const uploadSuccess = ref(false)  // 上传是否成功完成
const successMessage = ref('')  // 上传成功后的提示消息

const store = useDocumentStore()

// 重置上传状态到初始值（关闭弹窗时触发）
function resetUploadState() {
  uploadProgress.value = 0
  uploadSuccess.value = false
  successMessage.value = ''
  fileList.value = []
}

// 打开上传弹窗
function open() {
  resetUploadState()
  visible.value = true
}

// 上传进度回调：记录当前进度，上限锁定在 99%（等服务器确认后才跳到 100%）
function handleProgress(evt: any, _file: any, _fileList: any[]) {
  const pct = Math.round(evt.percent || 0)
  uploadProgress.value = Math.min(99, pct)
}

// 上传成功回调：进度跳 100%，显示成功状态，刷新文档列表
function handleSuccess(response: any) {
  uploadProgress.value = 100
  uploadSuccess.value = true
  successMessage.value = response.message || '上传成功'
  store.fetchDocuments(props.collection)
}

// 上传失败回调：重置进度，显示错误消息
function handleError(err: any) {
  uploadProgress.value = 0
  const msg =
    err?.message ||
    (err?.response?.data as any)?.error ||
    '上传失败'
  ElMessage.error(msg)
}

defineExpose({ open })  // 向父组件暴露 open 方法
</script>

<style scoped>
.upload-icon {
  margin-bottom: 12px;
  color: var(--el-color-primary);
}

.upload-text {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.upload-text em {
  color: var(--el-color-primary);
  font-style: normal;
}

.upload-tip {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin-top: 8px;
}

.progress-wrapper {
  margin-top: 20px;
  padding: 0 4px;
}

.success-wrapper {
  padding: 20px 0;
}
</style>
