/**
 * P5: 用户反馈与在线评估
 *
 * Tests feedback submission, stats aggregation, low-score analysis,
 * rating validation, and tag filtering.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'
import { getFeedbackService } from '../services/feedbackService'

const DATA_FILE = path.resolve(__dirname, '../../data/feedback/feedback.json')

function cleanup() {
  try {
    if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE)
  } catch { /* ignore */ }
  const analysisFile = path.resolve(__dirname, '../../data/feedback/analysis.json')
  try {
    if (fs.existsSync(analysisFile)) fs.unlinkSync(analysisFile)
  } catch { /* ignore */ }
}

beforeEach(cleanup)
afterEach(cleanup)

// ---- P5-1: Submit Feedback ----

describe('P5-1: 提交反馈', () => {
  it('submitFeedback 应返回带 id 和时间戳的条目', () => {
    const service = getFeedbackService()
    const entry = service.submitFeedback({
      messageId: 'msg-001',
      rating: 5,
      comment: '非常好',
      tags: ['accuracy'],
    })

    expect(entry).toHaveProperty('id')
    expect(entry).toHaveProperty('messageId', 'msg-001')
    expect(entry).toHaveProperty('rating', 5)
    expect(entry).toHaveProperty('comment', '非常好')
    expect(entry).toHaveProperty('tags')
    expect(entry.tags).toContain('accuracy')
    expect(entry).toHaveProperty('timestamp')
  })

  it('submitFeedback 可选字段可不传', () => {
    const service = getFeedbackService()
    const entry = service.submitFeedback({
      messageId: 'msg-002',
      rating: 3,
    })

    expect(entry).toHaveProperty('id')
    expect(entry.rating).toBe(3)
    expect(entry.comment).toBeUndefined()
    expect(entry.tags).toBeUndefined()
    expect(entry.sessionId).toBeUndefined()
  })
})

// ---- P5-2: Stats ----

describe('P5-2: 反馈统计', () => {
  it('getStats 无数据时应返回全零', () => {
    const service = getFeedbackService()
    const stats = service.getStats()

    expect(stats).toHaveProperty('total', 0)
    expect(stats).toHaveProperty('avgRating', 0)
    expect(stats.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
  })

  it('getStats 应正确聚合评分', () => {
    const service = getFeedbackService()
    service.submitFeedback({ messageId: 'm1', rating: 5 })
    service.submitFeedback({ messageId: 'm2', rating: 4 })
    service.submitFeedback({ messageId: 'm3', rating: 3 })

    const stats = service.getStats()
    expect(stats.total).toBe(3)
    expect(stats.avgRating).toBe(4) // (5+4+3)/3 = 4
    expect(stats.distribution[5]).toBe(1)
    expect(stats.distribution[4]).toBe(1)
    expect(stats.distribution[3]).toBe(1)
    expect(stats.distribution[2]).toBe(0)
    expect(stats.distribution[1]).toBe(0)
  })

  it('getStats 应包含 recentComments', () => {
    const service = getFeedbackService()
    service.submitFeedback({ messageId: 'm1', rating: 5, comment: '很好' })
    service.submitFeedback({ messageId: 'm2', rating: 1, comment: '很差' })

    const stats = service.getStats()
    expect(stats.recentComments.length).toBeGreaterThanOrEqual(2)
    const commentTexts = stats.recentComments.map((c) => c.comment)
    expect(commentTexts).toContain('很好')
    expect(commentTexts).toContain('很差')
  })
})

// ---- P5-5: Analysis ----

describe('P5-5: 反馈分析', () => {
  it('runAnalysis 无低分时应返回空', () => {
    const service = getFeedbackService()
    service.submitFeedback({ messageId: 'm1', rating: 5 })
    service.submitFeedback({ messageId: 'm2', rating: 4 })

    const result = service.runAnalysis()
    expect(result.totalLowScore).toBe(0)
    expect(result.patterns).toEqual([])
  })

  it('runAnalysis 应识别低分模式', () => {
    const service = getFeedbackService()
    service.submitFeedback({ messageId: 'm1', rating: 1, comment: '不准确', tags: ['accuracy'] })
    service.submitFeedback({ messageId: 'm2', rating: 2, comment: '太慢', tags: ['speed'] })
    service.submitFeedback({ messageId: 'm3', rating: 1, comment: '错误', tags: ['accuracy'] })

    const result = service.runAnalysis()
    expect(result.totalLowScore).toBe(3)
    expect(result.patterns.length).toBeGreaterThanOrEqual(2)
    const accuracyPattern = result.patterns.find((p) => p.tag === 'accuracy')
    expect(accuracyPattern).toBeDefined()
    expect(accuracyPattern!.count).toBeGreaterThanOrEqual(2)
  })

  it('低分反馈无标签时应归入 uncategorized', () => {
    const service = getFeedbackService()
    service.submitFeedback({ messageId: 'm1', rating: 1 })

    const result = service.runAnalysis()
    expect(result.totalLowScore).toBe(1)
    expect(result.patterns.some((p) => p.tag === 'uncategorized')).toBe(true)
  })
})
