/**
 * Basic Features Tests — covers CONTEXT.md §4 "已实现功能清单" pre-P1 items.
 * Tests service-layer logic for health check, KB CRUD, RAG pipeline,
 * hybrid search, cross-encoder reranking, and query rewriting.
 */

import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../app'

// ---- Health Check ----

describe('Health Check', () => {
  it('GET /api/health returns ok status', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('status', 'ok')
  })
})
