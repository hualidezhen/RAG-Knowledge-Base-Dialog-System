// ========== 路由: 文档管理 ==========
// 挂载路径: /api/documents
// 提供文档的上传、列表、内容查看和删除功能

import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { upload, list, getContent, remove } from '../controllers/documentController'

const router = Router()

// 确保上传目录存在，用于文件持久化存储
const uploadDir = path.resolve(__dirname, '../../data/uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// Multer 中间件配置：内存存储 + 50MB 单文件限制 + MIME 类型白名单
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 单文件最大 50MB
  },
  fileFilter: (_req, file, cb) => {
    // 仅允许 PDF、DOCX、TXT 三种格式
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ]
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`不支持的文件类型: ${file.mimetype}`))
    }
  },
})

// 封装 Multer 的错误处理，将异常转为 JSON 响应
function handleUpload(req: Request, res: Response, next: NextFunction) {
  uploadMiddleware.array('files')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message })
    }
    next()
  })
}

// 核心路由：上传 / 列表 / 内容查看 / 删除
router.post('/upload', handleUpload, upload)
router.get('/', list)
router.get('/:filename/content', getContent)
router.delete('/:filename', remove)

export default router
