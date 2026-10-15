/**
 * 检索知识库文档片段的 Tool，供 Agent 调用。
 * 根据用户查询从 ChromaDB 中检索最相关的文档片段，支持指定返回数量和知识库名称。
 */

import { Tool } from '../types'
import { getRagService } from '../services/ragService'

export const retrieveKnowledgeTool: Tool = {
  name: 'retrieve_knowledge',                                     // 工具名称，Agent 通过此名称调用
  description: '检索知识库中与查询相关的文档片段',                   // 工具描述，告诉 LLM 此工具的功能
  parameters: [                                                    // 参数定义列表，描述每个参数的名称、类型、说明和是否必填
    { name: 'query', type: 'string', description: '搜索查询', required: true },
    { name: 'topK', type: 'number', description: '返回结果数（上限 8，超过无效）', required: false },
    { name: 'collection', type: 'string', description: '知识库名称', required: false },
  ],
  async execute(args) {
    // 从参数中提取搜索查询
    const query = args.query as string
    // 返回结果数，未指定时默认取 8 条
    const topK = (args.topK as number) || 8
    // 可选的知识库名称，未指定时使用默认知识库
    const collection = args.collection as string | undefined
    // 调用 RAG 服务执行混合检索（向量检索 + BM25 关键词检索 + Reranker 重排序）
    const chunks = await getRagService().retrieveRelevantChunks(query, collection)
    // 按 topK 截断后返回，避免返回过多结果
    return { chunks: chunks.slice(0, topK) }
  },
}
