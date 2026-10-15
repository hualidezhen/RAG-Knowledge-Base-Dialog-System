/**
 * Agent 专项评估器
 *
 * 用途：基于 agentTestSet 对 Agent 系统的多工具调用、推理质量和任务完成度
 *       进行自动化评分。比 evaluator.ts 多出三个 Agent 专属评估维度。
 *
 * 用法：
 *   cd packages/server
 *   npx ts-node src/evaluation/agentEvaluator.ts
 *
 * 环境要求：
 *   - DEEPSEEK_API_KEY 已配置（用于 LLM 推理和评分）
 *   - ChromaDB 运行在 localhost:8000（RAG 检索需要，可选）
 *
 * 工作流程：
 *   1. 遍历 agentTestSet 中的 8 个 Agent 测试用例
 *   2. 对每个用例执行 agentService.executeAgent() 获取完整执行轨迹
 *   3. 将执行轨迹（thought/action/observation）和最终回答提交给 LLM-as-Judge
 *   4. 在 evaluator.ts 的 3 个维度基础上，额外评估工具正确性、任务完整性、推理质量
 *   5. 汇总结果，生成 Markdown 格式评估报告（保存至 data/agent-evaluation-report.md）
 *
 * 评估维度（6 个）：
 *   - faithfulness:      忠实度 — 回答是否忠实于工具返回的数据
 *   - relevance:         相关度 — 回答是否直接针对用户问题
 *   - completeness:      完整度 — 回答是否覆盖所有重要方面
 *   - tool_correctness:  工具正确性 — 工具选择和参数是否正确
 *   - task_completeness: 任务完整性 — Agent 是否完整执行所有所需步骤
 *   - reasoning_quality: 推理质量 — Agent 的推理过程是否合理、清晰
 */

import * as fs from 'fs'
import * as path from 'path'

import Anthropic from '@anthropic-ai/sdk'

import { getAgentService } from '../services/agentService'
import { agentTestSet, TestCase } from './testSet'

// ====== 类型定义 ======

/**
 * Agent 评估的评分结果，包含 3 个通用维度和 3 个 Agent 专属维度
 */
interface ScoreResult {
  faithfulness: number       // 忠实度（1-5）：回答是否忠实于工具返回的数据，没有幻觉
  relevance: number          // 相关度（1-5）：回答是否直接针对用户问题
  completeness: number       // 完整度（1-5）：回答是否覆盖了问题的所有重要方面
  tool_correctness?: number    // 1-5 — 工具正确性：选择的工具和参数是否正确，是否按合理顺序调用
  task_completeness?: number   // 1-5 — 任务完整性：Agent 是否完整执行了所需的所有步骤
  reasoning_quality?: number   // 1-5 — 推理质量：Agent 的推理过程（Thought）是否合理、清晰
  explanation: string        // 评分的简要文字说明
}

/**
 * 单个 Agent 测试用例的执行结果
 */
interface CaseResult {
  testCase: TestCase                                                  // 对应的测试用例
  answer: string                                                      // Agent 的最终回答文本
  steps: { thought: string; actionName: string; observation: string }[] // Agent 执行步骤轨迹
  stepCount: number                                                    // 总步骤数
  toolCallCount: number                                                // 工具调用次数
  totalTokens: number                                                  // 总 Token 消耗
  score: ScoreResult | null                                            // LLM-as-Judge 评分
  error: string | null                                                 // 执行过程中的错误信息
}

/**
 * 单个维度的聚合统计
 */
interface AggregateScore {
  avg: number    // 均值
  min: number    // 最小值
  max: number    // 最大值
  count: number  // 有评分的用例数
}

/**
 * Agent 评估报告的完整数据结构（6 个评估维度）
 */
interface AgentEvaluationReport {
  timestamp: string           // 评估时间戳
  totalCases: number          // 总用例数
  passedCases: number         // 通过的用例数
  failedCases: number         // 失败的用例数
  aggregateScores: {
    faithfulness: AggregateScore      // 忠实度聚合
    relevance: AggregateScore         // 相关度聚合
    completeness: AggregateScore      // 完整度聚合
    tool_correctness: AggregateScore  // 工具正确性聚合
    task_completeness: AggregateScore // 任务完整性聚合
    reasoning_quality: AggregateScore // 推理质量聚合
  }
  results: CaseResult[]       // 每个用例的详细结果
  errorSummary: { id: string; error: string }[]  // 错误摘要列表
}

// ====== 评分客户端初始化 ======

/**
 * 初始化用于 Agent 评估的 LLM 客户端
 * 从环境变量读取 DEEPSEEK_API_KEY 和 Base URL，未配置时抛出异常。
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
 * 解析 Agent 评估的 LLM 评分文本，提取 6 个维度的分数。
 * 先尝试 JSON 解析，失败后用正则回退（支持 3 个 Agent 专属维度的正则匹配）。
 *
 * @param text - LLM 返回的原始评分文本
 * @returns 解析后的 ScoreResult 对象，包含可选的 Agent 维度
 */
function parseScoreResult(text: string): ScoreResult {
  // 策略一：尝试 JSON 解析
  const jsonMatch = text.match(/\{[\s\S]*?\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        faithfulness: clampScore(parsed.faithfulness),
        relevance: clampScore(parsed.relevance),
        completeness: clampScore(parsed.completeness),
        tool_correctness: parsed.tool_correctness != null ? clampScore(parsed.tool_correctness) : undefined,
        task_completeness: parsed.task_completeness != null ? clampScore(parsed.task_completeness) : undefined,
        reasoning_quality: parsed.reasoning_quality != null ? clampScore(parsed.reasoning_quality) : undefined,
        explanation: parsed.explanation || '',
      }
    } catch {
      // JSON 解析失败，回退到正则策略
    }
  }

  // 策略二：正则回退 — 匹配中文维度标签后的数字（含 Agent 专属维度）
  const faithMatch = text.match(/忠实度[^\d]*?(\d+)/)
  const relMatch = text.match(/相关度[^\d]*?(\d+)/)
  const compMatch = text.match(/完整度[^\d]*?(\d+)/)
  const toolMatch = text.match(/工具正确性[^\d]*?(\d+)/)
  const taskMatch = text.match(/任务完整性[^\d]*?(\d+)/)
  const reasonMatch = text.match(/推理质量[^\d]*?(\d+)/)

  return {
    faithfulness: clampScore(faithMatch ? parseInt(faithMatch[1], 10) : 0),
    relevance: clampScore(relMatch ? parseInt(relMatch[1], 10) : 0),
    completeness: clampScore(compMatch ? parseInt(compMatch[1], 10) : 0),
    tool_correctness: toolMatch ? clampScore(parseInt(toolMatch[1], 10)) : undefined,
    task_completeness: taskMatch ? clampScore(parseInt(taskMatch[1], 10)) : undefined,
    reasoning_quality: reasonMatch ? clampScore(parseInt(reasonMatch[1], 10)) : undefined,
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

// ====== LLM-as-Judge 评分核心（Agent 版本） ======

/**
 * 使用 LLM 对 Agent 执行结果进行 6 维度评分。
 * 与 evaluator.ts 的 scoreWithJudge 不同，此函数额外评估：
 *   - 工具正确性（tool_correctness）
 *   - 任务完整性（task_completeness）
 *   - 推理质量（reasoning_quality）
 *
 * Judge Prompt 包含完整的 Agent 执行轨迹（thought/action/observation）
 * 以及预期工具调用信息，使评分模型能全面评估 Agent 行为。
 *
 * @param client - 评分 LLM 客户端
 * @param testCase - 测试用例（含预期工具调用信息）
 * @param answer - Agent 的最终回答
 * @param steps - Agent 的执行步骤轨迹
 * @returns 评分结果
 */
async function scoreWithJudge(
  client: Anthropic,
  testCase: TestCase,
  answer: string,
  steps: { thought: string; actionName: string; observation: string }[]
): Promise<ScoreResult> {
  const hasTools = steps.length > 0
  // 格式化执行步骤轨迹，包含思考、动作和观察
  const stepsStr = hasTools
    ? steps.map((s, i) => `步骤 ${i + 1}:\n  思考: ${s.thought}\n  动作: ${s.actionName}\n  观察: ${s.observation}`).join('\n\n')
    : '（未调用任何工具）'

  // 获取预期工具调用信息
  const expectedToolsStr = testCase.expectedToolCalls
    ? testCase.expectedToolCalls.map((t) => t.toolName).join(', ')
    : '（无预期工具）'

  // 构建 Agent 评估专用的 Judge Prompt
  const judgePrompt = `你是一个Agent系统评估员。请根据以下标准对回答进行评分（1-5分）。

测试用例ID: ${testCase.id}
类别: ${testCase.category}
问题: ${testCase.question}
预期工具调用: ${expectedToolsStr}

Agent执行步骤：
${stepsStr}

最终回答：
${answer}

评分维度：
1. 忠实度 (Faithfulness) - 回答是否忠实于参考上下文或工具返回数据，没有幻觉？
2. 相关度 (Relevance) - 回答是否直接针对用户问题？
3. 完整度 (Completeness) - 回答是否覆盖了问题的所有重要方面？
4. 工具正确性 (Tool Correctness) - 选择的工具和参数是否正确？是否按合理顺序调用？
5. 任务完整性 (Task Completeness) - Agent是否完整执行了所需的所有步骤？
6. 推理质量 (Reasoning Quality) - Agent的推理过程是否合理、清晰？

请以严格的JSON格式输出评分，不要包含其他内容：
{ "faithfulness": <1-5>, "relevance": <1-5>, "completeness": <1-5>, "tool_correctness": <1-5>, "task_completeness": <1-5>, "reasoning_quality": <1-5>, "explanation": "<简要说明>" }`

  const response = await client.messages.create({
    model: 'deepseek-v4-flash',
    max_tokens: 512,
    temperature: 0.1,
    system: '你是一个严格的Agent评估助手。请只输出JSON格式的评分结果。',
    messages: [{ role: 'user', content: judgePrompt }],
  })

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')

  return parseScoreResult(text)
}

// ====== 评估报告生成 ======

/**
 * 生成 Agent 评估的 Markdown 报告
 * 包含 6 维度聚合评分表格、每个用例的详细结果（含执行轨迹）、错误摘要。
 *
 * @param report - Agent 评估报告数据
 * @returns Markdown 格式的字符串
 */
function generateReport(report: AgentEvaluationReport): string {
  const lines: string[] = []
  const push = (s: string) => lines.push(s)
  const pushn = (s: string) => lines.push(s, '')

  pushn(`# Agent Evaluation Report`)
  pushn(`评估时间: ${report.timestamp}`)
  pushn(`---`)

  // 聚合评分表格（6 个维度）
  pushn(`## Aggregate Scores`)
  pushn(`| Dimension | Avg | Min | Max | Scored Cases |`)
  pushn(`|-----------|-----|-----|-----|-------------|`)
  const { faithfulness, relevance, completeness, tool_correctness, task_completeness, reasoning_quality } = report.aggregateScores
  pushn(`| Faithfulness      | ${faithfulness.avg.toFixed(1)} | ${faithfulness.min} | ${faithfulness.max} | ${faithfulness.count} |`)
  pushn(`| Relevance         | ${relevance.avg.toFixed(1)} | ${relevance.min} | ${relevance.max} | ${relevance.count} |`)
  pushn(`| Completeness      | ${completeness.avg.toFixed(1)} | ${completeness.min} | ${completeness.max} | ${completeness.count} |`)
  pushn(`| Tool Correctness  | ${tool_correctness.avg.toFixed(1)} | ${tool_correctness.min} | ${tool_correctness.max} | ${tool_correctness.count} |`)
  pushn(`| Task Completeness | ${task_completeness.avg.toFixed(1)} | ${task_completeness.min} | ${task_completeness.max} | ${task_completeness.count} |`)
  pushn(`| Reasoning Quality | ${reasoning_quality.avg.toFixed(1)} | ${reasoning_quality.min} | ${reasoning_quality.max} | ${reasoning_quality.count} |`)
  pushn(``)
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
      const dims = [`**Faithfulness:** ${result.score.faithfulness}`, `**Relevance:** ${result.score.relevance}`, `**Completeness:** ${result.score.completeness}`]
      if (result.score.tool_correctness != null) dims.push(`**Tool Correctness:** ${result.score.tool_correctness}`)
      if (result.score.task_completeness != null) dims.push(`**Task Completeness:** ${result.score.task_completeness}`)
      if (result.score.reasoning_quality != null) dims.push(`**Reasoning Quality:** ${result.score.reasoning_quality}`)
      pushn(`| ${dims.join(' | ')} |`)
      pushn(`**Explanation:** ${result.score.explanation}`)
    } else {
      pushn(`**Score:** N/A`)
    }

    pushn(`**Steps:** ${result.stepCount} | **Tool Calls:** ${result.toolCallCount} | **Tokens:** ${result.totalTokens}`)
    if (result.steps.length > 0) {
      pushn(``)
      pushn(`**Execution Trace:**`)
      // 打印 Agent 的完整执行轨迹（Thought → Action → Observation）
      for (const step of result.steps) {
        pushn(`- Thought: ${step.thought}`)
        pushn(`  Action: ${step.actionName}`)
        pushn(`  Observation: ${step.observation.slice(0, 200)}`)
      }
    }
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
  pushn(`*Report generated automatically by Agent Evaluation System*`)

  return lines.join('\n')
}

// ====== 主运行器（Runner） ======

/**
 * 执行单个 Agent 测试用例
 * 调用 agentService.executeAgent() 获取 Agent 执行轨迹，
 * 然后将轨迹提交给 LLM-as-Judge 进行 6 维度评分。
 *
 * @param judgeClient - 评分 LLM 客户端
 * @param testCase - Agent 测试用例
 * @returns 执行结果，包含执行轨迹和评分
 */
async function runSingleCase(
  judgeClient: Anthropic,
  testCase: TestCase
): Promise<CaseResult> {
  const result: CaseResult = {
    testCase,
    answer: '',
    steps: [],
    stepCount: 0,
    toolCallCount: 0,
    totalTokens: 0,
    score: null,
    error: null,
  }

  try {
    // 步骤 1：执行 Agent（ReAct 循环），获取最终回答和执行轨迹
    const { answer, steps, totalTokens } = await getAgentService().executeAgent(testCase.question)
    result.answer = answer
    result.steps = steps.map((s) => ({
      thought: s.thought,
      actionName: s.action.name,
      observation: s.observation,
    }))
    result.stepCount = steps.length
    result.toolCallCount = steps.filter((s) => s.action.name !== '').length
    result.totalTokens = totalTokens

    // 步骤 2：使用 LLM-as-Judge 对 Agent 执行结果进行 6 维度评分
    if (testCase.question.trim()) {
      try {
        result.score = await scoreWithJudge(judgeClient, testCase, answer, result.steps)
      } catch {
        result.score = null
      }
    }
  } catch (err: any) {
    result.error = err.message || '未知错误'
  }

  return result
}

/**
 * Agent 评估主入口函数
 * 遍历 agentTestSet → 执行 Agent → LLM 评分 → 生成报告。
 */
async function runAgentEvaluation(): Promise<void> {
  console.log('='.repeat(60))
  console.log('   Agent Evaluation System')
  console.log('='.repeat(60))
  console.log(`\nAgent Test Set: ${agentTestSet.length} cases\n`)

  // 初始化评分 LLM 客户端
  let judgeClient: Anthropic
  try {
    judgeClient = createJudgeClient()
    console.log('[OK] Judge LLM client initialized')
  } catch (err: any) {
    console.error(`[FAIL] ${err.message}`)
    process.exit(1)
  }

  // 遍历并执行每个 Agent 测试用例
  const results: CaseResult[] = []
  for (let i = 0; i < agentTestSet.length; i++) {
    const tc = agentTestSet[i]
    const label = `[${i + 1}/${agentTestSet.length}] ${tc.id} (${tc.category})`
    console.log(`  Running ${label}...`)

    const result = await runSingleCase(judgeClient, tc)
    results.push(result)

    if (result.error) {
      console.log(`  → ❌ Error: ${result.error}`)
    } else {
      const parts: string[] = []
      if (result.score) {
        parts.push(`F:${result.score.faithfulness} R:${result.score.relevance} C:${result.score.completeness}`)
        if (result.score.tool_correctness != null) parts.push(`TC:${result.score.tool_correctness}`)
        if (result.score.task_completeness != null) parts.push(`TaskC:${result.score.task_completeness}`)
        if (result.score.reasoning_quality != null) parts.push(`RQ:${result.score.reasoning_quality}`)
      }
      console.log(`  → ${result.toolCallCount} tool calls | ${result.stepCount} steps | ${parts.join(' | ')}`)
    }
    console.log('')
  }

  // 汇总报告数据
  const scoredCases = results.filter((r) => r.score !== null)
  const failedCases = results.filter((r) => r.error !== null)

  // 计算指定维度的聚合统计
  const calcDim = (key: keyof ScoreResult, scored: ScoreResult[]) => {
    const vals = scored.map((s) => s[key]).filter((v): v is number => typeof v === 'number' && v > 0)
    return {
      avg: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
      min: vals.length > 0 ? Math.min(...vals) : 0,
      max: vals.length > 0 ? Math.max(...vals) : 0,
      count: vals.length,
    }
  }

  const scoredScores = scoredCases.map((r) => r.score!).filter(Boolean)

  const report: AgentEvaluationReport = {
    timestamp: new Date().toISOString(),
    totalCases: results.length,
    passedCases: results.length - failedCases.length,
    failedCases: failedCases.length,
    aggregateScores: {
      faithfulness: calcDim('faithfulness', scoredScores),
      relevance: calcDim('relevance', scoredScores),
      completeness: calcDim('completeness', scoredScores),
      tool_correctness: calcDim('tool_correctness', scoredScores),
      task_completeness: calcDim('task_completeness', scoredScores),
      reasoning_quality: calcDim('reasoning_quality', scoredScores),
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
  const reportPath = path.join(reportDir, 'agent-evaluation-report.md')
  fs.writeFileSync(reportPath, reportText, 'utf-8')

  // 打印最终汇总
  console.log('='.repeat(60))
  console.log('   Agent Evaluation Complete')
  console.log('='.repeat(60))
  console.log(`\nReport saved: ${reportPath}`)
  console.log(`\nSummary:`)
  console.log(`  Total cases:  ${report.totalCases}`)
  console.log(`  Passed:       ${report.passedCases}`)
  console.log(`  Failed:       ${report.failedCases}`)
  console.log(`\n  Average Scores (LLM-as-Judge):`)
  console.log(`  Faithfulness:       ${report.aggregateScores.faithfulness.avg.toFixed(2)}`)
  console.log(`  Relevance:          ${report.aggregateScores.relevance.avg.toFixed(2)}`)
  console.log(`  Completeness:       ${report.aggregateScores.completeness.avg.toFixed(2)}`)
  if (report.aggregateScores.tool_correctness.count > 0) {
    console.log(`  Tool Correctness:   ${report.aggregateScores.tool_correctness.avg.toFixed(2)}`)
    console.log(`  Task Completeness:  ${report.aggregateScores.task_completeness.avg.toFixed(2)}`)
    console.log(`  Reasoning Quality:  ${report.aggregateScores.reasoning_quality.avg.toFixed(2)}`)
  }
  console.log('')
}

if (require.main === module) {
  runAgentEvaluation().catch((err) => {
    console.error('\nAgent Evaluation failed:', err)
    process.exit(1)
  })
}
