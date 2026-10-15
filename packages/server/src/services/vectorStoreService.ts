/**
 * 向量存储服务核心模块
 *
 * 职责：
 * - 调用 Zhipu Embedding API 生成文本向量
 * - 连接 ChromaDB 进行向量存储和相似度检索
 * - 文档分块（chunking）与批量处理
 *
 * 依赖：
 * - Zhipu Embedding API（https://open.bigmodel.cn）
 * - ChromaDB（运行在 http://localhost:8000）
 * - langchain/text_splitter（文档分块）
 */

import { ChromaClient, Collection, IncludeEnum } from 'chromadb'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { ChunkMetadata, DocumentListItem } from '../types'

/** Zhipu Embedding API 端点，可通过 ZHIPU_EMBEDDING_BASE_URL 环境变量覆盖 */
const ZHIPU_BASE_URL = process.env.ZHIPU_EMBEDDING_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'
/** Zhipu Embedding 模型名，可通过 ZHIPU_EMBEDDING_MODEL 环境变量覆盖 */
const ZHIPU_EMBEDDING_MODEL = process.env.ZHIPU_EMBEDDING_MODEL || 'embedding-2'

let chromaClient: ChromaClient | null = null
let embeddings: {
  embedQuery: (text: string) => Promise<number[]>
  embedDocuments: (texts: string[]) => Promise<number[][]>
} | null = null

function getChromaUrl(): string {
  return process.env.CHROMA_URL || 'http://localhost:8000'
}

export function getChromaClient(): ChromaClient {
  if (!chromaClient) {
    chromaClient = new ChromaClient({
      path: getChromaUrl(),
    })
  }
  return chromaClient
}

/** 单批最大条数（Zhipu API 上限 64 条，取 50 留安全余量） */
const MAX_BATCH_ITEMS = 50
/** 单批最大总字符数（Zhipu API 上限约 20000 字符，取 15000 留安全余量） */
const MAX_BATCH_CHARS = 15000

/** 清理控制字符（除 \n \r \t 外），避免控制字符导致 API 请求异常 */
function sanitize(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

/**
 * 调用 Zhipu Embedding API 生成文本向量，支持单字符串或批量数组输入。
 *
 * 处理逻辑：
 * 1. 单字符串输入 → 直接调用 API 返回一维向量
 * 2. 批量输入 → 先清洗所有文本，再按条数和总字符数双重约束分批，确保每批至少 1 条
 */
async function createEmbedding(input: string | string[]): Promise<number[] | number[][]> {
  const apiKey = process.env.ZHIPU_API_KEY
  if (!apiKey || apiKey === 'your_zhipu_api_key' || apiKey === 'your_key_here') {
    throw new Error('ZHIPU_API_KEY 未配置')
  }

  // 单字符串分支：直接调用 API
  if (typeof input === 'string') {
    return callEmbeddingAPI(sanitize(input), apiKey) as Promise<number[]>
  }

  // 批量分支：先清洗所有文本中的控制字符
  const cleaned = input.map(sanitize)

  // 分批策略：同时受条数上限（MAX_BATCH_ITEMS）和总字符数上限（MAX_BATCH_CHARS）双重约束
  const allResults: number[][] = []
  let i = 0
  while (i < cleaned.length) {
    let batchEnd = i
    let charCount = 0
    while (batchEnd < cleaned.length &&
           batchEnd - i < MAX_BATCH_ITEMS &&
           charCount + cleaned[batchEnd].length < MAX_BATCH_CHARS) {
      charCount += cleaned[batchEnd].length
      batchEnd++
    }
    // 兜底：确保每批至少 1 条（当单条文本字符数超过 MAX_BATCH_CHARS 时）
    if (batchEnd === i) batchEnd = i + 1

    const batch = cleaned.slice(i, batchEnd)
    const batchEmbeddings = await callEmbeddingAPI(batch, apiKey) as number[][]
    allResults.push(...batchEmbeddings)
    i = batchEnd
  }
  return allResults
}

/**
 * 执行 Zhipu Embedding API 的底层 HTTP 请求
 * - 发送 POST 请求到 /embeddings 端点
 * - 解析响应 JSON，按 index 字段排序保证顺序一致
 * - 单字符串输入时返回一维向量，批量输入时返回二维向量数组
 */
async function callEmbeddingAPI(input: string | string[], apiKey: string): Promise<number[] | number[][]> {
  const response = await fetch(`${ZHIPU_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: ZHIPU_EMBEDDING_MODEL,
      input,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Embedding API 请求失败 (${response.status}): ${body}`)
  }

  const data = (await response.json()) as {
    data?: { embedding: number[]; index: number }[]
  }
  const results = (data.data || []).sort((a, b) => a.index - b.index)

  if (Array.isArray(input)) {
    return results.map((d: any) => d.embedding)
  }
  return results[0]?.embedding ?? []
}

/**
 * 获取 Embedding 实例（懒加载 + 预热）
 * - 首次调用时自动发送测试请求验证 API 连通性
 * - 缓存 Embedding 函数（embedQuery / embedDocuments）避免重复初始化
 * - 预热失败时抛出明确的初始化错误
 */
export async function getEmbeddings() {
  if (!embeddings) {
    try {
      // 预热：发送测试请求验证 Zhipu API 连通性和返回格式
      const test = await createEmbedding('hello')
      if (!Array.isArray(test)) throw new Error('API returned unexpected format')
      console.log(`Embedding API (ZhipuAI) ready — ${(test as number[]).length}d`)
    } catch (err: any) {
      throw new Error(`Embedding API 初始化失败: ${err.message}`)
    }

    embeddings = {
      embedQuery: (text: string): Promise<number[]> =>
        createEmbedding(text) as Promise<number[]>,
      embedDocuments: (texts: string[]): Promise<number[][]> =>
        createEmbedding(texts) as Promise<number[][]>,
    }
  }
  return embeddings
}

/**
 * 创建文本分块器
 * - chunkSize=800：每块最多 800 字符
 * - chunkOverlap=150：相邻块间重叠 150 字符，避免关键信息被切断
 * - 使用 RecursiveCharacterTextSplitter 按段落/句子/标点层层切分
 */
export function createTextSplitter() {
  return new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 150,
  })
}

/**
 * 获取或创建 ChromaDB 集合
 * - 连接成功时直接返回已有集合或创建新集合
 * - ECONNREFUSED 时返回友好提示（含安装和启动指引）
 * - 其他异常直接抛出
 */
export async function getOrCreateCollection(
  name: string = 'rag_knowledge'
): Promise<Collection> {
  const client = getChromaClient()
  try {
    const collection = await client.getOrCreateCollection({ name })
    return collection
  } catch (error: any) {
    if (error?.message?.includes('ECONNREFUSED') || error?.cause?.code === 'ECONNREFUSED') {
      throw new Error(
        `无法连接到 ChromaDB 服务器 (${getChromaUrl()})，请确保 Chroma 服务已启动。\n` +
        `安装: pip install chromadb\n` +
        `启动: chroma run --path ./data/chroma`
      )
    }
    throw new Error(`ChromaDB 操作失败: ${error.message}`)
  }
}

/** 快速检测 ChromaDB 是否可达，不可达时抛出友好错误 */
export async function ensureChromaReady(): Promise<void> {
  try {
    await getOrCreateCollection()
  } catch (err: any) {
    // 直接透传 getOrCreateCollection 已格式化好的错误信息
    throw err
  }
}

/**
 * 将文档分块批量生成向量并存入 ChromaDB
 *
 * 处理流程：
 * 1. 获取/创建 ChromaDB 集合，获取 Embedding 实例
 * 2. 构建每条分块的 ID、文档内容和元数据
 * 3. 批量调用 Embedding API 生成所有分块的向量
 * 4. 写入 ChromaDB，若维度不匹配则自动删除集合重建
 *
 * @param chunks - 文本分块数组
 * @param metadata - 元数据（不含 chunkIndex，由函数自动填充）
 * @param collectionName - ChromaDB 集合名，默认为 'rag_knowledge'
 * @returns 成功存储的分块数量
 */
export async function embedAndStore(
  chunks: string[],
  metadata: Omit<ChunkMetadata, 'chunkIndex'>,
  collectionName?: string
): Promise<number> {
  const collection = await getOrCreateCollection(collectionName)
  const embedder = await getEmbeddings()

  const ids: string[] = []
  const embeddingsArr: number[][] = []
  const metadatas: ChunkMetadata[] = []
  const documents: string[] = []

  // 第一步：构建每条分块的唯一 ID、原文内容和元数据（含文件名、时间戳、分块序号）
  for (let i = 0; i < chunks.length; i++) {
    const chunkIndex = i
    const chunkText = chunks[i]
    const chunkId = `${metadata.fileName}-${Date.now()}-chunk-${chunkIndex}`

    ids.push(chunkId)
    documents.push(chunkText)
    metadatas.push({
      ...metadata,
      chunkIndex,
    } as ChunkMetadata)
  }

  // 第二步：批量调用 Embedding API 生成所有分块的向量（一次 API 调用）
  const vectors = await embedder.embedDocuments(chunks)
  for (let i = 0; i < vectors.length; i++) {
    embeddingsArr.push(vectors[i])
  }

  try {
    await collection.add({
      ids,
      embeddings: embeddingsArr,
      metadatas,
      documents,
    })
  } catch (err: any) {
    // 向量维度不匹配时自动重建集合（例如切换 Embedding 模型导致维度从 512 变为 1536）
    if (err.message?.includes('dimension') || err.message?.includes('dimensionality')) {
      console.warn('向量维度不匹配，正在重建 ChromaDB 集合...')
      const client = getChromaClient()
      await client.deleteCollection({ name: collection.name })
      const newCollection = await getOrCreateCollection(collection.name)
      await newCollection.add({
        ids,
        embeddings: embeddingsArr,
        metadatas,
        documents,
      })
    } else {
      throw err
    }
  }

  return chunks.length
}

/**
 * 列出知识库中已存储的所有文档
 * - 从 ChromaDB 的 metadata 中提取不重复的文档列表
 * - 按文件名去重，返回每条文档的文件名、类型、上传时间和分块数
 */
export async function listDocuments(collectionName?: string): Promise<DocumentListItem[]> {
  const collection = await getOrCreateCollection(collectionName)

  const result = await collection.get({
    include: [IncludeEnum.Metadatas],
  })

  const docMap = new Map<string, DocumentListItem>()

  if (result.metadatas) {
    for (const meta of result.metadatas) {
      if (!meta) continue
      const fileName = meta.fileName as string
      if (!docMap.has(fileName)) {
        docMap.set(fileName, {
          fileName,
          fileType: meta.fileType as string,
          uploadTime: meta.uploadTime as string,
          chunkCount: meta.totalChunks as number,
        })
      }
    }
  }

  return Array.from(docMap.values())
}

/**
 * 从 ChromaDB 集合中删除指定文档的所有分块
 * - 按 metadata.fileName 字段匹配删除
 * - 不删除物理文件（data/uploads/ 下的原始文件需单独处理）
 */
export async function deleteDocument(fileName: string, collectionName?: string): Promise<void> {
  const collection = await getOrCreateCollection(collectionName)
  await collection.delete({
    where: { fileName },
  })
}

// ---- Singleton 导出 ----
// 本模块使用 Module-level Singleton 模式：
// - getChromaClient() — chromaClient 懒加载，全局唯一 ChromaDB 连接
// - getEmbeddings()  — embeddings 懒加载+预热，全局唯一的 Embedding 函数实例
