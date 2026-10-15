// ========== 路由: 知识库管理 ==========
// 挂载路径: /api/knowledge-bases
// 提供知识库（Collection）的 CRUD 操作

import { Router, Request, Response } from 'express'
import { getChromaClient } from '../services/vectorStoreService'
import {
  listCollections,
  createCollection,
  deleteCollection as removeCollection,
  getDefaultCollectionName,
} from '../services/collectionService'

const router = Router()

// GET /api/knowledge-bases — 获取所有知识库列表
router.get('/', (_req: Request, res: Response) => {
  try {
    const kbs = listCollections()
    res.json({ knowledgeBases: kbs })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/knowledge-bases — 创建新知识库
// 请求体: { name: string, description?: string }
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description } = req.body
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: '知识库名称不能为空' })
      return
    }
    const kb = createCollection(name.trim(), description)
    res.json({ knowledgeBase: kb, message: `知识库 "${name}" 创建成功` })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/knowledge-bases/:name — 删除指定知识库
// 校验: 不允许删除默认知识库，防止误操作导致系统异常
router.delete('/:name', async (req: Request, res: Response) => {
  try {
    const name = req.params.name as string
    if (name === getDefaultCollectionName()) {
      res.status(400).json({ error: '不能删除默认知识库' })
      return
    }

    // 同步删除 ChromaDB 中的对应 collection
    try {
      const client = getChromaClient()
      await client.deleteCollection({ name })
    } catch {
      // Chroma 中可能不存在该 collection，忽略即可
    }

    removeCollection(name)
    res.json({ message: `知识库 "${name}" 已删除` })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
