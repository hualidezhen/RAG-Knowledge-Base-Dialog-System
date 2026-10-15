/**
 * Cross-encoder 重排序服务。
 * 使用 Xenova/ms-marco-MiniLM-L-6-v2 模型对检索结果进行深度语义重排序，
 * 提升最终返回结果的相关性。
 * 模型加载失败时静默降级，返回原始排序。
 */

import { RetrievedChunk } from '../types'

let rerankerModel: any = null    // 缓存的 cross-encoder 模型实例
let modelLoading = false         // 是否正在加载中
let modelReady = false           // 模型是否已加载完成

const MODEL_NAME = 'Xenova/ms-marco-MiniLM-L-6-v2'

/**
 * 懒加载 cross-encoder 模型。
 * 使用 @xenova/transformers 的动态导入 + int8 量化以加速加载。
 * @returns true 表示模型加载成功，false 表示仍在加载或加载失败
 */
async function ensureModel(): Promise<boolean> {
  if (modelReady) return true
  if (modelLoading) return false // 等待已有的加载尝试完成

  modelLoading = true
  try {
    // 动态导入 transformers.js
    const { pipeline } = await import('@xenova/transformers')

    console.log(`[Reranker] Loading model: ${MODEL_NAME}...`)
    rerankerModel = await (pipeline as any)('text-classification', MODEL_NAME, {
      quantized: true, // 使用 int8 量化模型以加速推理
    })
    modelReady = true
    console.log('[Reranker] Model ready')
    return true
  } catch (err: any) {
    console.warn(`[Reranker] Failed to load model: ${err.message}`)
    return false
  } finally {
    modelLoading = false
  }
}

/**
 * Cross-encoder 重排序主方法：对 query + chunk 对逐一评分，返回 top-k 结果。
 * 如果模型加载失败或 chunk 数量不超过 topK，则返回原始顺序。
 * @param query  原始查询文本
 * @param chunks 待重排的检索结果块列表
 * @param topK   返回前 K 条结果，默认 8
 * @returns 重排序后的 chunks
 */
export async function rerank(
  query: string,
  chunks: RetrievedChunk[],
  topK: number = 8
): Promise<RetrievedChunk[]> {
  if (chunks.length === 0) return chunks
  if (chunks.length <= topK) return chunks

  const ready = await ensureModel()
  if (!ready || !rerankerModel) return chunks

  try {
    // 为每个 query+chunk 对评分
    const pairs = chunks.map((c) => [query, c.content] as [string, string])
    const results = await rerankerModel(pairs)

    // 附加评分并按分数降序排列
    const scored: { chunk: RetrievedChunk; score: number }[] = chunks.map((chunk, i) => ({
      chunk,
      score: results[i]?.score ?? 0,
    }))

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK).map((s) => s.chunk)
  } catch (err: any) {
    console.warn('[Reranker] Inference failed:', err.message)
    return chunks // 推理失败时降级返回原始顺序
  }
}
