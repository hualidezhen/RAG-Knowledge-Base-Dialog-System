/**
 * 文档文件解析工具
 * 支持 PDF / DOCX / TXT 三种格式的文本内容提取
 */
import mammoth from 'mammoth'
import { ParsedDocument } from '../types'

// pdf-parse 无类型声明文件，使用 require 加载以兼容 ts-node 运行环境
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse')

const SUPPORTED_TYPES = ['pdf', 'docx', 'txt'] as const
type SupportedType = (typeof SUPPORTED_TYPES)[number]

/** 从文件名中提取小写扩展名 */
function getExtension(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return ext
}

/** 校验文件扩展名是否在支持的格式范围内 */
function validateType(extension: string): SupportedType {
  if (!SUPPORTED_TYPES.includes(extension as SupportedType)) {
    throw new Error(
      `不支持的文件格式: .${extension}，支持的格式: ${SUPPORTED_TYPES.join(', ')}`
    )
  }
  return extension as SupportedType
}

/** 解析 PDF 文件：调用 pdf-parse 提取文本 */
async function parsePdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer)
  return data.text
}

/** 解析 DOCX 文件：调用 mammoth 提取纯文本（去除格式） */
async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

/** 解析 TXT 文件：直接按 UTF-8 编码转为字符串 */
function parseTxt(buffer: Buffer): string {
  return buffer.toString('utf-8')
}

/**
 * 解析文件内容为结构化文档对象
 * @param buffer - 文件的二进制数据
 * @param fileName - 文件名（用于推断格式和返回）
 * @returns 包含文件名、文件类型和文本内容的 ParsedDocument
 * @throws 当文件格式不受支持或解析后内容为空时抛出异常
 */
export async function parseFile(
  buffer: Buffer,
  fileName: string
): Promise<ParsedDocument> {
  const extension = getExtension(fileName)
  const fileType = validateType(extension)

  let content: string

  // 按文件类型分发到不同的解析函数
  switch (fileType) {
    case 'pdf':
      content = await parsePdf(buffer)
      break
    case 'docx':
      content = await parseDocx(buffer)
      break
    case 'txt':
      content = parseTxt(buffer)
      break
  }

  if (!content || content.trim().length === 0) {
    throw new Error(`文件 "${fileName}" 解析后内容为空`)
  }

  return { fileName, fileType, content }
}
