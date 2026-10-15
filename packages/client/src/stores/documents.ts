import { defineStore } from 'pinia'  // Pinia 状态管理
import { ref } from 'vue'
import { getDocuments, uploadDocuments as apiUpload, type DocumentItem } from '../api/document'

// 文档管理 Store：维护文档列表及增删查操作
export const useDocumentStore = defineStore('documents', () => {
  const documents = ref<DocumentItem[]>([])  // 当前知识库的文档列表
  const loading = ref(false)  // 文档列表加载中状态

  // 从后端获取指定知识库的文档列表
  async function fetchDocuments(collection?: string) {
    loading.value = true
    try {
      documents.value = await getDocuments(collection)
    } catch {
      // api/index.ts 中的响应拦截器已用 ElMessage 显示错误，此处不做额外处理
    } finally {
      loading.value = false
    }
  }

  // 上传文档到知识库，返回上传结果
  async function uploadDocuments(formData: FormData, collection?: string) {
    return await apiUpload(formData, collection)
  }

  // Store 创建时自动拉取文档列表，保证进入页面即有数据
  fetchDocuments()

  return { documents, loading, fetchDocuments, uploadDocuments }
})
