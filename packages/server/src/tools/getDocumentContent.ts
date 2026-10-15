/**
 * 获取指定文档完整内容的 Tool，供 Agent 调用。
 * 从 data/uploads 目录读取指定文件，并通过 fileParser 解析为纯文本返回。
 * 注意对路径遍历攻击做清理：过滤文件名中的特殊字符，防止非法访问上传目录之外的文件。
 */

import * as path from 'path'
import { readFile } from 'fs/promises'

import { Tool } from '../types'
import { parseFile } from '../utils/fileParser'

export const getDocumentContentTool: Tool = {
  name: 'get_document_content',                               // 工具名称，Agent 通过此名称调用
  description: '获取知识库中某个文档的完整内容',                 // 工具描述，告诉 LLM 此工具的功能
  parameters: [                                                // 参数定义列表，此处仅有一个必填参数
    { name: 'fileName', type: 'string', description: '文件名（包含扩展名）', required: true },
  ],
  async execute(args) {
    // 从参数中提取文件名
    const fileName = args.fileName as string
    // 检查文件名参数是否为空
    if (!fileName) {
      throw new Error('缺少 fileName 参数')
    }

    // 上传目录的绝对路径，确保所有文件操作限制在此目录内
    const uploadDir = path.resolve(__dirname, '../../data/uploads')
    // 对文件名做安全清理：替换 Windows/Linux 下的非法路径字符为下划线
    // 防止路径遍历攻击（如 "../../etc/passwd" 被清理为 "....etc.passwd"）
    const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '_')
    // 拼接安全的完整文件路径，确保文件在 uploadDir 内部
    const filePath = path.join(uploadDir, safeFileName)

    // 读取文件原始二进制内容
    const buffer = await readFile(filePath)
    // 调用 fileParser 根据文件扩展名解析为文本（支持 pdf/docx/txt 等格式）
    const parsed = await parseFile(buffer, fileName)

    // 检查解析后的内容是否为空
    if (!parsed.content || parsed.content.trim().length === 0) {
      throw new Error('文件内容为空')
    }

    // 返回文档的名称、类型和完整文本内容
    return {
      fileName: parsed.fileName,
      fileType: parsed.fileType,
      content: parsed.content,
    }
  },
}
