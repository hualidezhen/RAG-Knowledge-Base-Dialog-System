import { Request, Response } from 'express'
import { writeFile, readFile, unlink } from 'fs/promises'
import path from 'path'
import { parseFile } from '../utils/fileParser'
import { createTextSplitter, embedAndStore, listDocuments, ensureChromaReady, deleteDocument as deleteChunks } from '../services/vectorStoreService'
import { invalidateIndex as invalidateHybridIndex } from '../services/hybridSearchService'
import { UploadResult } from '../types'

/**
 * 文档管理控制器
 * 提供文件上传、内容查看、文档列表和删除功能
 * 所有操作均与 ChromaDB 向量数据库交互，并同步维护磁盘文件存储
 */

/**
 * 上传并处理文件
 * 完整流程：预检 ChromaDB 连接 → 解析文件内容 → 文本分块 → Embedding 向量化 → 存入向量数据库 → 保存到磁盘 → 使 BM25 索引失效
 * 支持批量上传多个文件，任意文件处理失败则整体返回错误
 */
export async function upload(req: Request, res: Response): Promise<void> {
  try {
    const files = req.files as Express.Multer.File[] | undefined
    const collectionName = (req.body.collection as string) || undefined

    if (!files || files.length === 0) {
      res.status(400).json({ error: '请至少上传一个文件' })
      return
    }

    // 预检 ChromaDB 连接，避免文件处理到一半才失败
    try {
      await ensureChromaReady()
    } catch (err: any) {
      res.status(503).json({
        error: `向量数据库不可用，无法上传文档。\n${err.message}\nDocker 快捷启动: docker run -p 8000:8000 chromadb/chroma`,
      })
      return
    }

    const results: UploadResult[] = []

    for (const file of files) {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf-8')
      try {
        const parsed = await parseFile(file.buffer, originalName)

        const splitter = createTextSplitter()
        const chunks = await splitter.splitText(parsed.content)

        if (chunks.length === 0) {
          res.status(400).json({
            error: `文件 "${parsed.fileName}" 切分后无有效文本块`,
          })
          return
        }

        const uploadTime = new Date().toISOString()
        const totalChunks = await embedAndStore(chunks, {
          fileName: parsed.fileName,
          fileType: parsed.fileType,
          uploadTime,
          totalChunks: chunks.length,
        }, collectionName)

        // 将文件保存到磁盘用于内容查看（非关键操作，失败不影响主流程）
        try {
          const uploadDir = path.resolve(__dirname, '../../data/uploads')
          const safeFileName = parsed.fileName.replace(/[<>:"/\\|?*]/g, '_')
          await writeFile(path.join(uploadDir, safeFileName), file.buffer)
        } catch (diskErr: any) {
          console.warn(`Failed to save file "${parsed.fileName}" to disk:`, diskErr.message)
        }

        const documentId = `${parsed.fileName}-${Date.now()}`

        results.push({
          documentId,
          fileName: parsed.fileName,
          fileType: parsed.fileType,
          totalChunks,
          success: true,
        })
      } catch (err: any) {
        res.status(400).json({
          error: `文件 "${originalName}" 处理失败: ${err.message}`,
        })
        return
      }
    }

    // 使 BM25 索引失效，以便下次查询时用新文档重建索引
    invalidateHybridIndex()

    res.json({
      message: `成功上传 ${results.length} 个文件`,
      documents: results,
    })
  } catch (err: any) {
    res.status(500).json({ error: `上传处理异常: ${err.message}` })
  }
}

/**
 * 获取已上传文件的内容
 * 从磁盘读取文件后解析内容，返回文件名、类型和文本内容
 */
export async function getContent(req: Request, res: Response): Promise<void> {
  try {
    const fileName = req.params.filename as string
    if (!fileName) {
      res.status(400).json({ error: '缺少文件名参数' })
      return
    }

    const uploadDir = path.resolve(__dirname, '../../data/uploads')
    const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '_')
    const filePath = path.join(uploadDir, safeFileName)

    const buffer = await readFile(filePath)
    const parsed = await parseFile(buffer, fileName)

    if (!parsed.content || parsed.content.trim().length === 0) {
      res.status(404).json({ error: '文件内容为空' })
      return
    }

    res.json({
      fileName: parsed.fileName,
      fileType: parsed.fileType,
      content: parsed.content,
    })
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: '文件未找到' })
      return
    }
    res.status(500).json({ error: `读取文件内容失败: ${err.message}` })
  }
}

/**
 * 列出已上传文档
 * 从 ChromaDB 查询文档列表，当数据库不可用时优雅降级返回空列表
 */
export async function list(req: Request, res: Response): Promise<void> {
  try {
    const collectionName = (req.query.collection as string) || undefined
    const documents = await listDocuments(collectionName)
    res.json({ documents })
  } catch (err: any) {
    const msg = err.message || ''
    // ChromaDB 未启动时优雅降级，返回空列表
    if (msg.includes('ChromaDB') || msg.includes('ECONNREFUSED')) {
      res.json({ documents: [] })
      return
    }
    res.status(500).json({ error: `获取文档列表失败: ${msg}` })
  }
}

/**
 * 删除指定文档
 * 同时从 ChromaDB 向量数据库和磁盘中删除，并失效 BM25 索引
 */
export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const fileName = req.params.filename as string
    const collectionName = (req.query.collection as string) || undefined
    if (!fileName) {
      res.status(400).json({ error: '缺少文件名参数' })
      return
    }

    await deleteChunks(fileName, collectionName)
    invalidateHybridIndex()

    // 从磁盘删除文件（非关键操作，失败不影响 ChromaDB 的删除结果）
    try {
      const uploadDir = path.resolve(__dirname, '../../data/uploads')
      const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '_')
      await unlink(path.join(uploadDir, safeFileName))
    } catch (diskErr: any) {
      if (diskErr.code !== 'ENOENT') {
        console.warn(`Failed to delete file "${fileName}" from disk:`, diskErr.message)
      }
    }

    res.json({ message: `文档 "${fileName}" 已删除` })
  } catch (err: any) {
    res.status(500).json({ error: `删除文档失败: ${err.message}` })
  }
}
