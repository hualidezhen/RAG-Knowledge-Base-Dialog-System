import request from './index'

/**
 * 知识库基本信息
 */
export interface KnowledgeBase {
  name: string         // 知识库名称（唯一标识）
  description: string  // 知识库描述
  createdAt: string    // 创建时间（ISO 格式字符串）
}

/**
 * 获取所有知识库列表
 */
export async function getKnowledgeBases(): Promise<KnowledgeBase[]> {
  const res = await request.get<{ knowledgeBases: KnowledgeBase[] }>('/api/knowledge-bases')
  return res.data.knowledgeBases
}

/**
 * 创建新的知识库
 * @param name        知识库名称（需唯一）
 * @param description 知识库描述（可选）
 */
export async function createKnowledgeBase(name: string, description?: string): Promise<KnowledgeBase> {
  const res = await request.post<{ knowledgeBase: KnowledgeBase }>('/api/knowledge-bases', { name, description })
  return res.data.knowledgeBase
}

/**
 * 删除指定知识库（同时删除其中的所有文档）
 * @param name 要删除的知识库名称
 */
export async function deleteKnowledgeBase(name: string): Promise<void> {
  await request.delete(`/api/knowledge-bases/${encodeURIComponent(name)}`)
}
