import * as path from 'path'
import * as fs from 'fs'

import { FeedbackEntry, FeedbackRequest, FeedbackStats } from '../types'

/**
 * 用户反馈提交、统计和分析服务。
 * 持久化路径：data/feedback/feedback.json（反馈条目）和 data/feedback/analysis.json（分析结果）。
 */

// ---- 持久化辅助方法（参考 CLAUDE.md §2.8）----

const DATA_FILE = path.resolve(__dirname, '../../data/feedback/feedback.json')
const ANALYSIS_FILE = path.resolve(__dirname, '../../data/feedback/analysis.json')

/** 确保反馈数据目录存在 */
function ensureDir() {
  const dir = path.dirname(DATA_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

/** 从 JSON 文件加载所有反馈条目 */
function loadAll(): FeedbackEntry[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
    }
  } catch {
    /* 文件损坏 — 重置为空数组 */
  }
  return []
}

/** 将所有反馈条目保存到 JSON 文件 */
function saveAll(entries: FeedbackEntry[]) {
  ensureDir()
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf-8')
}

/** 生成唯一的反馈条目 ID（时间戳 base36 + 随机字符串） */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ---- FeedbackService ----

export class FeedbackService {
  /**
   * 提交一条用户反馈，保存到持久化存储中。
   * @param req 反馈请求，包含消息 ID、评分、评论和标签
   * @returns 保存后的完整反馈条目
   */
  submitFeedback(req: FeedbackRequest): FeedbackEntry {
    const entry: FeedbackEntry = {
      id: generateId(),
      messageId: req.messageId,
      rating: req.rating,
      comment: req.comment,
      tags: req.tags,
      sessionId: req.sessionId,
      timestamp: new Date().toISOString(),
    }

    const entries = loadAll()
    entries.push(entry)
    saveAll(entries)
    return entry
  }

  /**
   * 获取反馈统计数据：总数、平均分、评分分布（1-5 星）、最近评论。
   */
  getStats(): FeedbackStats {
    const entries = loadAll()
    const total = entries.length

    if (total === 0) {
      return { total: 0, avgRating: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, recentComments: [] }
    }

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    let sum = 0

    for (const e of entries) {
      distribution[e.rating] = (distribution[e.rating] || 0) + 1
      sum += e.rating
    }

    const recentComments = entries
      .filter((e) => e.comment)
      .slice(-10)
      .reverse()
      .map((e) => ({ rating: e.rating, comment: e.comment!, timestamp: e.timestamp }))

    return {
      total,
      avgRating: Math.round((sum / total) * 10) / 10,
      distribution,
      recentComments,
    }
  }

  /**
   * 分析低分反馈模式（评分 ≤ 2）。
   * 按标签(Tag)分组统计低分反馈，输出分析结果到 data/feedback/analysis.json。
   * @returns 低分总数 + 按标签分组的模式列表（按平均分升序排列）
   */
  runAnalysis(): { totalLowScore: number; patterns: { tag?: string; count: number; avgRating: number }[] } {
    const entries = loadAll()
    const lowScore = entries.filter((e) => e.rating <= 2)

    if (lowScore.length === 0) {
      const result = { totalLowScore: 0, patterns: [] }
      ensureDir()
      fs.writeFileSync(ANALYSIS_FILE, JSON.stringify(result, null, 2), 'utf-8')
      return result
    }

    // 按标签（Tag）分组统计低分反馈
    const tagGroups = new Map<string, { ratings: number[]; comments: string[] }>()
    for (const e of lowScore) {
      const tags = e.tags?.length ? e.tags : ['uncategorized']
      for (const tag of tags) {
        if (!tagGroups.has(tag)) tagGroups.set(tag, { ratings: [], comments: [] })
        tagGroups.get(tag)!.ratings.push(e.rating)
        if (e.comment) tagGroups.get(tag)!.comments.push(e.comment)
      }
    }

    const patterns = Array.from(tagGroups.entries())
      .map(([tag, data]) => ({
        tag,
        count: data.ratings.length,
        avgRating: Math.round((data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length) * 10) / 10,
        comments: data.comments.slice(0, 5),
      }))
      .sort((a, b) => a.avgRating - b.avgRating)

    const result = { totalLowScore: lowScore.length, patterns }
    ensureDir()
    fs.writeFileSync(ANALYSIS_FILE, JSON.stringify(result, null, 2), 'utf-8')
    return result
  }
}

// ---- Singleton 单例模式 ----

let instance: FeedbackService | null = null

export function getFeedbackService(): FeedbackService {
  if (!instance) {
    instance = new FeedbackService()
  }
  return instance
}
