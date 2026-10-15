import { RetrievedChunk } from '../types'
import { getOrCreateCollection } from './vectorStoreService'
import { IncludeEnum } from 'chromadb'

/**
 * BM25 关键词检索的简单实现，用于混合搜索（Hybrid Search）。
 * 与向量检索配合，提升对关键词匹配场景的召回率。
 */

interface DocEntry {
  id: number          // 文档序号
  text: string        // 文档文本内容
  terms: string[]     // 分词后的词项列表
  fileName: string    // 来源文件名
  chunkIndex: number  // 块索引
}

let indexInitialized = false      // BM25 倒排索引是否已初始化
let currentCollection = ''       // 当前加载的集合名称
let entries: DocEntry[] = []     // 文档条目列表
let docLengths: number[] = []    // 每个文档的长度（词项数）
let avgDocLength = 0             // 平均文档长度
let termDocFreq: Map<string, number> = new Map()  // 词项 → 包含该词项的文档数（df）
let totalDocs = 0                // 文档总数

const K1 = 1.2   // BM25 词频饱和参数
const B = 0.75   // BM25 长度归一化参数

/**
 * 对文本进行分词处理。
 * 按标点和空格分割；中文（CJK 字符）拆分为单字。
 */
function tokenize(text: string): string[] {
  const tokens: string[] = []
  const parts = text.split(/[\s,.;:!?()\[\]{}"'，。；：！？（）【】""''、\s]+/)
  for (const part of parts) {
    if (!part) continue
    if (/[一-鿿㐀-䶿]/.test(part)) {
      // 中文字符拆分为单字
      for (const char of part) {
        if (char.trim()) tokens.push(char.toLowerCase())
      }
    } else {
      // 非中文整体转为小写
      tokens.push(part.toLowerCase())
    }
  }
  return tokens
}

/** 统计词项在单个文档中的出现频率（TF） */
function buildTermFreq(terms: string[]): Map<string, number> {
  const freq = new Map<string, number>()
  for (const t of terms) {
    freq.set(t, (freq.get(t) || 0) + 1)
  }
  return freq
}

/**
 * 从 ChromaDB 加载指定集合的文档内容，构建 BM25 倒排索引。
 * 如果索引已初始化且集合未变化，则跳过重建。
 * @param collectionName 集合名称，默认 'rag_knowledge'
 */
export async function ensureIndex(collectionName?: string): Promise<void> {
  const name = collectionName || 'rag_knowledge'
  if (indexInitialized && currentCollection === name) return

  try {
    const collection = await getOrCreateCollection(name)
    currentCollection = name
    const result = await collection.get({
      include: [IncludeEnum.Documents, IncludeEnum.Metadatas],
    })

    const allDocs = result.documents ?? []
    const allMetas = result.metadatas ?? []
    entries = []
    docLengths = []
    termDocFreq = new Map()
    totalDocs = allDocs.length

    for (let i = 0; i < allDocs.length; i++) {
      const text = allDocs[i] ?? ''
      const meta = allMetas[i] ?? ({} as Record<string, any>)
      const terms = tokenize(text)
      const uniqueTerms = new Set(terms)

      entries.push({
        id: i,
        text,
        terms,
        fileName: (meta.fileName as string) || 'unknown',
        chunkIndex: (meta.chunkIndex as number) ?? 0,
      })

      docLengths.push(terms.length)

      for (const term of uniqueTerms) {
        termDocFreq.set(term, (termDocFreq.get(term) || 0) + 1)
      }
    }

    avgDocLength =
      docLengths.length > 0
        ? docLengths.reduce((a, b) => a + b, 0) / docLengths.length
        : 1

    indexInitialized = true
    console.log(
      `[HybridSearch] BM25 index ready — ${totalDocs} chunks, ${termDocFreq.size} unique terms, avg ${avgDocLength.toFixed(0)}`
    )
  } catch (err: any) {
    console.warn('[HybridSearch] Failed to build BM25 index:', err.message)
  }
}

/** 强制使 BM25 索引失效，下次查询时重新构建 */
export function invalidateIndex(): void {
  indexInitialized = false
}

/**
 * 标准 BM25 算法：对查询词列表在所有文档上打分。
 * 公式：score = sum(IDF * (TF * (k1+1)) / (TF + k1 * (1 - b + b * (dl/avgDL))))
 */
function computeBM25(queryTerms: string[]): { id: number; score: number }[] {
  if (totalDocs === 0) return []

  const scores: { id: number; score: number }[] = []

  for (let d = 0; d < totalDocs; d++) {
    const tf = buildTermFreq(entries[d].terms)
    let score = 0

    for (const qTerm of queryTerms) {
      const termFreq = tf.get(qTerm) || 0
      if (termFreq === 0) continue

      const df = termDocFreq.get(qTerm) || 0
      const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1)

      const numerator = termFreq * (K1 + 1)
      const denominator = termFreq + K1 * (1 - B + B * (docLengths[d] / avgDocLength))
      score += idf * (numerator / denominator)
    }

    if (score > 0) {
      scores.push({ id: d, score })
    }
  }

  return scores.sort((a, b) => b.score - a.score)
}

/**
 * BM25 搜索的主要入口：分词 → 计算 BM25 分数 → 返回 top-K 结果及完整元数据。
 * 被 ragService 调用，与向量检索共同构成混合检索策略。
 * 结果中包含伪距离（pseudo-distance），便于与 diversifyByDocument 兼容。
 */
export async function searchWithMetadata(
  query: string,
  topK: number = 30,
  collectionName?: string
): Promise<{ chunk: RetrievedChunk; bm25Score: number }[]> {
  await ensureIndex(collectionName)

  if (totalDocs === 0) return []

  const queryTerms = tokenize(query)
  if (queryTerms.length === 0) return []

  const results = computeBM25(queryTerms)
  const top = results.slice(0, topK)
  const maxScore = top.length > 0 ? top[0].score : 1

  return top.map((r) => {
    const doc = entries[r.id]
    // 将 BM25 分数归一化为伪距离（值越小表示相关性越高）
    const pseudoDistance = maxScore > 0 ? 1 - (r.score / maxScore) * 0.99 : 1
    return {
      chunk: {
        content: doc.text || '',
        fileName: doc.fileName,
        chunkIndex: doc.chunkIndex,
        distance: pseudoDistance,
      },
      bm25Score: r.score,
    }
  })
}
