/**
 * HTTP 端点集成测试
 *
 * Tests all API endpoints via supertest:
 * - Health check, KB CRUD, Agent chat, Monitor, Feedback, Evaluation
 *
 * NOTE: Tests requiring DEEPSEEK_API_KEY or ChromaDB will be skipped.
 */

import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../app'

const hasApiKey =
  process.env.DEEPSEEK_API_KEY &&
  process.env.DEEPSEEK_API_KEY !== 'your_key_here'

// ---- Health Check ----

describe('GET /api/health', () => {
  it('应返回 200 和 status: ok', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('status', 'ok')
  })
})

// ---- Agent Chat ----

describe('POST /api/agent/chat', () => {
  it('空消息应返回 400', async () => {
    const res = await request(app)
      .post('/api/agent/chat')
      .send({ message: '  ' })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error', '消息不能为空')
  })

  it('缺少 message 应返回 400', async () => {
    const res = await request(app)
      .post('/api/agent/chat')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error', '消息不能为空')
  })

  it('有效消息应返回 SSE 流', async () => {
    if (!hasApiKey) return

    const res = await request(app)
      .post('/api/agent/chat')
      .send({ message: '你好', temperature: 0.1 })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/event-stream/)
    expect(res.text).toContain('[DONE]')
  }, 20000)
})

// ---- Monitor Endpoints ----

describe('Monitor API', () => {
  it('GET /api/monitor/metrics 应返回指标数据', async () => {
    const res = await request(app)
      .get('/api/monitor/metrics?timeRange=1h')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('timeRange', '1h')
    expect(res.body).toHaveProperty('metrics')
    expect(Array.isArray(res.body.metrics)).toBe(true)
  })

  it('GET /api/monitor/realtime 应返回实时状态', async () => {
    const res = await request(app).get('/api/monitor/realtime')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('success', true)
    expect(res.body.data).toHaveProperty('qps')
    expect(res.body.data).toHaveProperty('avgLatencyMs')
    expect(res.body.data).toHaveProperty('toolCallCount')
    expect(res.body.data).toHaveProperty('errorCount')
  })

  it('GET /api/monitor/logs 应返回错误日志', async () => {
    const res = await request(app).get('/api/monitor/logs')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('logs')
    expect(Array.isArray(res.body.logs)).toBe(true)
  })
})

// ---- Feedback Endpoints ----

describe('Feedback API', () => {
  it('POST /api/feedback 应提交反馈', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({ messageId: 'test-msg', rating: 5, comment: '好' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('success', true)
    expect(res.body.entry).toHaveProperty('id')
  })

  it('POST /api/feedback 无 messageId 应返回 400', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({ rating: 5 })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('POST /api/feedback rating 无效应返回 400', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({ messageId: 'test-msg', rating: 0 })
    expect(res.status).toBe(400)
  })

  it('GET /api/feedback/stats 应返回统计', async () => {
    const res = await request(app).get('/api/feedback/stats')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total')
    expect(res.body).toHaveProperty('avgRating')
    expect(res.body).toHaveProperty('distribution')
  })

  it('POST /api/feedback/analyze 应返回分析结果', async () => {
    const res = await request(app).post('/api/feedback/analyze')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('totalLowScore')
  })
})

// ---- Evaluation Endpoints ----

describe('Evaluation API', () => {
  it('GET /api/evaluation/trend 应返回趋势数据', async () => {
    const res = await request(app).get('/api/evaluation/trend')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('runs')
    expect(Array.isArray(res.body.runs)).toBe(true)
  })
})
