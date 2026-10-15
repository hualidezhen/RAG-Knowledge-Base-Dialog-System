import { Request, Response } from 'express'
import { getMemoryService } from '../services/memoryService'

/**
 * 会话管理控制器
 * 提供会话的创建、列表查看、详情获取和删除功能
 * 每个会话关联 L2 对话摘要和 L3 语义记忆
 */

/**
 * 创建新会话
 * 可选传入会话名称，返回包含唯一 ID 的会话对象
 */
export async function createSession(req: Request, res: Response): Promise<void> {
  try {
    const { name } = req.body || {}
    const session = getMemoryService().createSession(name)
    res.json({ session })
  } catch (err: any) {
    res.status(500).json({ error: `创建会话失败: ${err.message}` })
  }
}

/**
 * 获取所有会话列表
 */
export async function listSessions(_req: Request, res: Response): Promise<void> {
  try {
    const sessions = getMemoryService().listSessions()
    res.json({ sessions })
  } catch (err: any) {
    res.status(500).json({ error: `获取会话列表失败: ${err.message}` })
  }
}

/**
 * 获取单个会话详情
 * 包含会话基本信息、所有 L2 摘要和最新摘要
 */
export async function getSession(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const session = getMemoryService().getSession(id)
    if (!session) {
      res.status(404).json({ error: '会话未找到' })
      return
    }

    const summaries = getMemoryService().getAllSummaries(id)
    const latestSummary = getMemoryService().getLatestSummary(id)

    res.json({ session, summaries, latestSummary })
  } catch (err: any) {
    res.status(500).json({ error: `获取会话详情失败: ${err.message}` })
  }
}

/**
 * 删除指定会话
 * 同时清理关联的 L2 摘要文件和 L3 语义记忆数据
 */
export async function deleteSession(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const deleted = getMemoryService().deleteSession(id)
    if (!deleted) {
      res.status(404).json({ error: '会话未找到' })
      return
    }
    res.json({ message: '会话已删除' })
  } catch (err: any) {
    res.status(500).json({ error: `删除会话失败: ${err.message}` })
  }
}
