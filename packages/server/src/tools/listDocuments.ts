/**
 * 列出知识库中文档的 Tool，供 Agent 调用。
 * 返回指定知识库（或默认知识库）中的所有文档名称列表。
 */

import { Tool } from '../types'
import { listDocuments } from '../services/vectorStoreService'

export const listDocumentsTool: Tool = {
  name: 'list_documents',                                     // 工具名称，Agent 通过此名称调用
  description: '列出知识库中的所有文档',                        // 工具描述，告诉 LLM 此工具的功能
  parameters: [                                                // 参数定义列表，此处仅有一个可选参数
    { name: 'collection', type: 'string', description: '知识库名称', required: false },
  ],
  async execute(args) {
    // 可选的知识库名称，未指定时使用默认知识库
    const collection = args.collection as string | undefined
    // 调用 vectorStoreService 获取文档列表
    const documents = await listDocuments(collection)
    // 返回文档列表，格式为 { documents: [...] }
    return { documents }
  },
}
