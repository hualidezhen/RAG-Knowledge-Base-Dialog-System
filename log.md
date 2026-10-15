# RAG 知识库问答系统 — 优化日志

## 长回答中途截断修复 (2026-05-22)

### 问题
回答内容稍长时，输出中途卡住，内容不完整。继续输入"接着讲"之类的指令可以接上，但体验差。

### 根因
`ragService.ts` 中 `max_tokens: 1024` 限制太严。每次 LLM 调用只能生成最多 1024 tokens（约 700-800 中文字符），超过后流式响应正常结束（发送 `[DONE]`），但回答被截断。继续输入时因对话历史携带了上下文，所以能接上。

### 修复
| 修改 | 文件 | 说明 |
|------|------|------|
| `max_tokens: 1024` → `parseInt(process.env.MAX_TOKENS \|\| '8192', 10)` | `ragService.ts:255,533` | 流式和非流式两处调用均改为可配置，默认 8192 tokens |
| 新增 `MAX_TOKENS=8192` | `.env`, `.env.example` | 可选环境变量，不配置时默认 8192 |

### 涉及文件
- `packages/server/src/services/ragService.ts` — 两处 `max_tokens` 硬编码改为环境变量 + 默认 8192
- `packages/server/.env` — 新增 `MAX_TOKENS=8192`
- `packages/server/.env.example` — 同步新增

---

## 智能体架构分析与升级规划 (2026-05-21)

### 背景

对项目进行了全面的智能体架构能力审计，评估当前系统在 LLM Agent 维度的完备性，并规划从 RAG → Agentic RAG 的升级路径。

### 审计结论

#### 已存在的 Agent 相关能力 ✅
| 能力 | 文件 |
|------|------|
| 向量检索 (ChromaDB + 智谱 Embedding) | `vectorStoreService.ts` |
| 混合检索 (BM25 + RRF 融合) | `hybridSearchService.ts` |
| Cross-encoder 重排序 | `rerankerService.ts` |
| 查询改写 | `ragService.ts:44-82` |
| 离线评估 (17 cases, LLM-as-Judge) | `evaluation/evaluator.ts` |
| 对话历史会话管理 | `stores/chat.ts` |
| 知识库多 collection 管理 | `collectionService.ts` |
| 文档多样性 round-robin | `ragService.ts:323-363` |

#### 缺失的 Agent 能力 ❌
| 能力 | 缺失程度 | 说明 |
|------|---------|------|
| 任务规划 | 完全缺失 | 无 ReAct/Plan-and-Execute/CoT 推理 |
| 工具调用 | 完全缺失 | 系统能力未封装为标准 Tool |
| 结构化记忆管理 | 完全缺失 | 仅有基础对话历史 |
| 运行时监控 | 完全缺失 | 仅有 console.log，无指标 |
| 用户反馈 | 完全缺失 | 无评分/反馈接口 |
| 在线评估 | 完全缺失 | 仅离线 CLI |
| 标准化 Tool 封装 | 完全缺失 | 无 Tool 接口定义 |

### 规划产出

#### 1. CONTEXT.md 更新
- §8 智能体架构分析 — 已存在/缺失能力对比
- §9 功能清单扩展 — P1~P7 共 36 个 `[ ]` 子任务（Tool 系统/Agent 引擎/记忆管理/监控/反馈/滑动窗口/评估升级）
- §10 升级路线图 — 7 周执行时间线
- §11 新增/修改文件汇总 — 18 新增 + 10 修改

#### 2. CLAUDE.md 创建
在项目根目录创建了 `CLAUDE.md` 执行指令手册，包含：
- 11 条编码规范（导入顺序/类型定义/Singleton模式/错误处理/SSE格式/Anthropic SDK/命名约定/持久化/注释/路由/Pinia）
- P1-P7 严格依赖链（P1→P2→P3→P4→P5→P6→P7）
- 36 个子任务的详细规格（文件路径/实现模式/验证步骤/常见陷阱）
- 验证清单（通用验证命令 + 各模块专项验证）
- 进度记录规则和已知风险规避

#### 3. 跨会话执行保障机制
- CLAUDE.md 由 Claude Code **自动读取**（无需 @）
- CONTEXT.md 需要 **`@CONTEXT.md`** 手动引入
- 每个任务设计粒度可独立执行，完成后更新 `[ ]→[x]`

#### 4. 记忆持久化
- 创建了 memory 文件 `agent-architecture-analysis.md`
- 记录分析结论和 P1-P7 规划要点
- 便于未来会话直接引用

### 涉及文件
| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `CONTEXT.md` | 修改 | §4 新增 36 个待完成任务；新增 §8-§11 分析/规划/路线图/文件清单 |
| `CLAUDE.md` | 新建 | 完整的执行指令手册，确保跨会话可靠执行 |
| `log.md` | 修改 | 本文 — 记录本次分析过程 |

---

## 最新修复 (2026-05-20)

### 问题：上传文档时 Embedding API 返回 404

上传 .docx 文件失败，错误：
```
Embedding API 请求失败 (404): 
```

**根因**：DeepSeek 官方从未提供 Embedding API。代码中引用的 `deepseek-embedding` 模型和 `/embeddings` 端点均不存在。DeepSeek V4 仅支持 `deepseek-v4-flash` 和 `deepseek-v4-pro` 两个对话模型（`GET /v1/models` 验证）。无论 `/v1/embeddings` 还是 `/embeddings` 路径都会返回 404。

**修复**：将 Embedding 方案从 DeepSeek API 切换为 **智谱 (ZhipuAI) Embedding API**。
1. `packages/server/src/services/vectorStoreService.ts` — 改用智谱 API（`embedding-2` 模型，1024维），API Key 来源改为 `ZHIPU_API_KEY`
2. `packages/server/.env` — 新增 `ZHIPU_API_KEY`，移除 `DEEPSEEK_OPENAI_BASE_URL`
3. `packages/server/.env.example` — 同步更新

**架构**：智谱（Embedding）+ DeepSeek（对话），各取所长。

### 补充修复

**问题 1**：智谱 Embedding API 返回 400 错误（code 1214），提示 `"input数组最大不得超过64条"`。

**根因**：文档切块数超过 64 条时，一次性全部发给智谱 API 会超出其批处理上限。

**修复**：
- `vectorStoreService.ts` — `createEmbedding` 函数增加分批逻辑，提取 `callEmbeddingAPI` 内部函数

**问题 2**（后续发现）：大文件上传返回 400 错误（code 1210），提示 `"API 调用参数有误，请检查文档"`。小文件正常。

**根因**：智谱 API 还有**总字符数限制**，每次请求总字符数超过约 20,000 字符时返回 1210。30 条 x 680 字符通过，35 条 x 680 字符即失败。将分批逻辑从固定条数（50）改为**按总字符数动态分批**（MAX_BATCH_CHARS=15000），同时增加文本清理（移除控制字符）。

## 历史记录

### 2026-05-20

---

## 补充问答

### Q5: 现在是两个模型都有吗？各自的分工是什么？

**A**：是的，两个模型各司其职：

| 环节 | 模型 | 职责 |
|------|------|------|
| 文档上传 → 向量化 | 智谱 `embedding-2` | 将文档切块后转成向量，存入 ChromaDB |
| 用户提问 → 检索 | 智谱 `embedding-2` | 将问题转成向量，从 ChromaDB 检索相关片段 |
| 生成回答 | DeepSeek V4 Flash | 将检索到的片段 + 问题发给 DeepSeek，流式生成答案 |

**智谱负责"理解语义做匹配"**（Embedding），**DeepSeek 负责"理解和生成回答"**（Chat）。两者能力互补，DeepSeek 擅长对话但无 Embedding 能力，智谱恰好提供 Embedding API。

### Q6: 为什么 .env.example 只能用占位符，不能直接填 API Key？

**A**：`.env.example` 是**模板文件**，它的作用只是告诉使用者"这个项目需要配置哪些环境变量"。真正的 API Key 写在 `.env` 文件中（已添加你的智谱 Key）。

两者的区别：

| 文件 | 作用 | 是否提交到 Git |
|------|------|------|
| `.env` | 实际的配置（含真实 API Key） | ❌ 被 `.gitignore` 排除，不会提交 |
| `.env.example` | 模板/示例（占位符） | ✅ 提交到 Git，方便其他开发者参考 |

如果把真实 Key 写到 `.env.example` 并提交到 Git，任何能访问仓库的人都能看到你的 API Key，存在被盗用的风险。所以 `.env.example` 只用占位符，**真实的 Key 只写在 `.env` 里**。

**系统实际运行流程**：
1. 项目启动时 `dotenv.config()` 读取 `.env` 文件
2. `process.env.DEEPSEEK_API_KEY` 拿到 DeepSeek Key → 用于对话
3. `process.env.ZHIPU_API_KEY` 拿到智谱 Key → 用于向量化
4. 两个 Key 各自传给对应 API，完成鉴权

---

## 提出的问题

### Q1: 知识库明明存了3个文档，提问"知识库中有哪些文档"，只回答有2个文档

### Q2: 参考资料总是只有3条

### Q3: 这是模型没有训练的缘故吗？

### Q4: 后续如果想要增强知识库问答能力，需要怎么做？

---

## 根本原因分析

### 不是模型训练问题

LLM 本身是 capable 的，问题出在 **RAG 管线的参数配置和检索策略**，而非模型训练不足。

### 具体根因

| # | 原因 | 所在文件 | 说明 |
|---|------|---------|------|
| 1 | **`nResults: 3` 检索数量过少** | `packages/server/src/services/ragService.ts:92` | 每次检索仅从 ChromaDB 拉取 3 个 chunk。如果这 3 个 chunk 来自同一份文档，另外两份文档就完全不可见 |
| 2 | **纯向量相似度搜索无多样性机制** | `ragService.ts:90-94` | 默认使用余弦相似度，top-N 结果可能被某个文档的相似 chunk 霸榜 |
| 3 | **System Prompt 没有全局文档列表** | `ragService.ts:118-123` | LLM 只能从检索到的 chunk 推断文档信息，不知道知识库全貌 |
| 4 | **Embedding 模型不适合中文** | `packages/server/src/services/vectorStoreService.ts:33` | `all-MiniLM-L6-v2` 是 384 维纯英文模型，对中文文本的嵌入效果极差，导致中文搜索匹配不准确 |
| 5 | **没有对话历史** | `ragService.ts:134-140` | 每个问题孤立回答，无法多轮追问 |

---

## 优化方案总览

### Phase 1 — 立即修复（解决"只看2个文档"和"仅3条参考"）

| # | 优化项 | 文件 | 改动量 | 效果 |
|---|--------|------|--------|------|
| 1a | 增加 `nResults: 3` → `nResults: 15` | `ragService.ts:92` | 1 行 | 直接增加可看到的片段数量 |
| 1b | System Prompt 注入全局文档列表 | `ragService.ts` | ~15 行 | LLM 能精确回答"有哪些文档" |
| 1c | 元问题检测（关键词匹配） | `ragService.ts` | ~20 行 | 列举类问题的回答精确度 |

### Phase 2 — 中期改进（全面提升检索质量和问答能力）

| # | 优化项 | 文件 | 改动量 | 效果 |
|---|--------|------|--------|------|
| 2a | MMR (Maximum Marginal Relevance) 多样性检索 | `ragService.ts` | ~50 行 | 保证多文档覆盖，不同主题都有代表 |
| 2b | 对话历史支持 | `chatController.ts` + `ragService.ts` | ~30 行 | 支持追问和上下文关联 |
| 2c | 查询改写 (Query Rewriting) | `ragService.ts` | ~40 行 | 代词问题（"它讲了什么？"）也能准确检索 |
| 2d | 分块优化 (500→800, 50→150) | `vectorStoreService.ts` | 2 行 | 每个 chunk 包含更完整的语义 |
| 2e | 混合检索（向量 + BM25） | 新建 `hybridSearchService.ts` | ~80 行 | 向量+关键词互补，提升召回率 |

### Phase 3 — 长期架构升级

| # | 优化项 | 文件 | 说明 |
|---|--------|------|------|
| 3a | **替换 Embedding 模型** | `vectorStoreService.ts` | 将英文 MiniLM 换为多语言 bge-m3，**中文系统最关键的一步** |
| 3b | Cross-encoder 重排序 | 新建 `rerankerService.ts` | 两阶段检索：先快筛再精排 |
| 3c | 文档级路由 | 可选新建 | 知识库变大后先搜文档再搜段落 |
| 3d | Chunk 后处理 | `ragService.ts` | 去重 + 按文档分组 + 原文排序 |
| 3e | 评估体系 | 新建 `evaluation/` | 10-20 对 QA 测试集，LLM 自动评分 |
| 3f | 可观测性日志 | `ragService.ts` | 每次查询记录 chunk 分布、耗时、token 用量 |

---

## 推荐执行顺序

```
Step 1: 1a + 1b (增加 nResults + 文档列表)          → 30 分钟，解决最核心两个问题
Step 2: 1c (元问题检测)                               → 15 分钟，列举类问题更精确  
Step 3: 3a (替换 embedding 模型为 bge-m3)             → 1-2 小时，中文检索质的提升
Step 4: 2a (MMR 多样性检索)                           → 1 小时，多文档覆盖
Step 5: 2b + 2c (对话历史 + 查询改写)                 → 2 小时，多轮对话
Step 6: 2d + 2e (分块优化 + 混合检索)                 → 2 小时，召回率进一步提升
Step 7: 3e + 3f (评估 + 日志)                         → 1 小时，长期优化基础
Step 8: 3b + 3c (重排序 + 文档路由)                   → 3 小时，大规模稳定性
```

---

## 验证方式

1. 上传 3 个内容不同的文档（如 Python 介绍、JavaScript 介绍、数据库介绍）
2. 提问"知识库中有哪些文档？" — 应精确列出 3 个文档
3. 提问各文档内容相关问题 — 参考资料应覆盖多个文档，且数量 > 3 条
4. 连续追问测试多轮对话效果
5. 查看服务端日志确认检索到的 chunk 分布

---

## 关键文件索引

| 文件 | 作用 |
|------|------|
| `packages/server/src/services/ragService.ts` | RAG 核心管线：检索 + 生成 + 流式输出 |
| `packages/server/src/services/vectorStoreService.ts` | ChromaDB 操作、Embedding 加载、文本分块 |
| `packages/server/src/controllers/chatController.ts` | 聊天接口：参数提取、请求转发 |
| `packages/server/src/controllers/documentController.ts` | 文档上传、删除、列表 |
| `packages/server/src/types/index.ts` | 类型定义 |
| `packages/server/src/utils/downloadModel.ts` | 模型下载（已废弃，改用智谱 Embedding API） |

---

## Embedding 模型演进记录

| 阶段 | 方案 | 维度 | 说明 |
|------|------|------|------|
| 初始 | `all-MiniLM-L6-v2` (本地 ONNX) | 384d | 纯英文，中文检索效果极差 |
| 第一次改进 | `Xenova/bge-m3` (本地 ONNX) | 1024d | 需下载 2.2GB，依赖 Python+ModelScope，下载失败率高 |
| 第二次尝试 | DeepSeek Embedding API（`deepseek-embedding`） | 1024d | **DeepSeek 官方从未提供 Embedding API**，所有请求返回 404 |
| **当前方案** | **智谱 Embedding API（`embedding-2`）** | **1024d** | **中文友好，开箱即用，独立 API Key** |
