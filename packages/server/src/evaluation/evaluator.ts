/**
 * LLM-as-Judge 评估器
 *
 * 用途：使用评分模型（LLM as Judge）对 RAG 系统的回答进行自动化评分，
 *       评估维度包括忠实度（Faithfulness）、相关度（Relevance）和完整度（Completeness）。
 *
 * 用法：
 *   cd packages/server
 *   npx ts-node src/evaluation/evaluator.ts
 *
 * 环境要求：
 *   - DEEPSEEK_API_KEY 已配置（用于调用评分模型）
 *   - ChromaDB 运行在 localhost:8000（用于 RAG 检索，不可用时跳过检索步骤仍可评分）
 *
 * 工作流程：
 *   1. 遍历 testSet 中的每个测试用例
 *   2. 对每个用例执行 RAG 检索 → 生成回答
 *   3. 调用 LLM-as-Judge 对回答进行三维度评分
 *   4. 汇总结果，生成 Markdown 格式的评估报告（保存至 data/evaluation-report.md）
 */

import * as fs from 'fs'
import * as path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { getRagService } from '../services/ragService'
import { RetrievedChunk } from '../types'
import { testSet, TestCase } from './testSet'

// ====== 类型定义 ======

/**
 * LLM-as-Judge 输出的评分结果，包含三个评估维度
 */
interface ScoreResult {
  faithfulness: number   // 忠实度（1-5）：回答是否忠实于参考上下文，没有幻觉或编造
  relevance: number      // 相关度（1-5）：回答是否直接针对用户问题
  completeness: number   // 完整度（1-5）：回答是否覆盖了问题的所有重要方面
  tool_correctness?: number    // 1-5 — Agent 评估专用：工具选择是否正确
  task_completeness?: number   // 1-5 — Agent 评估专用：任务是否完整完成
  reasoning_quality?: number   // 1-5 — Agent 评估专用：推理过程质量
  explanation: string    // 评分的简要文字说明
}

/**
 * 单个测试用例的执行结果
 */
interface CaseResult {
  testCase: TestCase       // 对应的测试用例
  answer: string           // RAG 生成的回答文本
  chunksAvailable: boolean // 检索是否返回了参考片段
  chunkCount: number       // 返回的参考片段数量
  score: ScoreResult | null // LLM-as-Judge 评分（为 null 表示评分失败或问题为空）
  error: string | null     // 执行过程中的错误信息
}

/**
 * 聚合评分统计
 */
interface AggregateScores {
  faithfulness: { avg: number; min: number; max: number; count: number }
  relevance: { avg: number; min: number; max: number; count: number }
  completeness: { avg: number; min: number; max: number; count: number }
}

/**
 * 完整评估报告的数据结构
 */
interface EvaluationReport {
  timestamp: string           // 评估时间戳
  chromaAvailable: number     // 成功检索到片段的用例数
  chromaUnavailable: number   // 未检索到片段的用例数
  totalCases: number          // 总用例数
  passedCases: number         // 通过的用例数（无错误）
  failedCases: number         // 失败的用例数（有错误）
  aggregateScores: AggregateScores // 各维度的聚合评分
  results: CaseResult[]       // 每个用例的详细结果
  errorSummary: { id: string; error: string }[]  // 错误摘要列表
}

// ====== 评分客户端初始化 ======

/**
 * 初始化用于 LLM-as-Judge 评分调用的 Anthropic（DeepSeek）客户端
 * 从环境变量读取 API Key 和 Base URL，未配置时抛出异常终止评估。
 */
function createJudgeClient(): Anthropic {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const baseURL = process.env.DEEPSEEK_ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic'

  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('DEEPSEEK_API_KEY 未配置，评估无法进行')
  }

  return new Anthropic({ apiKey, baseURL })
}

// ====== 评分结果解析 ======

/**
 * 解析 LLM 返回的评分文本，提取三维度的分数。
 * 采用双重策略：先尝试 JSON 解析，失败则用正则表达式回退匹配。
 * 这样可以兼容 LLM 输出格式不稳定的情况。
 *
 * @param text - LLM 返回的原始评分文本
 * @returns 解析后的 ScoreResult 对象
 */
function parseScoreResult(text: string): ScoreResult {
  // 策略一：尝试 JSON 解析 — 从文本中提取第一个 JSON 对象
  const jsonMatch = text.match(/\{[\s\S]*?\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        faithfulness: clampScore(parsed.faithfulness),
        relevance: clampScore(parsed.relevance),
        completeness: clampScore(parsed.completeness),
        explanation: parsed.explanation || '',
      }
    } catch {
      // JSON 解析失败，回退到正则策略
    }
  }

  // 策略二：正则回退 — 匹配中文维度标签后的数字
  const faithMatch = text.match(/忠实度[^\d]*?(\d+)/)
  const relMatch = text.match(/相关度[^\d]*?(\d+)/)
  const compMatch = text.match(/完整度[^\d]*?(\d+)/)

  return {
    faithfulness: clampScore(faithMatch ? parseInt(faithMatch[1], 10) : 0),
    relevance: clampScore(relMatch ? parseInt(relMatch[1], 10) : 0),
    completeness: clampScore(compMatch ? parseInt(compMatch[1], 10) : 0),
    explanation: text.slice(0, 200),
  }
}

/**
 * 将原始分数限制在 1-5 范围内并四舍五入为整数
 */
function clampScore(n: number): number {
  if (typeof n !== 'number' || isNaN(n)) return 0
  return Math.max(1, Math.min(5, Math.round(n)))
}

// ====== LLM-as-Judge 评分核心 ======

/**
 * 使用 LLM 作为评分器，对 RAG 回答进行三维度评分。
 * 构建 Judge Prompt 包含：问题、参考上下文、模型回答，
 * 要求 LLM 按 JSON 格式输出忠实度、相关度和完整度分数。
 *
 * @param client - Anthropic（DeepSeek）客户端实例
 * @param question - 用户提问
 * @param answer - RAG 系统生成的回答
 * @param chunks - 检索到的参考上下文片段
 * @returns 评分结果
 */
async function scoreWithJudge(
  client: Anthropic,
  question: string,
  answer: string,
  chunks: RetrievedChunk[]
): Promise<ScoreResult> {
  // 构建参考上下文文本：每个片段标注来源文件名
  const contextText =
    chunks.length > 0
      ? chunks.map((c) => `[${c.fileName}] ${c.content}`).join('\n---\n')
      : '（无参考上下文）'

  // 构建评分提示词（Judge Prompt），要求 LLM 输出严格 JSON 格式
  const judgePrompt = `你是一个RAG系统评估员。请根据以下标准对回答进行评分（1-5分）。

问题：${question}

参考上下文：
${contextText}

模型回答：
${answer}

评分维度：
1. 忠实度 (Faithfulness) - 回答是否忠实于参考上下文，没有幻觉或编造？
2. 相关度 (Relevance) - 回答是否直接针对用户问题？
3. 完整度 (Completeness) - 回答是否覆盖了问题的所有重要方面？

请以严格的JSON格式输出评分，不要包含其他内容：
{ "faithfulness": <1-5>, "relevance": <1-5>, "completeness": <1-5>, "explanation": "<简要说明>" }`

  // 调用 LLM 进行评分（非流式，低温度以保证一致性）
  const response = await client.messages.create({
    model: 'deepseek-v4-flash',
    max_tokens: 512,
    temperature: 0.1,
    system: '你是一个严格的RAG评估助手。请只输出JSON格式的评分结果。',
    messages: [{ role: 'user', content: judgePrompt }],
  })

  // 提取 LLM 返回的文本内容
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')

  return parseScoreResult(text)
}

// ====== 评估报告生成 ======

/**
 * 生成 Markdown 格式的评估报告
 * 包含聚合评分表格、每个用例的详细结果和错误摘要。
 *
 * @param report - 评估报告数据
 * @returns Markdown 格式的字符串
 */
function generateReport(report: EvaluationReport): string {
  const lines: string[] = []
  const push = (s: string) => lines.push(s)
  const pushn = (s: string) => lines.push(s, '')

  pushn(`# RAG Evaluation Report`)
  pushn(`评估时间: ${report.timestamp}`)
  pushn(`---`)

  // 聚合评分表格
  pushn(`## Aggregate Scores`)
  pushn(`| Dimension | Avg | Min | Max | Scored Cases |`)
  pushn(`|-----------|-----|-----|-----|-------------|`)
  const { faithfulness, relevance, completeness } = report.aggregateScores
  pushn(`| Faithfulness | ${faithfulness.avg.toFixed(1)} | ${faithfulness.min} | ${faithfulness.max} | ${faithfulness.count} |`)
  pushn(`| Relevance    | ${relevance.avg.toFixed(1)} | ${relevance.min} | ${relevance.max} | ${relevance.count} |`)
  pushn(`| Completeness | ${completeness.avg.toFixed(1)} | ${completeness.min} | ${completeness.max} | ${completeness.count} |`)
  pushn(``)
  pushn(`**ChromaDB Availability:** Available: ${report.chromaAvailable} cases | Not Available: ${report.chromaUnavailable} cases`)
  pushn(`**Total:** ${report.totalCases} cases | Passed: ${report.passedCases} | Failed: ${report.failedCases}`)
  pushn(``)
  pushn(`---`)

  // 逐个用例的详细结果
  pushn(`## Per-Case Results`)
  pushn(``)

  for (const result of report.results) {
    pushn(`### ${result.testCase.id} [${result.testCase.category}]`)
    pushn(`**Q:** ${result.testCase.question || '（空消息）'}`)

    if (result.error) {
      pushn(`**Status:** ❌ Failed`)
      pushn(`**Error:** ${result.error}`)
      pushn(``)
      continue
    }

    if (result.score) {
      pushn(`**Faithfulness:** ${result.score.faithfulness} | **Relevance:** ${result.score.relevance} | **Completeness:** ${result.score.completeness}`)
      pushn(`**Explanation:** ${result.score.explanation}`)
    } else {
      pushn(`**Score:** N/A`)
    }

    pushn(`**Chunks Available:** ${result.chunksAvailable} (${result.chunkCount} chunks)`)
    pushn(`**Answer Preview:** ${result.answer.slice(0, 200)}${result.answer.length > 200 ? '...' : ''}`)
    pushn(``)
  }

  // 错误摘要
  if (report.errorSummary.length > 0) {
    pushn(`---`)
    pushn(`## Error Summary`)
    pushn(`| Case ID | Error |`)
    pushn(`|---------|-------|`)
    for (const err of report.errorSummary) {
      pushn(`| ${err.id} | ${err.error} |`)
    }
    pushn(``)
  }

  pushn(`---`)
  pushn(`*Report generated automatically by RAG Evaluation System*`)

  return lines.join('\n')
}

// ====== 主运行器（Runner） ======

/**
 * 执行单个测试用例：RAG 检索 → 生成回答 → LLM-as-Judge 评分
 * 每个步骤独立 try/catch，一个步骤失败不影响后续步骤。
 *
 * @param ragService - RAG 服务实例
 * @param judgeClient - 评分 LLM 客户端
 * @param testCase - 待执行的测试用例
 * @returns 执行结果
 */
async function runSingleCase(
  ragService: ReturnType<typeof getRagService>,
  judgeClient: Anthropic,
  testCase: TestCase
): Promise<CaseResult> {
  const result: CaseResult = {
    testCase,
    answer: '',
    chunksAvailable: false,
    chunkCount: 0,
    score: null,
    error: null,
  }

  try {
    // 步骤 1：从知识库检索相关的上下文片段
    let chunks: RetrievedChunk[] = []
    try {
      chunks = await ragService.retrieveRelevantChunks(testCase.question)
      result.chunksAvailable = chunks.length > 0
      result.chunkCount = chunks.length
    } catch (err: any) {
      // 检索失败（如 ChromaDB 不可用）— 记录 chunksAvailable 为 false，不中断流程
      result.chunksAvailable = false
      result.chunkCount = 0
    }

    // 步骤 2：调用 RAG 生成回答（非流式）
    const { answer } = await ragService.generateAnswerNonStreaming(testCase.question)
    result.answer = answer

    // 步骤 3：使用 LLM-as-Judge 对回答进行三维度评分
    if (testCase.question.trim()) {
      try {
        result.score = await scoreWithJudge(judgeClient, testCase.question, answer, chunks)
      } catch (err: any) {
        // 评分失败（如 LLM 调用异常）— score 保留为 null
        result.score = null
      }
    }
  } catch (err: any) {
    result.error = err.message || '未知错误'
  }

  return result
}

/**
 * 评估主入口函数
 * 遍历所有测试用例 → 执行 RAG 检索与生成 → LLM 评分 → 生成报告。
 */
async function runEvaluation(): Promise<void> {
  console.log('='.repeat(60))
  console.log('   RAG Evaluation System')
  console.log('='.repeat(60))
  console.log(`\nTest Set: ${testSet.length} cases\n`)

  // 初始化评分 LLM 客户端
  let judgeClient: Anthropic
  try {
    judgeClient = createJudgeClient()
    console.log('[OK] Judge LLM client initialized')
  } catch (err: any) {
    console.error(`[FAIL] ${err.message}`)
    process.exit(1)
  }

  // 初始化 RAG 服务
  const ragService = getRagService()
  console.log('[OK] RAG Service initialized\n')

  // 遍历并执行每个测试用例
  const results: CaseResult[] = []
  for (let i = 0; i < testSet.length; i++) {
    const tc = testSet[i]
    const label = `[${i + 1}/${testSet.length}] ${tc.id} (${tc.category})`
    console.log(`  Running ${label}...`)

    const result = await runSingleCase(ragService, judgeClient, tc)
    results.push(result)

    if (result.error) {
      console.log(`  → ❌ Error: ${result.error}`)
    } else {
      const scoreStr = result.score
        ? `F:${result.score.faithfulness} R:${result.score.relevance} C:${result.score.completeness}`
        : 'no score (empty question)'
      console.log(`  → ${result.chunksAvailable ? '📄' : '💬'} ${scoreStr}`)
    }
    console.log('')
  }

  // 汇总报告数据
  const scoredCases = results.filter((r) => r.score !== null)
  const failedCases = results.filter((r) => r.error !== null)
  const chromaAvailable = results.filter((r) => r.chunksAvailable).length

  // 计算指定维度的聚合统计（均值、最小值、最大值、计数）
  const calcDim = (key: keyof ScoreResult) => {
    const vals = scoredCases.map((r) => (r.score as any)[key] as number).filter((v) => v > 0)
    return {
      avg: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
      min: vals.length > 0 ? Math.min(...vals) : 0,
      max: vals.length > 0 ? Math.max(...vals) : 0,
      count: vals.length,
    }
  }

  const report: EvaluationReport = {
    timestamp: new Date().toISOString(),
    chromaAvailable,
    chromaUnavailable: results.length - chromaAvailable,
    totalCases: results.length,
    passedCases: results.length - failedCases.length,
    failedCases: failedCases.length,
    aggregateScores: {
      faithfulness: calcDim('faithfulness'),
      relevance: calcDim('relevance'),
      completeness: calcDim('completeness'),
    },
    results,
    errorSummary: failedCases.map((r) => ({
      id: r.testCase.id,
      error: r.error || '',
    })),
  }

  // 生成并写入 Markdown 报告文件
  const reportText = generateReport(report)

  const reportDir = path.resolve(__dirname, '../../data')
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true })
  }
  const reportPath = path.join(reportDir, 'evaluation-report.md')
  fs.writeFileSync(reportPath, reportText, 'utf-8')

  // 打印最终汇总
  console.log('='.repeat(60))
  console.log('   Evaluation Complete')
  console.log('='.repeat(60))
  console.log(`\nReport saved: ${reportPath}`)
  console.log(`\nSummary:`)
  console.log(`  Total cases:  ${report.totalCases}`)
  console.log(`  Passed:       ${report.passedCases}`)
  console.log(`  Failed:       ${report.failedCases}`)
  console.log(`  ChromaDB available: ${report.chromaAvailable}/${report.totalCases}`)
  console.log(`\n  Average Scores (LLM-as-Judge):`)
  console.log(`  Faithfulness:  ${report.aggregateScores.faithfulness.avg.toFixed(2)}`)
  console.log(`  Relevance:     ${report.aggregateScores.relevance.avg.toFixed(2)}`)
  console.log(`  Completeness:  ${report.aggregateScores.completeness.avg.toFixed(2)}`)
  console.log('')
}

if (require.main === module) {
  runEvaluation().catch((err) => {
    console.error('\nEvaluation failed:', err)
    process.exit(1)
  })
}
