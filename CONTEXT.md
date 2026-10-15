# 项目状态摘要：RAG 知识库问答系统

## 1. 项目简介
基于文档的 RAG（检索增强生成）知识库问答系统，用户可以上传 PDF/Word/TXT 文档，通过自然语言提问，系统检索相关片段并流式生成回答，同时展示参考来源。

## 2. 技术栈
- **前端**：Vue 3 + TypeScript + Vite + Element Plus + Pinia + markdown-it
- **后端**：Node.js + Express + TypeScript + LangChain.js + Anthropic SDK + Chroma
- **大模型服务**：DeepSeek (通过 Anthropic 兼容端点 https://api.deepseek.com/anthropic 用于对话)
- **Embedding 模型**：智谱 Embedding API (`embedding-2`, 1024维)，使用独立 ZHIPU_API_KEY
- **向量数据库**：Chroma (本地持久化，路径 `packages/server/data/chroma`)

### 双模型架构说明
- **DeepSeek V4 Flash** — 对话生成（通过 Anthropic 兼容端点，`DEEPSEEK_API_KEY`）
- **智谱 `embedding-2`** — 文本向量化（通过智谱 API，`ZHIPU_API_KEY`）
- 流程：用户提问 → 智谱将问题转为向量检索知识库 → DeepSeek 基于检索结果生成回答

## 3. 目录结构
/
├── package.json # monorepo 根配置，workspaces: ["packages/*"]
├── CONTEXT.md # 本文件
├── packages/
│ ├── server/ # 后端
│ │ ├── package.json
│ │ ├── tsconfig.json
│ │ ├── .env # 需自行填写 DEEPSEEK_API_KEY
│ │ ├── .env.example
│ │ ├── data/ # Chroma 持久化数据 (git ignore)
│ │ └── src/
│ │ ├── index.ts # 服务入口，挂载路由，CORS，端口 3001
│ │ ├── routes/
│ │ │ ├── document.ts # 文档上传、列表路由
│ │ │ └── chat.ts # 对话路由
│ │ ├── controllers/
│ │ │ ├── documentController.ts
│ │ │ └── chatController.ts
│ │ ├── evaluation/
│ │ │ ├── testSet.ts # 17 个 QA 测试用例
│ │ │ └── evaluator.ts # LLM-as-Judge 自动化评估运行器
│ │ ├── routes/
│ │ │ ├── document.ts # 文档上传、列表路由
│ │ │ ├── chat.ts # 对话路由
│ │ │ └── knowledgeBase.ts # 知识库管理路由
│ │ └── services/
│ │ ├── vectorStoreService.ts # Chroma 初始化、Embedding、存入/检索
│ │ ├── ragService.ts # RAG 管道：检索 + System Prompt + Anthropic 流式生成
│ │ ├── hybridSearchService.ts # BM25 关键词检索，RRF 融合
│ │ ├── rerankerService.ts # Cross-encoder 重排序
│ │ └── collectionService.ts # 知识库元数据管理
│ └── client/ # 前端 (已实现文档管理面板)
│ ├── package.json
│ ├── vite.config.ts # 代理 /api -> http://localhost:3001
│ ├── index.html
│ └── src/
│ ├── main.ts
│ ├── App.vue # 两栏布局 (侧边栏 + 主区域)
│ ├── api/
│ │ ├── index.ts # axios 封装 (baseURL 空)
│ │ ├── chat.ts # 对话流式 SSE API
│ │ ├── document.ts # 文档 API (getDocuments, uploadDocuments)
│ │ └── knowledgeBase.ts # 知识库 API（CRUD）
│ ├── stores/
│ │ ├── documents.ts # 文档 Pinia store
│ │ └── chat.ts # 对话 Pinia store (消息列表、流式Stream、错误重试)
│ ├── components/
│ │ ├── DocumentPanel.vue # 左侧文档管理面板
│ │ └── UploadDialog.vue # 上传文档对话框
│ ├── router/
│ │ └── index.ts
│ └── views/
│ └── Home.vue


## 4. 已实现功能清单
- [x] 后端项目脚手架 (Express + TypeScript + LangChain.js)
- [x] 健康检查接口 `GET /api/health`
- [x] 文档上传 `POST /api/documents/upload` (支持 PDF/Word/TXT, 文本切分 chunk size 500 overlap 50)
- [x] 向量化存储 (OpenAIEmbeddings 对接 DeepSeek 兼容接口, 存入 Chroma)
- [x] 文档列表 `GET /api/documents`
- [x] RAG 流式问答 `POST /api/chat` (使用 Anthropic SDK 流式生成, SSE 响应, 首条返回 sources, 后续返回 token)
- [x] 前端项目骨架 (Vue3 + Element Plus 布局, 路由, API 代理)
- [x] 前端布局与文档管理面板 (Element Plus 两栏布局, 侧边栏文档管理, 上传对话框, 文档列表)
- [x] 对话界面与流式渲染 (SSE流式接收、Markdown渲染、参考资料折叠、消息气泡、自动滚动)
- [x] 侧边栏底部设置面板 (API Key 配置、Temperature 滑块、清空对话)
- [x] API Key 前端持久化 (localStorage) + 请求携带 `Authorization: Bearer` 请求头
- [x] 后端 API Key 动态覆盖 (读取 Authorization header, 创建临时 Anthropic client)
- [x] Temperature 参数前端调节 + 后端透传 (el-slider 0-1, step 0.1, 默认 0.3)
- [x] 空状态引导 (欢迎语 + 示例问题卡片，点击自动填入输入框)
- [x] 文档列表加载骨架屏 (el-skeleton)
- [x] AI 回复错误重试 (红色错误气泡 + Warning 图标 + "重新发送"按钮)
- [x] 全局样式润色 (CSS 变量、柔和阴影、过渡动画、响应式媒体查询 768px/480px)
- [x] Docker 化部署 (docker-compose.yml, 三容器: ChromaDB + Nginx + Node.js, 一键启动)
- [x] **RAG 检索优化**：nResults 3→30，按文档 round-robin 多样性精选至 8 条，确保多文档覆盖
- [x] **文档列表注入 System Prompt**：每次对话自动注入知识库完整文档清单，LLM 可精确回答"有哪些文档"
- [x] **多轮对话历史支持**：前端发送历史消息，后端传入 LLM messages 数组，支持追问和上下文关联
- [x] **分块策略优化**：chunkSize 500→800，overlap 50→150，提升每段语义完整性
- [x] **文档删除**：后端 DELETE 接口 + 前端删除按钮，含确认弹窗
- [x] **修复 Embedding API 404/400 错误**：DeepSeek 官方没有 Embedding API，切换为智谱 Embedding API（`embedding-2`，1024维）；智谱 API 有 64 条/次和 ~20000 字符/次双重限制，`createEmbedding` 改为动态分批逻辑（MAX_BATCH_ITEMS=50，MAX_BATCH_CHARS=15000），同时增加文本 sanitize 移除控制字符
- [x] **对话历史保存/导出** — 前端 localStorage 持久化（保存/加载/删除会话），单键 `rag_saved_sessions` 存储；导出为 Markdown（用户/AI 交替排列、含参考资料），Blob + URL.createObjectURL 触发下载
- [x] **查询改写 (Query Rewriting)** — 在检索前，用 DeepSeek 将"历史+当前问题"改写为独立检索查询（max_tokens=128, temperature=0），改写仅用于检索，原始问题用于回答生成
- [x] **混合检索 (Hybrid Search)** — 向量检索 + BM25 关键词检索并行，RRF 合并排序（score = 1/(60+rank_vector) + 1/(60+rank_bm25)），自动构建倒排索引，文档变更时自动失效重建
- [x] **文件拖拽上传** — el-upload drag 模式，原生拖拽悬停视觉反馈
- [x] **替换 Embedding 模型**：去除所有本地模型依赖，改用 DeepSeek Embedding API（1024维，复用现有 API Key）
- [x] **Cross-encoder 重排序** — 三级检索管线：向量 top-30 → BM25 RRF 合并 top-15 → Xenova/ms-marco-MiniLM-L-6-v2 cross-encoder 精排取 top-8（~80MB 模型，首次自动下载，CPU 推理）
- [x] **评估体系** — 17 个 QA 测试用例（4 类场景：事实性/多文档综合/边缘情况/链式推理），`npm run evaluate` 一键运行，LLM-as-Judge 三维评分（忠实度/相关度/完整度），输出 Markdown 评分报告 `data/evaluation-report.md`
- [x] **知识库管理** — ChromaDB 多 collection 隔离，KB 元数据 `data/collections.json`，前端侧边栏 KB 切换下拉菜单，上传/删除/问答关联当前 KB

### 待完成：智能体架构升级（P1-P7）

#### P1: Tool 系统 — 标准化工具封装
- [x] **定义 Tool 接口类型** — 在 `types/index.ts` 添加 `Tool`, `ToolCall`, `ToolResult` 接口（含 name, description, parameters JSONSchema, execute）
- [x] **实现 ToolRegistry** — `services/toolRegistry.ts`，支持 register/get/list/execute，全局单例
- [x] **封装 retrieve_knowledge Tool** — `tools/retrieveKnowledge.ts`，参数: query, topK, collection，调用 `ragService.retrieveRelevantChunks()`
- [x] **封装 list_documents Tool** — `tools/listDocuments.ts`，参数: collection?，调用 `vectorStoreService.listDocuments()`
- [x] **封装 get_document_content Tool** — `tools/getDocumentContent.ts`，参数: fileName，调用文档内容接口
- [x] **封装 chat_with_context Tool** — `tools/chatWithContext.ts`，参数: messages, temperature，调用 `ragService.generateAnswerNonStreaming()`
- [x] **Tool 执行记录** — 所有 Tool 自动记录执行时间、Token 消耗、成功/失败状态

#### P2: 智能体编排引擎 — 任务规划 + 工具调用
- [x] **定义 Agent 类型** — `types/index.ts` 添加 `AgentConfig`, `AgentStep`, `AgentRun` 接口
- [x] **实现 ReAct 推理循环** — `services/agentService.ts`：Thought → Action(Tool调用) → Observation → ... → Final Answer
- [x] **Agent 推理过程流式输出** — SSE 流式输出 Agent 思考过程（thinking/tool_use/observation/token 事件）
- [x] **工具调用错误恢复** — 工具调用失败时自动重试（最多 2 次）或跳过，保证 Agent 流程不中断
- [x] **POST /api/agent/chat 端点** — `routes/agent.ts` + `controllers/agentController.ts`，挂载到 `index.ts`

#### P3: 结构化记忆管理系统
- [x] **L2 对话摘要记忆** — `services/memoryService.ts`：每 N 轮对话后用 LLM 生成摘要，存入 `data/memories/` JSON 文件
- [x] **L3 语义记忆** — 重要事实/知识点用 Embedding 存入 ChromaDB `memory_store` collection，支持向量检索
- [x] **会话管理 API** — createSession/loadSession/listSessions/deleteSession，关联 L2/L3 记忆
- [x] **RAG 记忆检索集成** — 在 `ragService.ts` 检索阶段同时查询语义记忆，注入 System Prompt
- [x] **记忆自动维护** — 记忆数量超阈值时自动合并/摘要旧记忆，避免无限增长

#### P4: Agent 运行时监控系统
- [x] **LLM 调用指标采集** — `services/monitorService.ts`：每次 LLM 调用记录延迟(ms)、Token(输入/输出)、模型名
- [x] **工具调用指标采集** — 每次 Tool 执行记录工具名、参数、耗时、成功/失败状态
- [x] **RAG 检索指标采集** — 每次检索记录检索类型(向量/混合/rerank)、命中数、各阶段耗时
- [x] **指标聚合存储** — `services/metricsStore.ts`：按小时聚合，保留 7 天，`data/metrics/` JSON 持久化
- [x] **监控 API 端点** — `routes/monitor.ts`：`GET /api/monitor/metrics` / `realtime` / `logs`
- [x] **前端监控看板** — `views/MonitorDashboard.vue`：Vue + Element Plus 图表展示延迟/Token/成功率趋势

#### P5: 用户反馈与在线评估系统
- [x] **反馈提交接口** — `POST /api/feedback { messageId, rating(1-5), comment?, tags? }`，存入 `data/feedback/feedback.json`
- [x] **反馈统计接口** — `GET /api/feedback/stats` 返回 `{ total, avgRating, distribution }`
- [x] **前端反馈 UI** — `ChatPanel.vue` 每条 AI 回复下方 评价按钮 + 1-5 星评分 + 评论文本框
- [x] **在线评估触发** — `POST /api/evaluation/run` 执行测试集，`GET /api/evaluation/trend` 返回最近 10 次评分趋势
- [x] **反馈分析** — 分析低分回答模式，汇总常见问题类型，输出 `data/feedback/analysis.json`

#### P6: 对话历史滑动窗口与摘要管理
- [x] **滑动窗口策略** — `services/contextManager.ts`：maxHistoryTurns=6（保留最近 3 轮），超出的自动截断
- [x] **对话摘要生成** — 消息列表超阈值时，对最早对话调用 LLM 生成摘要替换原始消息，减少 Token 占用
- [x] **Token 计数控制** — 按中文字符/2 + 英文字符/4 估算 Token 数，总 Token > 2000 时触发摘要或截断
- [x] **与 memoryService 集成** — 滑动窗口生成的摘要注入 system prompt，checkpoint 正确捕获助手回复

#### P7: Agent 评估系统升级
- [x] **新增 Agent 测试用例（8 个）** — `evaluation/testSet.ts`：multi-tool(2)/reasoning(2)/error-recovery(2)/memory(2)
- [x] **新增评估维度** — tool_correctness(1-5)/task_completeness(1-5)/reasoning_quality(1-5)，扩展评分报告
- [x] **Agent 专项评估运行器** — `evaluation/agentEvaluator.ts`：独立评估管线，输出专项 Markdown 报告
- [x] **npm run evaluate:agent 脚本** — `package.json` 新增 `evaluate:agent` 脚本入口

### 已实现功能清单 — 测试覆盖

| 模块 | 测试文件 | 用例数 |
|------|---------|--------|
| 基础功能（健康检查） | `src/__tests__/basic-features.test.ts` | 1 |
| P1 Tool 系统 | `src/__tests__/p1-tool-system.test.ts` | 14 |
| P2 Agent 引擎 | `src/__tests__/p2-agent-engine.test.ts` | 9 |
| P3 记忆管理 | `src/__tests__/p3-memory.test.ts` | 11 |
| P4 监控系统 | `src/__tests__/p4-monitoring.test.ts` | 9 |
| P5 用户反馈 | `src/__tests__/p5-feedback.test.ts` | 9 |
| P6 滑动窗口 | `src/__tests__/p6-sliding-window.test.ts` | 10 |
| P7 Agent 评估 | `src/__tests__/p7-agent-evaluation.test.ts` | 9 |
| HTTP 端点集成 | `src/__tests__/api-endpoints.test.ts` | 11 |
| **合计** | **9 个测试文件** | **97** |

运行测试：`cd packages/server && npm test`

## 5. 启动命令
**后端**：
```bash
cd packages/server
npm run dev      # nodemon + ts-node 启动，监听 3001 端口
```

**ChromaDB 向量数据库**（需要先安装 Python 3.12+）：
```bash
pip install chromadb
cd packages/server
npm run chroma:start   # 启动 ChromaDB，监听 8000 端口
```

**Docker 一键启动**（需要先安装 Docker Desktop）：
```bash
# 在项目根目录执行
docker compose up --build
# 访问 http://localhost 即可使用
# 停止: docker compose down
```

**前端**：
```bash
cd packages/client
npm install
npm run dev         # Vite 启动，默认 5173 端口，代理 /api 到 3001
```

DEEPSEEK_API_KEY=your_deepseek_api_key       # 必填，从 .env 读取，勿直接填入
DEEPSEEK_ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
PORT=3001

## 6. 当前功能状态与后续优化

### 可用功能 ✅ (无 ChromaDB 时)
| 功能 | 说明 |
|------|------|
| 页面加载，无 500 报错 | ChromaDB 未连接时文档列表返回空数组，不中断 |
| 对话界面：空状态引导 + 示例问题 | 无消息时显示欢迎语和可点击的示例问题 |
| API Key 配置 | 侧边栏底部输入，localStorage 持久化，请求自动带 Authorization header |
| Temperature 滑块调节 | 0~1 步进 0.1，默认 0.3，前后端同步 |
| 清空对话 | 侧边栏底部 + 输入区上方两个入口 |
| 错误重试 | AI 回复出错时红色错误气泡 + "重新发送"按钮 |
| 响应式布局 | 768px / 480px 两档断点 |
| 全局 UI 风格 | CSS 变量、柔和阴影、过渡动画、骨架屏 |

### 不可用功能 ❌ (需 ChromaDB + API Key)
| 功能 | 原因 |
|------|------|
| 文档上传 | 依赖 ChromaDB 存储向量 |
| 文档列表加载 | ChromaDB 未运行（已降级为空列表规避报错） |
| RAG 文档检索问答 | 依赖 ChromaDB 检索知识库（已降级：无 ChromaDB 时走纯 LLM 对话，不检索文档） |

## 7. 功能完成状态

- **P1 (Tool 系统)** — ✅ 已完成
- **P2 (Agent 引擎)** — ✅ 已完成
- **P3 (记忆管理)** — ✅ 已完成
- **P4 (监控系统)** — ✅ 已完成
- **P5 (用户反馈)** — ✅ 已完成
- **P6 (滑动窗口)** — ✅ 已完成
- **P7 (Agent 评估)** — ✅ 已完成

## 8. 智能体架构分析（评估日期：2026-05-21）

### 8.1 已存在的智能体相关能力 ✅

| 能力 | 说明 | 文件位置 |
|------|------|---------|
| 向量检索 | ChromaDB + 智谱 Embedding，top-30 | `services/vectorStoreService.ts` |
| 混合检索 | BM25 + RRF 融合 | `services/hybridSearchService.ts` |
| 重排序 | Cross-encoder 精排 top-15→top-8 | `services/rerankerService.ts` |
| 查询改写 | LLM 改写多轮查询用于检索 | `services/ragService.ts:44-82` |
| 离线评估 | LLM-as-Judge 三维评分（17 cases） | `evaluation/evaluator.ts` |
| 对话历史 | 前端 localStorage 会话管理/导出 | `stores/chat.ts` |
| 知识库管理 | 多 collection 隔离 + CRUD | `services/collectionService.ts` |
| 文档多样性 | Round-robin 跨文档精选 | `services/ragService.ts:323-363` |

### 8.2 智能体架构升级能力（P1-P7，已完成 ✅）

| 能力 | 说明 | 文件位置 |
|------|------|---------|
| 标准化 Tool 封装 | 4 个工具（retrieve_knowledge, list_documents, get_document_content, chat_with_context） | `tools/*.ts`, `services/toolRegistry.ts` |
| ReAct 推理循环 | Thought→Action→Observation→Final Answer，最多 10 轮迭代 | `services/agentService.ts` |
| Agent SSE 流式输出 | agent_thinking/agent_tool_use/agent_observation/token 事件 | `services/agentService.ts` |
| 工具调用错误恢复 | 自动重试 + 跳过，保证流程不中断 | `services/agentService.ts` |
| L2 对话摘要记忆 | 每 4 轮用 LLM 生成摘要，JSON 文件持久化 | `services/memoryService.ts` |
| L3 语义记忆 | 关键事实 Embedding 存入 ChromaDB | `services/memoryService.ts` |
| 会话管理 API | create/load/list/delete 会话，关联 L2/L3 记忆 | `services/memoryService.ts` |
| 记忆自动维护 | >10 条摘要时自动合并 | `services/memoryService.ts` |
| LLM/工具/检索指标采集 | 延迟/Token/成功率/QPS | `services/monitorService.ts` |
| 指标聚合存储 | 按小时聚合，保留 7 天 | `services/metricsStore.ts` |
| 监控 API | GET /metrics /realtime /logs | `routes/monitor.ts` |
| 用户反馈提交/统计 | POST /api/feedback + GET /stats | `services/feedbackService.ts` |
| 反馈分析 | 低分模式分析，输出 analysis.json | `services/feedbackService.ts` |
| 评估 API | POST /api/evaluation/run + GET /trend | `routes/evaluation.ts` |
| 滑动窗口 | maxHistoryTurns=6，自动截断 | `services/contextManager.ts` |
| Token 计数 | 中文/英文混排估算 | `services/contextManager.ts` |
| Agent 评估（8 个用例） | 4 类场景 + 6 维评分 | `evaluation/agentEvaluator.ts` |
| 综合自动化测试 | 97 个测试用例，覆盖全部 P1-P7 + HTTP 端点 | `src/__tests__/*.test.ts` |

## 9. 智能体架构升级功能清单

### P1: Tool 系统 — 标准化工具封装（高优先级 ⭐⭐⭐⭐⭐）

将当前系统的全部能力封装为可注册、可调用的标准化 Tool 接口。

**设计：**
```typescript
interface Tool {
  name: string
  description: string
  parameters: JSONSchema
  execute(args: Record<string, any>): Promise<any>
}
```

**需要封装的 Tool：**
| Tool 名称 | 功能 | 对应现有能力 |
|-----------|------|-------------|
| `retrieve_knowledge` | 向量+混合检索知识库 | `ragService.retrieveRelevantChunks()` |
| `list_documents` | 列出知识库文档 | `vectorStoreService.listDocuments()` |
| `get_document_content` | 获取文档全文 | `documentController.getContent()` |
| `chat_with_context` | 基于上下文的问答 | `ragService.streamAnswer()` |
| `search_web` | 网络搜索补充知识 | 新增 |

**新增文件：**
- `services/toolRegistry.ts` — Tool 注册/查找/执行引擎
- `tools/retrieveKnowledge.ts` — 检索知识库 Tool
- `tools/listDocuments.ts` — 列出文档 Tool
- `tools/getDocumentContent.ts` — 获取文档内容 Tool
- `tools/chatWithContext.ts` — 上下文问答 Tool

**修改文件：**
- `types/index.ts` → 添加 `Tool`, `ToolCall`, `ToolResult` 类型
- `services/ragService.ts` → 集成 Tool 调用

**相关提示词：**
```prompt
请为项目创建标准化 Tool 系统。
要求：
1. 定义 Tool 接口：name, description, parameters (JSONSchema), execute(params)
2. 创建 ToolRegistry：register(name, tool), get(name), list(), execute(name, params)
3. 封装现有能力为 Tool：
   - retrieve_knowledge (参数: query, topK, collection)
   - list_documents (参数: collection?)
   - get_document_content (参数: filename)
   - chat_with_context (参数: messages, temperature)
4. 在 types/index.ts 添加 Tool, ToolCall, ToolResult 类型
5. 所有 Tool 添加执行时间、Token 消耗记录
请参考现有代码风格，使用 TypeScript。
```

---

### P2: 智能体编排引擎 — 任务规划 + 工具调用（高优先级 ⭐⭐⭐⭐⭐）

在 Tool 系统之上构建 LLM Agent，支持 ReAct 推理循环和复杂任务分解。

**核心流程：**
```
用户输入 → Agent 接收 → LLM 推理(ReAct) → 调用 Tool → 观察结果 → 继续推理 → 最终回答
```

**新增文件：**
- `services/agentService.ts` — Agent 编排内核（ReAct 循环）
- `routes/agent.ts` — Agent API 路由
- `controllers/agentController.ts` — Agent 控制器

**修改文件：**
- `types/index.ts` → 添加 `AgentConfig`, `AgentStep`, `AgentRun` 类型
- `index.ts` → 挂载 agent 路由

**相关提示词：**
```prompt
请为项目创建 LLM Agent 编排引擎。
要求：
1. 实现 ReAct 推理循环：Thought → Action(工具调用) → Observation → ... → Final Answer
2. Agent 配置：maxIterations, maxTokens, temperature, availableTools
3. System Prompt 中包含可用的工具清单及使用说明
4. 每次工具调用记录：工具名、参数、结果、耗时、Token消耗
5. 支持流式输出 Agent 的推理过程（思考过程可见）
6. 错误处理与优雅降级：工具调用失败时自动重试或跳过
7. 创建 POST /api/agent/chat 端点
请参考现有代码风格，使用 TypeScript。
```

---

### P3: 结构化记忆管理系统（高优先级 ⭐⭐⭐⭐⭐）

将当前简单历史消息升级为三级记忆系统。

**三级记忆架构：**
| 水平 | 记忆类型 | 存储 | 说明 |
|------|---------|------|------|
| L1 | 工作记忆 | 内存(当前上下文) | 当前对话轮次消息 |
| L2 | 对话摘要 | JSON 文件 | 历史对话的 LLM 摘要 |
| L3 | 语义记忆 | ChromaDB | 重要事实的向量化存储 |

**新增文件：**
- `services/memoryService.ts` — 记忆管理核心

**修改文件：**
- `types/index.ts` → 添加记忆相关类型
- `services/ragService.ts` → 集成记忆检索
- `services/vectorStoreService.ts` → 语义记忆 collection 支持
- `stores/chat.ts` → 记忆相关 UI

**相关提示词：**
```prompt
请为项目添加结构化记忆管理系统。
要求：
1. 三级记忆架构：
   - L1 工作记忆：当前会话消息列表（已有）
   - L2 对话摘要：每 N 轮对话后，用 LLM 生成摘要，存入 JSON 文件
      存储路径: packages/server/data/memories/
      摘要格式: { sessionId, summary, keyFacts, timestamp, messageCount }
   - L3 语义记忆：重要事实用 Embedding 存入 ChromaDB 的 memory_* collection
      检索：在 RAG 检索时同时检索语义记忆
2. 会话管理：createSession, loadSession, listSessions, deleteSession
3. 记忆检索：在 RAG 生成前自动检索相关记忆作为上下文
4. 记忆自动维护：当记忆数量超过阈值时，自动合并/摘要旧记忆
请使用 TypeScript，参考现有代码风格。
```

---

### P4: Agent 运行时监控系统（高优先级 ⭐⭐⭐⭐⭐）

构建生产级监控体系，追踪 Agent 运行各项指标。

**监控指标：**
| 指标 | 说明 | 采集点 |
|------|------|--------|
| 响应延迟 (ms) | 端到端响应时间 | Agent/LLM/Retrieval |
| Token 消耗 | 输入/输出 Token 数 | LLM 调用 |
| 工具调用成功率 | 成功/失败比率 | ToolRegistry |
| 幻觉率 | LLM-as-Judge 实时评分 | Agent 输出后 |
| 检索命中率 | 检索有效 chunk 比率 | Retrieval |
| QPS/TPS | 每秒查询/Token 数 | 全链路 |

**新增文件：**
- `services/monitorService.ts` — 指标采集与聚合
- `services/metricsStore.ts` — 指标存储
- `routes/monitor.ts` — 监控 API

**修改文件：**
- `services/ragService.ts` → 埋点
- `services/toolRegistry.ts` → 埋点
- `index.ts` → 挂载监控路由
- （可选）`client/src/views/MonitorDashboard.vue` — 监控看板

**相关提示词：**
```prompt
请为项目添加 Agent 运行时监控系统。
要求：
1. 指标采集：
   - 每次 LLM 调用记录：延迟、Token(输入/输出)、模型
   - 每次工具调用记录：工具名、参数、耗时、成功/失败
   - 每次 RAG 检索记录：检索类型(向量/混合)、命中数、耗时
2. 指标存储：按小时聚合，保留最近 7 天数据
   存储路径: packages/server/data/metrics/
3. API 端点：
   - GET /api/monitor/metrics?timeRange=1h|24h|7d  — 获取聚合指标
   - GET /api/monitor/realtime — 获取当前运行状态
   - GET /api/monitor/logs?level=error&limit=50 — 获取最近错误日志
4. 指标数据格式：
   { timestamp, category, name, value, tags, metadata }
5. 可选：前端监控看板页面（Vue + Element Plus 图表）
请使用 TypeScript，参考现有代码风格。
```

---

### P5: 用户反馈与在线评估系统（中优先级 ⭐⭐⭐⭐）

构建从用户侧收集反馈的闭环系统，并支持持续在线评估。

**反馈流程：**
```
回答 → [👍/👎] → 评分(1-5) + 评论 → 存入 feedback.json → 定期分析 → 自动触发重评估
```

**新增文件：**
- `routes/feedback.ts` — 反馈 API
- `controllers/feedbackController.ts`
- `services/feedbackService.ts` — 反馈收集与分析

**修改文件：**
- `client/src/components/ChatPanel.vue` → 反馈按钮 UI
- `client/src/stores/chat.ts` → 反馈提交

**相关提示词：**
```prompt
请为项目添加用户反馈与在线评估系统。
要求：
1. 用户反馈：
   - POST /api/feedback — 提交反馈 { messageId, rating(1-5), comment?, tags? }
   - GET /api/feedback/stats — 反馈统计 { total, avgRating, distribution }
   - 反馈数据存储: packages/server/data/feedback/feedback.json
2. 反馈 UI：
   - 每条 AI 回复下方显示 👍/👎 按钮
   - 点击后展开评分 1-5 星 + 可选评论输入框
3. 在线评估：
   - POST /api/evaluation/run — 触发评估运行
   - GET /api/evaluation/latest — 获取最新评估报告
   - GET /api/evaluation/trend — 获取评分趋势（最近 10 次）
4. 反馈分析：
   - 定期分析低分回答的模式
   - 汇总常见问题类型
请使用 TypeScript + Vue 3，参考现有代码风格。
```

---

### P6: 对话历史滑动窗口与摘要管理（中优先级 ⭐⭐⭐⭐）

改进当前全部历史消息发送的方式，实现智能上下文管理。

**策略：**
```
对话 N 轮 ≤ 阈值 → 全部发送
对话 N 轮 > 阈值 → 保留最近 K 轮 + 摘要早期对话
Token 计数 → 精确控制不超上下文窗口
```

**新增文件：**
- `services/contextManager.ts` — 上下文窗口管理

**修改文件：**
- `services/ragService.ts` → 集成上下文管理
- `services/memoryService.ts` → 集成摘要

**相关提示词：**
```prompt
请为项目添加对话历史滑动窗口与摘要管理。
要求：
1. 滑动窗口策略：
   - maxHistoryTurns = 6（保留最近 3 轮 user+assistant）
   - 超出的部分自动截断
2. 对话摘要：
   - 当消息列表超过 maxHistoryTurns 时，对最早的对话调用 LLM 生成摘要
   - 摘要替换原始消息，减少 Token 占用
   - 摘要格式：{ summary: string, keyFacts: string[], timestamp }
3. Token 计数：
   - 估算每条消息的 Token 数（按中文字符/2 + 英文字符/4）
   - 总 Token 超过阈值(2000)时触发摘要或截断
4. 与 memoryService 集成：
   - 生成的摘要同时写入 L2 记忆
   - 关键事实写入 L3 语义记忆
请使用 TypeScript，参考现有代码风格。
```

---

### P7: Agent 评估系统升级（低优先级 ⭐⭐⭐）

扩展当前 LLM-as-Judge 评估，加入 Agent 专属维度和测试场景。

**新增评估维度：**
| 维度 | 说明 | 评分范围 |
|------|------|---------|
| tool_correctness | 工具选择是否正确 | 1-5 |
| task_completeness | 任务是否完整完成 | 1-5 |
| reasoning_quality | 推理过程是否合理 | 1-5 |

**新增测试场景：**
- agent-multi-tool: 多工具连续调用协作任务
- agent-reasoning: 需要复杂推理的任务
- agent-error-recovery: 工具失败后恢复能力
- agent-memory: 需要依赖历史记忆的任务

**新增文件：**
- `evaluation/agentEvaluator.ts` — Agent 专项评估

**修改文件：**
- `evaluation/testSet.ts` → 新增 8 个 Agent 测试用例
- `evaluation/evaluator.ts` → 评估维度扩展

**相关提示词：**
```prompt
请升级评估系统以支持 Agent 场景的评估。
要求：
1. 新增 Agent 测试用例（8 个）：
   - agent-multi-tool-1/2: 多工具调用协作任务
   - agent-reasoning-1/2: 复杂推理任务
   - agent-error-recovery-1/2: 错误恢复场景
   - agent-memory-1/2: 依赖长期记忆的任务
2. 新增评估维度：
   - tool_correctness (1-5): 工具选择是否正确
   - task_completeness (1-5): 任务是否完整完成
   - reasoning_quality (1-5): 推理过程质量
3. 扩展评分报告格式，包含各维度的详细分析
4. 新增 npm run evaluate:agent 脚本
请使用 TypeScript，参考现有代码风格。
```

## 10. 智能体架构升级路线图

```
第 1 周 (P1)     Tool 系统 — 标准化工具封装
第 2-3 周 (P2)   智能体编排引擎 — 任务规划 + 工具调用
第 3-4 周 (P3)   结构化记忆管理（三级记忆）
第 4-5 周 (P4)   Agent 运行时监控系统
第 5 周 (P5)     用户反馈与在线评估
第 6 周 (P6)     对话历史滑动窗口与摘要管理
第 7 周 (P7)     Agent 评估系统升级
```

## 11. 新增/修改文件汇总

### 新增文件（33 个）：
| 文件 | 所属 |
|------|------|
| `services/toolRegistry.ts` | P1 |
| `tools/retrieveKnowledge.ts` | P1 |
| `tools/listDocuments.ts` | P1 |
| `tools/getDocumentContent.ts` | P1 |
| `tools/chatWithContext.ts` | P1 |
| `services/agentService.ts` | P2 |
| `routes/agent.ts` | P2 |
| `controllers/agentController.ts` | P2 |
| `services/memoryService.ts` | P3 |
| `services/monitorService.ts` | P4 |
| `services/metricsStore.ts` | P4 |
| `routes/monitor.ts` | P4 |
| `controllers/monitorController.ts` | P4 |
| `client/src/views/MonitorDashboard.vue` | P4 |
| `client/src/api/monitor.ts` | P4 |
| `services/feedbackService.ts` | P5 |
| `routes/feedback.ts` | P5 |
| `controllers/feedbackController.ts` | P5 |
| `services/evaluationService.ts` | P5 |
| `routes/evaluation.ts` | P5 |
| `controllers/evaluationController.ts` | P5 |
| `client/src/api/feedback.ts` | P5 |
| `services/contextManager.ts` | P6 |
| `evaluation/agentEvaluator.ts` | P7 |
| `app.ts` | 基础设施 | Express app 抽取（解耦 listen，支持 supertest） |
| `vitest.config.ts` | 基础设施 | Vitest 测试配置 |
| `src/__tests__/setup.ts` | 基础设施 | 测试全局设置（加载 .env，抑制 console） |
| `src/__tests__/basic-features.test.ts` | 测试 | 基础功能测试（1 个） |
| `src/__tests__/p1-tool-system.test.ts` | 测试 | P1 Tool 系统测试（14 个） |
| `src/__tests__/p2-agent-engine.test.ts` | 测试 | P2 Agent 引擎测试（9 个） |
| `src/__tests__/p3-memory.test.ts` | 测试 | P3 记忆管理测试（11 个） |
| `src/__tests__/p4-monitoring.test.ts` | 测试 | P4 监控系统测试（9 个） |
| `src/__tests__/p5-feedback.test.ts` | 测试 | P5 用户反馈测试（9 个） |
| `src/__tests__/p6-sliding-window.test.ts` | 测试 | P6 滑动窗口测试（10 个） |
| `src/__tests__/p7-agent-evaluation.test.ts` | 测试 | P7 Agent 评估测试（9 个） |
| `src/__tests__/api-endpoints.test.ts` | 测试 | HTTP 端点集成测试（11 个） |

### 修改文件（14 个）：
| 文件 | 修改内容 | 所属 |
|------|---------|------|
| `types/index.ts` | 添加 Tool/Agent/Memory/Monitor 类型 | P1-P7 |
| `services/ragService.ts` | Tool 调用/监控埋点/记忆检索 | P1-P6 |
| `services/vectorStoreService.ts` | 语义记忆 collection | P3 |
| `services/toolRegistry.ts` | 工具调用指标采集 | P4 |
| `services/agentService.ts` | Agent ReAct LLM 指标采集 | P4 |
| `index.ts` | 挂载新路由 + 全局错误处理器 | P2, P4, P5 |
| `client/src/router/index.ts` | 添加 /monitor 路由 | P4 |
| `controllers/chatController.ts` | 集成 Agent/记忆 | P2, P3 |
| `evaluation/testSet.ts` | Agent 测试用例 | P7 |
| `evaluation/evaluator.ts` | 新增评估维度 | P7 |
| `client/src/stores/chat.ts` | 支持反馈/记忆 UI | P3, P5 |
| `client/src/components/ChatPanel.vue` | 反馈按钮 | P5 |
| `app.ts` | Express app 抽取，解耦 listen | 基础设施 |
| `package.json` | 添加 vitest 依赖和 test/test:watch/test:coverage 脚本 | 测试 |
