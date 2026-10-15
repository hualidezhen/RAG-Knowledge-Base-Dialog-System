# RAG 知识库问答系统 — Agent 执行指南

本文件是智能体架构升级（P1-P7）的**执行指令手册**。新会话启动时 Claude 会自动读取本文件。

**重要：每次开始任务前，必须先读取 `CONTEXT.md` 了解项目当前状态和待完成任务。**

---

## 一、前置条件

### 环境要求
- Node.js >= 18, npm >= 8
- ChromaDB 运行在 `http://localhost:8000`（`docker run -p 8000:8000 chromadb/chroma`）
- `packages/server/.env` 已配置：
  ```
  DEEPSEEK_API_KEY=sk-xxx
  DEEPSEEK_ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
  ZHIPU_API_KEY=xxx
  PORT=3001
  ```

### 依赖安装
```bash
npm install                                    # 根目录 workspaces
cd packages/server && npm install && cd ../..  # 后端
cd packages/client && npm install && cd ../..  # 前端
```

### 启动命令
```bash
# 后端（新终端）
cd packages/server && npm run dev

# 前端（新终端）
cd packages/client && npm run dev

# 访问 http://localhost:5173
```

---

## 二、编码规范（严格遵守）

### 2.1 导入顺序
```
1. 内置模块 (path, fs)
2. 第三方 npm 包 (express, chromadb, @anthropic-ai/sdk)
3. 本地模块 (相对路径: ../types, ./vectorStoreService)
```
每组之间空一行。示例：
```ts
import * as path from 'path'
import * as fs from 'fs'

import Anthropic from '@anthropic-ai/sdk'
import { Router } from 'express'

import { RetrievedChunk, ChatMessage } from '../types'
import { getEmbeddings } from './vectorStoreService'
```

### 2.2 类型定义
- 对象类型用 `export interface`，不用 `export type`
- `type` 仅用于联合类型（如 `export type SSEEvent = A | B`）
- 字面量联合用内联写法：`fileType: 'pdf' | 'docx' | 'txt'`
- 每个声明前加 `export`
- 命名：PascalCase

### 2.3 服务层模式

**Singleton 模式（所有 Service 必须使用）：**
```ts
let instance: SomeService | null = null

export function getSomeService(): SomeService {
  if (!instance) {
    instance = new SomeService()
  }
  return instance
}
```

**函数导出模式（无状态的工具函数）：**
```ts
export function doSomething(param: string): Result { ... }
```

### 2.4 错误处理

**API 控制器层：**
```ts
res.status(400).json({ error: '消息不能为空' })
res.status(404).json({ error: '文件未找到' })
res.status(503).json({ error: '向量数据库不可用...' })
res.status(500).json({ error: `处理异常: ${err.message}` })
```

**服务层 — 优雅降级模式：**
```ts
try {
  result = await riskyOperation()
} catch (err: any) {
  console.warn(`[ServiceName] Operation failed: ${err.message}`)
  result = fallbackValue   // 静默降级，不中断流程
}
```

**关键原则：** 绝不抛出未处理的异常。所有外部依赖（ChromaDB/LLM/BM25/Reranker）必须有降级路径。

### 2.5 SSE 事件格式

```ts
// SSE 头
res.setHeader('Content-Type', 'text/event-stream')
res.setHeader('Cache-Control', 'no-cache')
res.setHeader('Connection', 'keep-alive')
res.setHeader('X-Accel-Buffering', 'no')

// 事件格式
res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)
res.write(`data: ${JSON.stringify({ type: 'sources', sources: [...] })}\n\n`)
res.write(`data: ${JSON.stringify({ type: 'token', content: '...' })}\n\n`)
res.write(`data: ${JSON.stringify({ type: 'error', message: '...' })}\n\n`)
res.write('data: [DONE]\n\n')
```

### 2.6 Anthropic SDK 使用

```ts
// 非流式
const response = await client.messages.create({
  model: 'deepseek-v4-flash',
  max_tokens: 128,
  temperature: 0,
  system: 'System prompt here',
  messages: [{ role: 'user', content: prompt }],
})

// 提取文本
const text = response.content
  .filter((b): b is Anthropic.TextBlock => b.type === 'text')
  .map((b) => b.text)
  .join('')
  .trim()

// 流式
const stream = client.messages.stream({
  model: 'deepseek-v4-flash',
  max_tokens: 1024,
  temperature: 0.3,
  system: systemPrompt,
  messages: msgs,
})

stream.on('text', (text: string) => { /* write SSE */ })
stream.on('end', () => { /* write [DONE] */ })
stream.on('error', (error: Error) => { /* write error SSE */ })
```

### 2.7 命名约定
| 类别 | 规则 | 示例 |
|------|------|------|
| 文件/目录 | kebab-case | `toolRegistry.ts`, `vectorStoreService.ts` |
| 类/接口/类型 | PascalCase | `RagService`, `RetrievedChunk` |
| 函数/变量/方法 | camelCase | `getRagService()`, `rewriteQuery()` |
| Vue 组件 | PascalCase.vue | `ChatPanel.vue`, `MonitorDashboard.vue` |
| 常量 | UPPER_SNAKE | `MAX_BATCH_ITEMS`, `DEFAULT_KB_NAME` |

### 2.8 持久化模式（JSON 文件）

```ts
const DATA_FILE = path.resolve(__dirname, '../../data/some-file.json')

function loadData<T>(): T[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
    }
  } catch { /* corrupted — reset */ }
  return []
}

function saveData<T>(data: T[]) {
  const dir = path.dirname(DATA_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}
```

### 2.9 注释风格
- 公开函数用 `/** JSDoc */` 说明用途和参数
- 业务逻辑用中文行内注释
- 分节用 `// ---- Section Name ----`
- 不要写多余的"代码在做什么"注释

### 2.10 路由模式
```ts
import { Router } from 'express'
const router = Router()
router.get('/', handler)
export default router
```
挂载路径统一在 `index.ts`：`app.use('/api/xxx', router)`

### 2.11 前端 Pinia Store 模式
```ts
export const useXxxStore = defineStore('xxx', () => {
  const state = ref(...)
  function action() { ... }
  return { state, action }
})
```
SSE 解析用 `fetch()` 非 axios，REST 用 axios 实例。

---

## 三、任务执行顺序（严格依赖链）

```
P1(P1-1→P1-2→...→P1-7)
  ↓
P2(P2-1→P2-2→...→P2-5)    ← 依赖 P1（需要 Tool 系统）
  ↓
P3(P3-1→P3-2→...→P3-5)    ← 依赖 P2（Agent 引擎使用记忆）
  ↓
P4(P4-1→P4-2→...→P4-6)    ← 依赖 P1,P2（指标采集需要 Tool+Agent）
  ↓
P5(P5-1→P5-2→...→P5-5)    ← 依赖 P3,P4（反馈需要记忆+监控）
  ↓
P6(P6-1→P6-2→...→P6-4)    ← 依赖 P3（滑动窗口与记忆集成）
  ↓
P7(P7-1→P7-2→...→P7-4)    ← 依赖 P2,P3（Agent 评估需要 Agent 引擎+记忆）
```

**每个 P 模块内的子任务按编号顺序执行。** 当某个子任务因前置条件不满足时，返回完成前置任务后再继续。

---

## 四、详细任务规格

### P1: Tool 系统 — 标准化工具封装

#### P1-1: 定义 Tool 接口类型
- **文件：** `packages/server/src/types/index.ts`
- **参考现有类型：** `RetrievedChunk`, `ChatMessage` 的 interface 风格
- **需要添加：**
  ```ts
  export interface ToolParameter {
    name: string
    type: string
    description: string
    required?: boolean
  }

  export interface Tool {
    name: string
    description: string
    parameters: ToolParameter[]
    execute(args: Record<string, any>): Promise<any>
  }

  export interface ToolCall {
    toolName: string
    args: Record<string, any>
    result?: any
    error?: string
    durationMs?: number
  }

  export interface ToolResult {
    success: boolean
    data?: any
    error?: string
    durationMs: number
    tokenCount?: number
  }
  ```
- **验证：** `cd packages/server && npx tsc --noEmit` 不报错
- **陷阱：** 不要引入第三方 JSON Schema 库，用简单的 `ToolParameter[]` 描述参数

#### P1-2: 实现 ToolRegistry
- **文件：** 新增 `packages/server/src/services/toolRegistry.ts`
- **模式：** Singleton（参考 `getRagService()` 模式）
- **接口：**
  ```ts
  export class ToolRegistry {
    private tools = new Map<string, Tool>()

    register(tool: Tool): void         // 注册工具
    get(name: string): Tool | undefined // 查找工具
    list(): Tool[]                     // 列出所有工具
    async execute(name: string, args: Record<string, any>): Promise<ToolResult>
  }
  ```
- **`execute()` 方法必须：**
  1. 记录开始时间
  2. try/catch 执行
  3. 计算 durationMs
  4. 返回 ToolResult（含成功/失败状态）
- **验证：** 编写测试代码 `register` → `list` → `execute` → 验证 ToolResult 格式
- **陷阱：** execute 中必须处理 tool 不存在的错误（返回 `{ success: false, error: 'Tool xxx not found' }`）

#### P1-3: 封装 retrieve_knowledge Tool
- **文件：** 新增 `packages/server/src/tools/retrieveKnowledge.ts`
- **实现：**
  ```ts
  import { Tool } from '../types'
  import { getRagService } from '../services/ragService'

  export const retrieveKnowledgeTool: Tool = {
    name: 'retrieve_knowledge',
    description: '检索知识库中与查询相关的文档片段',
    parameters: [
      { name: 'query', type: 'string', description: '搜索查询', required: true },
      { name: 'topK', type: 'number', description: '返回结果数', required: false },
      { name: 'collection', type: 'string', description: '知识库名称', required: false },
    ],
    async execute(args) {
      const query = args.query as string
      const topK = (args.topK as number) || 8
      const collection = args.collection as string | undefined
      const chunks = await getRagService().retrieveRelevantChunks(query, collection)
      return { chunks: chunks.slice(0, topK) }
    },
  }
  ```
- **陷阱：** 在 `ToolRegistry` 中注册时用 `register(retrieveKnowledgeTool)`，注意 Tool 的 name 要与 registry 中的 key 一致

#### P1-4: 封装 list_documents Tool
- **文件：** 新增 `packages/server/src/tools/listDocuments.ts`
- **实现：** 调用 `vectorStoreService.listDocuments(collection)`，返回文档列表
- **参数：** `collection`（可选）

#### P1-5: 封装 get_document_content Tool
- **文件：** 新增 `packages/server/src/tools/getDocumentContent.ts`
- **实现：** 读取 `data/uploads/{fileName}` 文件内容返回
- **陷阱：** 文件可能不存在，需处理 ENOENT 错误

#### P1-6: 封装 chat_with_context Tool
- **文件：** 新增 `packages/server/src/tools/chatWithContext.ts`
- **参数：** `messages`, `temperature`（可选）
- **实现：** 调用 `ragService.generateAnswerNonStreaming()`，返回 answer

#### P1-7: Tool 初始化与注册
- **文件：** 修改 `packages/server/src/index.ts`
- **内容：** 在启动时初始化所有 Tool 并注册到 ToolRegistry
  ```ts
  import { createToolRegistry } from './services/toolRegistry'
  import { retrieveKnowledgeTool } from './tools/retrieveKnowledge'
  // ... 导入其他 Tool

  const registry = createToolRegistry()
  registry.register(retrieveKnowledgeTool)
  registry.register(listDocumentsTool)
  // ...
  ```
- **验证：** 启动服务后 `registry.list()` 返回所有已注册 Tool

---

### P2: 智能体编排引擎

#### P2-1: 定义 Agent 类型
- **文件：** `packages/server/src/types/index.ts`
- **添加：**
  ```ts
  export interface AgentConfig {
    maxIterations: number
    maxTokens: number
    temperature: number
    availableTools: string[]
  }

  export interface AgentStep {
    thought: string
    toolCall?: ToolCall
    observation?: string
    timestamp: number
  }

  export interface AgentRun {
    id: string
    sessionId: string
    question: string
    steps: AgentStep[]
    finalAnswer: string
    status: 'running' | 'completed' | 'failed'
    startTime: number
    endTime?: number
    totalTokens?: number
  }
  ```

#### P2-2: 实现 ReAct 推理循环
- **文件：** 新增 `packages/server/src/services/agentService.ts`
- **核心流程：**
  ```
  Loop:
    1. LLM 调用 → 生成 Thought + Action（工具名+参数）
    2. ToolRegistry.execute(action)
    3. 得到 Observation
    4. 如果未完成 → 回到 1
    5. 如果完成 → 生成 Final Answer
  ```
- **System Prompt 必须包含：** 可用工具清单（名称、描述、参数）、ReAct 格式说明
- **限制：** `maxIterations` 默认 10，防止无限循环
- **验证：** 发送"列出我的文档并检索'面试'相关内容"，观察是否依次调用 list_documents → retrieve_knowledge

#### P2-3: Agent 推理过程流式输出
- **文件：** `packages/server/src/services/agentService.ts`
- **SSE 事件扩展：**
  ```ts
  { type: 'agent_thinking', content: '我需要先列出文档...' }
  { type: 'agent_tool_use', tool: 'list_documents', args: {} }
  { type: 'agent_observation', content: '找到 3 个文档...' }
  ```
- **复用现有的 SSE 头设置模式**

#### P2-4: 工具调用错误恢复
- **策略：** 工具调用失败时重试 1 次，仍失败则跳过该步并告知 LLM
- **System Prompt 增加指令：** "当工具调用失败时，尝试其他方式回答或如实告知用户"

#### P2-5: Agent API 端点
- **新增：** `packages/server/src/routes/agent.ts` + `packages/server/src/controllers/agentController.ts`
- **路由：** `POST /api/agent/chat`
- **请求体：** `{ message, temperature?, history?, collection? }`
- **响应：** SSE 流（类型同 P2-3）
- **挂载：** `index.ts` — `app.use('/api/agent', agentRouter)`

---

### P3: 结构化记忆管理

#### P3-1: L2 对话摘要记忆
- **文件：** 新增 `packages/server/src/services/memoryService.ts`
- **功能：** 每 N 轮对话后（默认 4 轮），用 LLM 对早期对话生成摘要
- **存储路径：** `data/memories/{sessionId}.json`
- **摘要格式：**
  ```json
  {
    "sessionId": "session-xxx",
    "summary": "用户询问了关于面试准备的内容...",
    "keyFacts": ["用户正在准备技术面试", "用户关心算法和系统设计"],
    "timestamp": "2026-05-21T10:00:00.000Z",
    "messageCount": 8
  }
  ```
- **验证：** 多轮对话后检查 `data/memories/` 目录生成摘要文件

#### P3-2: L3 语义记忆
- **文件：** `packages/server/src/services/memoryService.ts`
- **功能：** 从对话中提取重要事实，用 Embedding 存入 ChromaDB
- **Collection 命名：** `memory_{sessionId}`
- **检索：** 在 RAG 检索时同时 query 语义记忆 collection
- **验证：** 存入事实后，用相关查询能检索到

#### P3-3: 会话管理 API
- **功能：** `createSession()` / `loadSession(id)` / `listSessions()` / `deleteSession(id)`
- **关联：** 每个 session 关联其 L2 摘要和 L3 collection
- **存储：** `data/memories/sessions.json`

#### P3-4: RAG 记忆检索集成
- **修改：** `packages/server/src/services/ragService.ts`
- **在 retrieveRelevantChunks 中：** 同时查询当前 session 的 L3 语义记忆
- **在 streamAnswer 中：** 将 L2 摘要注入 System Prompt

#### P3-5: 记忆自动维护
- **触发条件：** 当 L2 摘要数量 > 10 时
- **动作：** 用 LLM 合并旧摘要，删除被合并的旧文件

---

### P4: Agent 运行时监控系统

#### P4-1: LLM 调用指标采集
- **文件：** 新增 `packages/server/src/services/monitorService.ts`
- **采集点：** `ragService.ts` 中每次 `client.messages.create()` 和 `client.messages.stream()` 调用
- **数据：** `{ timestamp, category: 'llm', name: 'chat_completion', value: durationMs, tags: { model, tokensIn, tokensOut }, metadata }`

#### P4-2: 工具调用指标采集
- **采集点：** `ToolRegistry.execute()`
- **数据：** `{ timestamp, category: 'tool', name: toolName, value: durationMs, tags: { success } }`

#### P4-3: RAG 检索指标采集
- **采集点：** `ragService.retrieveRelevantChunks()`
- **数据：** `{ timestamp, category: 'retrieval', name: 'hybrid_search', value: durationMs, tags: { chunkCount, vectorCount, bm25Count, rerankCount } }`

#### P4-4: 指标聚合存储
- **文件：** 新增 `packages/server/src/services/metricsStore.ts`
- **聚合：** 按小时聚合（sum/avg/max/min/count），保留 7 天
- **存储：** `data/metrics/` — 按天分文件

#### P4-5: 监控 API 端点
- **文件：** `routes/monitor.ts`
- **端点：**
  - `GET /api/monitor/metrics?timeRange=1h|24h|7d` — 聚合指标
  - `GET /api/monitor/realtime` — 当前运行状态
  - `GET /api/monitor/logs?level=error&limit=50` — 最近错误日志

#### P4-6: 前端监控看板
- **文件：** `client/src/views/MonitorDashboard.vue`
- **内容：** 延迟趋势图、Token 消耗图、工具成功率、QPS 计数器
- **注意：** 使用 Element Plus `el-table`, 简单 CSS 图表（不用第三方图表库），如果觉得太复杂可以用纯后端 API 先

---

### P5: 用户反馈与在线评估

#### P5-1: 反馈提交接口
- **文件：** 新增 `services/feedbackService.ts` + `routes/feedback.ts` + `controllers/feedbackController.ts`
- **端点：** `POST /api/feedback`
- **请求体：** `{ messageId, rating(1-5), comment?, tags? }`
- **存储：** `data/feedback/feedback.json`（JSON 文件持久化）

#### P5-2: 反馈统计接口
- **端点：** `GET /api/feedback/stats`
- **返回：** `{ total, avgRating, distribution: { 1: n, 2: n, 3: n, 4: n, 5: n } }`

#### P5-3: 前端反馈 UI
- **修改：** `client/src/components/ChatPanel.vue` + `client/src/stores/chat.ts`
- **UI：** 每条助手消息下方显示 👍/👎 按钮 → 点击展开 1-5 星评分 + 评论文本框

#### P5-4: 在线评估触发
- **端点：** `POST /api/evaluation/run` — 后台运行测试集
- **端点：** `GET /api/evaluation/trend` — 返回最近 10 次评分趋势

#### P5-5: 反馈分析
- **功能：** 定期汇总低分回答的模式，输出 `data/feedback/analysis.json`

---

### P6: 对话历史滑动窗口与摘要管理

#### P6-1: 滑动窗口策略
- **文件：** 新增 `packages/server/src/services/contextManager.ts`
- **配置：** `maxHistoryTurns = 6`（保留最近 3 轮 user+assistant）
- **实现：** 截断超出部分前，先将截断内容传给 `memoryService` 生成摘要

#### P6-2: 对话摘要生成
- **触发：** 当 `history.length > maxHistoryTurns` 时
- **实现：** 调用 LLM 对最早对话生成摘要，用摘要替换原始消息

#### P6-3: Token 计数控制
- **估算：** 中文 `Math.ceil(text.length / 2)` + 英文 `Math.ceil(englishChars / 4)`
- **阈值：** 总 Token > 2000 时触发摘要或截断

#### P6-4: 与 memoryService 集成
- 摘要 → 写入 L2 记忆
- 关键事实 → 提取后写入 L3 语义记忆

---

### P7: Agent 评估系统升级

#### P7-1: 新增 Agent 测试用例
- **文件：** `packages/server/src/evaluation/testSet.ts`
- **新增 8 个用例：**
  - `agent-multi-tool-1/2`: "列出我的文档，然后检索其中关于 XX 的内容"
  - `agent-reasoning-1/2`: "根据文档 A 和 B 的内容推断..."
  - `agent-error-recovery-1/2`: "调用一个不存在的工具看看"（测试降级）
  - `agent-memory-1/2`: "还记得我之前问过什么吗？"

#### P7-2: 新增评估维度
- **扩展 `ScoreResult` 接口：** `tool_correctness`, `task_completeness`, `reasoning_quality`
- **Judge Prompt 增加对应维度说明**

#### P7-3: Agent 专项评估运行器
- **文件：** 新增 `packages/server/src/evaluation/agentEvaluator.ts`
- **复制 evaluator.ts 的框架，但：**
  - 调用 `POST /api/agent/chat` 而非 `ragService.generateAnswerNonStreaming()`
  - 评估维度包含 Agent 专属维度
  - 输出 `data/agent-evaluation-report.md`

#### P7-4: npm run evaluate:agent 脚本
- **修改：** `packages/server/package.json`
  ```json
  "evaluate:agent": "ts-node src/evaluation/agentEvaluator.ts"
  ```

---

## 五、验证清单（每个任务完成后的检查步骤）

### 通用验证
```bash
# 1. TypeScript 编译检查
cd packages/server && npx tsc --noEmit

# 2. 后端启动检查
cd packages/server && timeout 5 npm run dev
# 看控制台是否有 "Server is running" 输出

# 3. API 健康检查
curl http://localhost:3001/api/health
# 期望: {"status":"ok"}
```

### 各模块专项验证

| 模块 | 验证命令/步骤 |
|------|-------------|
| P1 | `registry.list()` 返回 >= 4 个 Tool；`registry.execute('retrieve_knowledge', {query:'test'})` 返回合法结果 |
| P2 | `curl -X POST http://localhost:3001/api/agent/chat -H 'Content-Type: application/json' -d '{"message":"列出我的文档"}'` 返回 SSE 流，包含 agent_thinking/agent_tool_use 事件 |
| P3 | 多轮对话后 `data/memories/` 目录生成摘要文件；再次启动后检索到历史记忆 |
| P4 | `curl http://localhost:3001/api/monitor/metrics?timeRange=1h` 返回合法 JSON 指标数据 |
| P5 | 提交反馈后 `curl http://localhost:3001/api/feedback/stats` 的 total 和 avgRating 正确 |
| P6 | 发送 8 轮对话消息，检查传递给 LLM 的 messages 数组不超过 6 条 + 1 条摘要 |
| P7 | `cd packages/server && npx ts-node src/evaluation/agentEvaluator.ts` 正常运行输出报告 |

---

## 六、进度记录规则

1. **每个子任务完成后：** 更新 `CONTEXT.md` 中的对应 `[ ]` 为 `[x]`
2. **如果遇到阻塞性问题：** 在 `CONTEXT.md` 对应任务下方添加 `> ⚠️ 阻塞：问题描述`
3. **每完成一个 P 模块：** 运行该模块的所有验证步骤，全部通过才标记完成
4. **跨会话继续执行时：**
   - 读取 `CONTEXT.md` 找最后一个 `[x]` 项
   - 从下一个 `[ ]` 项开始执行
   - 先运行该模块的验证（确保之前的代码仍然可用）

---

## 七、已知风险与规避

| 风险 | 规避措施 |
|------|---------|
| ChromaDB 未运行导致 503 | 每个任务开始前检查 `curl http://localhost:8000/api/v1` |
| 类型错误（tsc 编译失败） | 每次修改后立即运行 `npx tsc --noEmit`，不要积累多个文件后再检查 |
| API Key 过期 | 检查 `.env` 中的 DEEPSEEK_API_KEY 和 ZHIPU_API_KEY 是否配置且有效 |
| 前端/后端端口冲突 | 确保 3001（后端）和 5173（前端）未被占用 |
| 文件编码问题 | 全部使用 UTF-8，不要使用 GBK/GB2312 |
| 依赖版本冲突 | 使用 `npm install` 而非 `npm ci`，保持现有版本锁 |
