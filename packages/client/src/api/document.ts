import request from './index'

/**
 * 文档列表中的条目信息
 */
export interface DocumentItem {
  fileName: string     // 文件名（含扩展名）
  fileType: string     // 文件类型（pdf / docx / txt 等）
  uploadTime: string   // 上传时间（ISO 格式字符串）
  chunkCount: number   // 文档被切分的片段数量
}

/**
 * 文档上传结果
 */
export interface UploadResult {
  documentId: string   // 服务端分配的唯一文档 ID
  fileName: string     // 文件名
  fileType: string     // 文件类型
  totalChunks: number  // 该文档总共生成的片段数
  success: boolean     // 上传和处理是否成功
}

/**
 * 获取知识库中的文档列表
 * @param collection 知识库名称（可选，不传则查询默认知识库）
 */
export async function getDocuments(collection?: string): Promise<DocumentItem[]> {
  const params = collection ? { collection } : undefined
  const res = await request.get<{ documents: DocumentItem[] }>('/api/documents', { params })
  return res.data.documents
}

/**
 * 上传文档到知识库（支持批量）
 * @param formData 包含文件的 FormData（字段名: file）
 * @param collection 目标知识库名称（可选）
 */
export async function uploadDocuments(formData: FormData, collection?: string): Promise<{ message: string; documents: UploadResult[] }> {
  if (collection) {
    formData.append('collection', collection)
  }
  const res = await request.post<{ message: string; documents: UploadResult[] }>('/api/documents/upload', formData)
  return res.data
}

/**
 * 获取指定文档的原始文本内容
 * @param fileName 文档文件名（将被 URL 编码）
 */
export async function getDocumentContent(fileName: string): Promise<string> {
  const res = await request.get<{ fileName: string; fileType: string; content: string }>(
    `/api/documents/${encodeURIComponent(fileName)}/content`
  )
  return res.data.content
}

/**
 * 删除知识库中的指定文档
 * @param fileName   要删除的文档文件名
 * @param collection 文档所在的知识库名称（可选）
 */
export async function deleteDocument(fileName: string, collection?: string): Promise<void> {
  const params = collection ? { collection } : undefined
  await request.delete(`/api/documents/${encodeURIComponent(fileName)}`, { params })
}