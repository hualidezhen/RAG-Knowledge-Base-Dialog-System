/**
 * 知识库（Collection）CRUD 服务。
 * 管理知识库集合的增删改查，持久化到 data/collections.json 文件。
 * 默认包含一个名为"rag_knowledge"的默认知识库。
 */

import * as fs from 'fs'
import * as path from 'path'

export interface KnowledgeBase {
  name: string        // 知识库名称
  description: string // 知识库描述
  createdAt: string   // 创建时间（ISO 格式）
}

const COLLECTIONS_FILE = path.resolve(__dirname, '../../data/collections.json')
const DEFAULT_KB: KnowledgeBase = {
  name: 'rag_knowledge',
  description: '默认知识库',
  createdAt: new Date('2024-01-01').toISOString(),
}

/** 从 JSON 文件加载所有知识库列表，文件损坏时重置为仅包含默认知识库 */
function loadData(): KnowledgeBase[] {
  try {
    if (fs.existsSync(COLLECTIONS_FILE)) {
      const raw = fs.readFileSync(COLLECTIONS_FILE, 'utf-8')
      return JSON.parse(raw)
    }
  } catch {
    // 文件损坏 — 重置为默认
  }
  return [DEFAULT_KB]
}

/** 将知识库列表保存到 JSON 文件 */
function saveData(data: KnowledgeBase[]) {
  const dir = path.dirname(COLLECTIONS_FILE)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(COLLECTIONS_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

/** 列出所有知识库 */
export function listCollections(): KnowledgeBase[] {
  return loadData()
}

/** 按名称查找知识库，不存在则返回 undefined */
export function getCollection(name: string): KnowledgeBase | undefined {
  return loadData().find((kb) => kb.name === name)
}

/** 创建一个新的知识库，名称重复时抛出异常 */
export function createCollection(name: string, description?: string): KnowledgeBase {
  const data = loadData()
  if (data.some((kb) => kb.name === name)) {
    throw new Error(`知识库 "${name}" 已存在`)
  }
  const kb: KnowledgeBase = {
    name,
    description: description || '',
    createdAt: new Date().toISOString(),
  }
  data.push(kb)
  saveData(data)
  return kb
}

/** 按名称删除知识库（默认知识库不可删除） */
export function deleteCollection(name: string): void {
  if (name === DEFAULT_KB.name) {
    throw new Error('不能删除默认知识库')
  }
  let data = loadData()
  const idx = data.findIndex((kb) => kb.name === name)
  if (idx === -1) {
    throw new Error(`知识库 "${name}" 不存在`)
  }
  data.splice(idx, 1)
  saveData(data)
}

/** 获取默认知识库名称（rag_knowledge） */
export function getDefaultCollectionName(): string {
  return DEFAULT_KB.name
}
