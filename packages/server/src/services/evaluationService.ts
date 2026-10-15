/**
 * 评估运行服务：触发测试集评估并记录历史结果。
 * 通过子进程执行 evaluator CLI，从生成的 Markdown 报告解析评分。
 */

import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'

import { EvalRunRecord } from '../types'

// ---- 持久化辅助方法 ----

const HISTORY_FILE = path.resolve(__dirname, '../../data/evaluation/history.json')

/** 确保评估历史数据目录存在 */
function ensureDir() {
  const dir = path.dirname(HISTORY_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

/** 从 JSON 文件加载评估历史记录 */
function loadHistory(): EvalRunRecord[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'))
    }
  } catch {
    /* 文件损坏 — 重置 */
  }
  return []
}

/** 将评估历史记录保存到 JSON 文件 */
function saveHistory(records: EvalRunRecord[]) {
  ensureDir()
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(records, null, 2), 'utf-8')
}

// ---- EvaluationService ----

export class EvaluationService {
  /**
   * 通过子进程执行完整的测试集评估。
   * 评估器 CLI 在完成后将报告写入 data/evaluation-report.md。
   * 子进程超时限制为 5 分钟（300 秒）。
   * @returns 是否成功 + 报告文件路径
   */
  async runEvaluation(): Promise<{ success: boolean; reportPath: string }> {
    const scriptPath = path.resolve(__dirname, '../evaluation/evaluator.ts')
    const cwd = path.resolve(__dirname, '../..')

    try {
      execSync(`npx ts-node "${scriptPath}"`, {
        cwd,
        timeout: 300_000, // 5 min
        stdio: 'pipe',
        env: { ...process.env },
      })

      const reportPath = path.resolve(cwd, 'data/evaluation-report.md')
      return { success: true, reportPath }
    } catch (err: any) {
      throw new Error(`评估运行失败: ${err.stderr?.toString() || err.message}`)
    }
  }

  /**
   * 解析评估报告，从 Markdown 中提取各项评分（Faithfulness/Relevance/Completeness），
   * 并将本次运行记录追加到历史中。
   * @returns 解析后的运行记录，如果报告文件不存在则返回 null
   */
  recordRun(): EvalRunRecord | null {
    const reportPath = path.resolve(__dirname, '../../data/evaluation-report.md')
    if (!fs.existsSync(reportPath)) return null

    const text = fs.readFileSync(reportPath, 'utf-8')

    // 从 Markdown 报告的汇总行解析各项评分
    const sumMatch = (label: string) => {
      const re = new RegExp(`${label}\\s+[\\d.]+\\s+[\\d.]+\\s+[\\d.]+\\s+([\\d.]+)`)
      const m = text.match(re)
      return m ? parseFloat(m[1]) : 0
    }

    const totalMatch = text.match(/Total cases:\s+(\d+)/)
    const totalCases = totalMatch ? parseInt(totalMatch[1], 10) : 0

    const record: EvalRunRecord = {
      timestamp: new Date().toISOString(),
      totalCases,
      avgFaithfulness: sumMatch('Faithfulness'),
      avgRelevance: sumMatch('Relevance'),
      avgCompleteness: sumMatch('Completeness'),
      details: [],
    }

    const history = loadHistory()
    history.push(record)
    saveHistory(history)

    return record
  }

  /**
   * 获取最近 10 次评估的运行趋势。
   */
  getTrend(): EvalRunRecord[] {
    const history = loadHistory()
    return history.slice(-10)
  }
}

// ---- Singleton 单例模式 ----

let instance: EvaluationService | null = null

export function getEvaluationService(): EvaluationService {
  if (!instance) {
    instance = new EvaluationService()
  }
  return instance
}
