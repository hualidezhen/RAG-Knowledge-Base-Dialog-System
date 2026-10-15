# 🚀 RAG 知识库问答系统 — 从入门到精通完全指南

> **适用对象：** 前端开发者，想从零开始学习 RAG + AI Agent 开发
> **项目定位：** 一个完整的企业级 RAG 知识库问答系统，支持文档上传、混合检索、流式对话
> **技术栈：** TypeScript + Vue 3 + Express + ChromaDB + DeepSeek + ZhipuAI

---

## 📋 目录

- [一、项目概览](#一项目概览)
- [二、什么是 RAG？](#二什么是-rag)
- [三、技术栈总览](#三技术栈总览)
- [四、项目架构（从上到下）](#四项目架构从上到下)
- [五、目录结构详解](#五目录结构详解)
- [六、核心功能实现原理（逐模块）](#六核心功能实现原理逐模块)
  - [6.1 文档上传与解析](#61-文档上传与解析)
  - [6.2 文本分块 (Chunking)](#62-文本分块-chunking)
  - [6.3 Embedding 向量化](#63-embedding-向量化)
  - [6.4 向量存储 (ChromaDB)](#64-向量存储-chromadb)
  - [6.5 混合检索 (Hybrid Search)](#65-混合检索-hybrid-search)
  - [6.6 查询重写 (Query Rewriting)](#66-查询重写-query-rewriting)
  - [6.7 RAG 生成](#67-rag-生成)
  - [6.8 SSE 流式传输](#68-sse-流式传输)
  - [6.9 评估系统 (LLM-as-Judge)](#69-评估系统-llm-as-judge)
- [七、完整 API 端点清单](#七完整-api-端点清单)
- [八、功能清单（50 项）](#八功能清单50-项)
- [九、涉及知识点与学习资源](#九涉及知识点与学习资源)
  - [9.1 前端技术](#91-前端技术)
  - [9.2 后端技术](#92-后端技术)
  - [9.3 AI / 大模型技术](#93-ai--大模型技术)
  - [9.4 工程化与部署](#94-工程化与部署)
- [十、从零开始运行项目](#十从零开始运行项目)
- [十一、后续优化方向与改进计划](#十一后续优化方向与改进计划)
  - [11.1 短期优化（1-2 周）](#111-短期优化1-2-周)
  - [11.2 中期优化（1-2 个月）](#112-中期优化1-2-个月)
  - [11.3 长期演进（3-6 个月）](#113-长期演进3-6-个月)
- [十二、推荐学习路径](#十二推荐学习路径)

---

## 一、项目概览

### 1.1 这个项目是做什么的？

**一句话概括：** 上传文档 → 建立知识库 → 对知识库进行智能问答。

具体来说：
1. 用户可以上传 **PDF / Word / TXT** 格式的文档
2. 系统自动将文档**分块**、**向量化**存入向量数据库
3. 用户提问时，系统**检索**最相关的文档片段
4. 大语言模型**基于检索到的内容生成回答**，并标注引用来源

### 1.2 核心流程

```
用户上传文档
    ↓
文档解析 (PDF/Word/TXT → 纯文本)
    ↓
文本分块 (Chunking)
    ↓
向量化 (Embedding) ───────────┐
    ↓                          │
存入 ChromaDB 向量数据库        │  ← 知识库构建阶段
                                │
用户提问                        │
    ↓                          │
查询重写 (结合历史对话)          │
    ↓                          │
混合检索 ─── 向量检索 ────      │  ← 检索阶段
       │     + BM25 关键词      │
       ↓                       │
   RRF 融合排序                 │
       ↓                       │
   Cross-encoder 重排序         │
       ↓                       │
    LLM 生成回答 ←──────────────┘  ← 生成阶段
    ↓
SSE 流式返回给用户
```

---

## 二、什么是 RAG？

### 2.1 RAG 解决的问题

大语言模型（如 GPT、DeepSeek）有三大天然缺陷：

| 问题 | 说明 | RAG 解决方案 |
|------|------|-------------|
| **知识截止** | 模型训练数据有截止日期，不知道最新信息 | 实时检索外部知识库，补充最新信息 |
| **幻觉** | 模型会"编造"它不确定的内容 | 基于检索到的真实文档生成，大幅降低幻觉 |
| **领域知识缺失** | 通用模型不知道你的企业内部文档 | 上传企业文档到知识库，模型据此回答 |

### 2.2 RAG vs 微调 (Fine-tuning)

| 对比维度 | RAG | 微调 |
|---------|-----|------|
| 知识更新 | 换文档即可，立刻生效 | 需要重新训练，耗时耗钱 |
| 开发成本 | 低，无需训练 | 高，需要 GPU 和训练数据 |
| 准确性 | 高，基于原文检索 | 可能记住错误或遗忘 |
| 适用场景 | 问答、客服、知识库 | 风格模仿、特定输出格式 |

### 2.3 本项目 RAG Pipeline 架构图

```
[用户输入] → [Query Rewriting] 查询重写→ [Hybrid Retrieval] → [Context Augmentation] → [LLM Generation] → [SSE Stream]
      │                              │
      │  Vector Search (ChromaDB)    │  top-30
      │  BM25 Keyword Search         │  top-30
      │  └─ RRF Merge ───────────────┘
      │  └─ Cross-encoder Rerank ──── top-8
      │                        ↑ 核心：三阶段检索
```

---

## 三、技术栈总览

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| [Vue 3](https://cn.vuejs.org/) | ^3 | 前端框架 (Composition API) |
| [Vite](https://cn.vite.dev/) | ^6 | 构建工具 |
| [TypeScript](https://www.typescriptlang.org/zh/) | ^5 | 类型安全 |
| [Pinia](https://pinia.vuejs.org/zh/) | ^2 | 状态管理 |
| [Vue Router](https://router.vuejs.org/zh/) | ^4 | 路由 |
| [Element Plus](https://element-plus.org/zh-CN/) | ^2 | UI 组件库 |
| [Axios](https://axios-http.com/zh/) | - | HTTP 客户端 |
| [markdown-it](https://markdown-it.docschina.org/) | ^14 | Markdown 渲染 |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| [Express](https://express.nodejs.cn/) | ^4 | Node.js Web 框架 |
| [TypeScript](https://www.typescriptlang.org/zh/) | ^5 | 类型安全 |
| [@anthropic-ai/sdk](https://docs.anthropic.com/zh-CN/api) | - | DeepSeek LLM 调用 (Anthropic 兼容接口) |
| [ChromaDB](https://docs.trychroma.com/) | - | 向量数据库 |
| [LangChain.js](https://js.langchain.com/) | - | 文本分块工具 |
| [@xenova/transformers](https://huggingface.co/docs/transformers.js) | - | 本地 Cross-encoder 推理 |
| [natural](https://github.com/NaturalNode/natural) | - | NLP 工具 (BM25) → 项目中自实现 BM25 |

### AI 服务

| 服务 | 用途 | 官方文档 |
|------|------|---------|
| [DeepSeek API](https://platform.deepseek.com/) | 对话生成 LLM | [DeepSeek 文档](https://platform.deepseek.com/api-docs) |
| [智谱 AI (ZhipuAI)](https://open.bigmodel.cn/) | Embedding 向量化 | [智谱开放平台文档](https://open.bigmodel.cn/dev/api) |

### 部署

| 技术 | 用途 |
|------|------|
| [Docker](https://docs.docker.com/) | 容器化 |
| [Docker Compose](https://docs.docker.com/compose/) | 多容器编排 |
| [Nginx](https://nginx.org/) | 反向代理 + 静态文件服务 |

---

## 四、项目架构（从上到下）

### 4.1 三层架构

```
┌──────────────────────────────────────────────────────────────┐
│                   客户端 (Client)                              │
│       Vue 3 SPA · Element Plus · Nginx :80                    │
│       packages/client/                                        │
│       - 聊天界面 ← SSE 流式渲染                                │
│       - 文档管理面板 · 知识库切换                               │
│       - 监控看板 (延迟/Token/QPS)                              │
│       - 反馈评价 (AI 回复 1-5 星评分)                          │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTP / SSE
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   服务端 (Server)                              │
│       Express · TypeScript · Anthropic SDK                    │
│       packages/server/ :3001                                  │
│                                                              │
│   ┌─────────┐ ┌──────────┐ ┌─────────────────────────────┐   │
│   │ Routes  │→│Controllers│→│ Services  (核心业务逻辑)    │   │
│   └─────────┘ └──────────┘ │                              │   │
│                            │  RAG 引擎 · Agent 引擎       │   │
│                            │  Tool 系统 · 记忆管理         │   │
│                            │  滑动窗口 · 监控 · 反馈       │   │
│                            └──────────────┬───────────────┘   │
│                                           │                    │
│                           ┌───────────────┴───────────────┐   │
│                           │  AI API Calls                  │   │
│                           │  DeepSeek · ZhipuAI           │   │
│                           └───────────────────────────────┘   │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTP
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   向量数据库 (Vector DB)                        │
│       ChromaDB :8000                                          │
│       - 知识库 collections (文档向量)                          │
│       - memory_store (L3 语义记忆)                            │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 智能体架构总览（P1-P7）

项目从基础 RAG 升级为完整的智能体架构，新增 7 个能力模块：

```
┌─────────────────────────────────────────────────────────────┐
│                   用户交互层                                  │
│  Chat UI / Agent Chat / 监控看板 / 反馈面板                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  P2: 智能体编排引擎 (AgentService)                          │
│  ReAct 循环: Thought → Action(Tool) → Observation → ...    │
│  SSE 流式输出思考过程 + 工具调用 + 最终回答                   │
├─────────────────────────────────────────────────────────────┤
│  P1: Tool 系统 (ToolRegistry)                               │
│  retrieve_knowledge · list_documents                        │
│  get_document_content · chat_with_context                   │
├─────────────────────────────────────────────────────────────┤
│  P3: 记忆管理 (MemoryService)                               │
│  L1: 工作记忆(当前上下文)                                    │
│  L2: 对话摘要(JSON 文件, 每4轮生成)                         │
│  L3: 语义记忆(ChromaDB, 重要事实向量存储)                   │
├─────────────────────────────────────────────────────────────┤
│  P6: 滑动窗口 (ContextManager)                              │
│  maxHistoryTurns=6 · Token预算200000                          │
│  LLM 摘要生成 · 与 memoryService 集成                       │
├──────────────────────┬──────────────────────────────────────┤
│  P4: 监控 (Monitor) │  P5: 反馈 (Feedback)                 │
│  LLM/工具/检索指标   │  1-5星评分 + 评论 + 标签            │
│  7天聚合 · 实时状态  │  反馈统计 · 低分模式分析            │
├──────────────────────┴──────────────────────────────────────┤
│  P7: Agent 评估系统 (AgentEvaluator)                       │
│  8个Agent测试用例 · 6维度评分 · 执行轨迹追踪               │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 数据流 — RAG 问答

```
[用户提问] → POST /api/chat { message, history, collection }
    │
    ▼
ragService.ts
    ├── 1. 查询重写 (Rewrite) ─── 结合历史改写成独立查询
    ├── 2. 滑动窗口截断 (ContextManager)
    ├── 3. 混合检索 (Hybrid Search)
    │     ├── 向量检索 (ChromaDB top-30)
    │     ├── BM25 关键词检索 (top-30)
    │     ├── RRF 融合排序 → top-15
    │     └── Cross-encoder 重排序 → top-8
    ├── 4. 记忆检索 (MemoryService L3)
    ├── 5. 构建 System Prompt (上下文 + 记忆 + 摘要)
    ├── 6. 流式生成 (DeepSeek via SSE)
    └── 7. Checkpoint (写入L2+L3记忆)
```

### 4.4 数据流 — Agent 智能体

```
[用户提问] → POST /api/agent/chat { message, history, sessionId }
    │
    ▼
agentService.ts — ReAct 循环 (最多10次迭代)
    │
    ├── 1. 滑动窗口截断 (ContextManager)
    ├── 2. 记忆注入 (MemoryService L2)
    ├── 3. LLM 推理 → Thought + Action / Final Answer
    │      ├── Action → ToolRegistry.execute()
    │      │     ├── retrieve_knowledge — 检索知识库
    │      │     ├── list_documents — 列出文档
    │      │     ├── get_document_content — 获取文档内容
    │      │     └── chat_with_context — 上下文问答
    │      │     └── (失败 → 自动重试1次 → 降级)
    │      └── Observation → 继续推理
    ├── 4. 重复步骤 3 直到获得 Final Answer
    └── 5. SSE 流式推送 (agent_thinking / agent_tool_use / agent_observation / token)
```

---

## 五、目录结构详解

```
RAG-Knowledge-Base-Dialog-System/
│
├── CONTEXT.md                          # 项目现状文档（新手必读！）
├── log.md                              # 开发日志（踩坑记录）
├── 提示词详情和结果.md                   # 提示词工程实验记录
├── docker-compose.yml                  # Docker 编排（3 容器）
├── package.json                        # npm workspaces 根配置
│
├── packages/
│   ├── client/                         # ===== 前端项目 =====
│   │   ├── index.html                  #    SPA 入口 HTML
│   │   ├── vite.config.ts              #    Vite 配置（代理 /api→:3001）
│   │   ├── nginx.conf                  #    生产环境 Nginx 配置
│   │   ├── Dockerfile                  #    前端 Docker 构建
│   │   ├── src/
│   │   │   ├── main.ts                 #    应用入口（挂载 Pinia/Router/UI）
│   │   │   ├── App.vue                 #    根组件（双栏布局）
│   │   │   ├── api/                    #    API 请求层
│   │   │   │   ├── index.ts            #      Axios 实例 + 错误拦截
│   │   │   │   ├── chat.ts             #      SSE 流式聊天
│   │   │   │   ├── document.ts         #      文档 CRUD
│   │   │   │   ├── feedback.ts         #      反馈提交与统计
│   │   │   │   ├── knowledgeBase.ts    #      知识库 CRUD
│   │   │   │   └── monitor.ts          #      监控指标查询
│   │   │   ├── stores/                 #    Pinia 状态管理
│   │   │   │   ├── chat.ts             #      聊天状态 + SSE 解析
│   │   │   │   └── documents.ts        #      文档列表状态
│   │   │   ├── components/             #    Vue 组件
│   │   │   │   ├── ChatPanel.vue       #      聊天面板（核心交互）
│   │   │   │   ├── DocumentPanel.vue   #      文档面板（侧边栏）
│   │   │   │   ├── MiniMonitorPanel.vue #      迷你监控面板（实时指标）
│   │   │   │   └── UploadDialog.vue     #      上传弹窗
│   │   │   ├── router/index.ts         #    路由（单页面）
│   │   │   ├── views/
│   │   │   │   ├── Home.vue             #    主页面视图
│   │   │   │   └── MonitorDashboard.vue #    监控仪表盘视图
│   │   └── ...
│   │
│   └── server/                         # ===== 后端项目 =====
│       ├── .env                        #    环境变量（API Key）
│       ├── Dockerfile                  #    后端 Docker 构建
│       ├── src/
│       │   ├── index.ts                #    Express 入口
│       │   ├── types/index.ts          #    类型定义
│       │   ├── routes/                 #    路由层
│       │   │   ├── agent.ts            #      Agent 聊天路由
│       │   │   ├── chat.ts             #      POST /api/chat
│       │   │   ├── document.ts         #      文档 CRUD 路由
│       │   │   ├── evaluation.ts       #      在线评估路由
│       │   │   ├── feedback.ts         #      用户反馈路由
│       │   │   ├── knowledgeBase.ts    #      知识库 CRUD 路由
│       │   │   ├── monitor.ts          #      监控指标路由
│       │   │   └── session.ts          #      会话管理路由
│       │   ├── controllers/            #    控制器层
│       │   │   ├── agentController.ts  #      Agent 聊天控制
│       │   │   ├── chatController.ts   #      聊天控制
│       │   │   ├── documentController.ts #    文档控制
│       │   │   ├── evaluationController.ts # 在线评估控制
│       │   │   ├── feedbackController.ts #   用户反馈控制
│       │   │   ├── monitorController.ts #    监控指标控制
│       │   │   └── sessionController.ts #    会话管理控制
│       │   ├── services/               #    🔥 核心服务层
│       │   │   ├── ragService.ts       #      RAG 编排（核心！）
│       │   │   ├── vectorStoreService.ts #    ChromaDB + Embedding
│       │   │   ├── hybridSearchService.ts #  BM25 实现
│       │   │   ├── rerankerService.ts  #      Cross-encoder 重排序
│       │   │   ├── collectionService.ts #    知识库元数据管理
│       │   │   ├── toolRegistry.ts     #      P1: Tool 注册/执行引擎
│       │   │   ├── agentService.ts     #      P2: Agent ReAct 编排引擎
│       │   │   ├── memoryService.ts    #      P3: L2+L3 记忆管理
│       │   │   ├── monitorService.ts   #      P4: 指标采集
│       │   │   ├── metricsStore.ts     #      P4: 指标聚合存储
│       │   │   ├── feedbackService.ts  #      P5: 用户反馈
│       │   │   ├── evaluationService.ts #     P5: 在线评估
│       │   │   └── contextManager.ts   #      P6: 滑动窗口
│       │   ├── tools/                  #    P1: 工具实现
│       │   │   ├── retrieveKnowledge.ts
│       │   │   ├── listDocuments.ts
│       │   │   ├── getDocumentContent.ts
│       │   │   └── chatWithContext.ts
│       │   ├── evaluation/             #    评估系统
│       │   │   ├── testSet.ts          #      17+8 个测试用例
│       │   │   ├── evaluator.ts        #      RAG LLM-as-Judge 评估器
│       │   │   ├── agentEvaluator.ts   #      P7: Agent 专项评估
│       │   │   └── integrationTest.ts  #      P1-P7 集成测试
│       │   └── utils/
│       │       └── fileParser.ts       #    文件解析器
│       ├── docs/                       #    API 文档
│       │   ├── chat-module.md
│       │   └── document-module.md
│       ├── data/                       #    运行时数据
│       │   ├── collections.json        #      知识库元数据
│       │   ├── evaluation-report.md    #      评估报告
│       │   ├── uploads/                #      上传文件存储
│       │   └── chroma/                 #      ChromaDB 持久化数据
│       └── models_cache/               #    本地模型缓存
│           └── Xenova/all-MiniLM-L6-v2/ #    Cross-encoder 模型
```

---

## 六、核心功能实现原理（逐模块）

### 6.1 文档上传与解析

**涉及文件：**
- 前端: `UploadDialog.vue` + `api/document.ts`
- 后端: `routes/document.ts` + `controllers/documentController.ts` + `utils/fileParser.ts`

**实现原理：**

```
用户选择文件 (.pdf/.docx/.txt)
    ↓
Element Plus <el-upload> 组件 (支持拖拽)
    ↓
multipart/form-data POST → /api/documents/upload
    ↓
multer 中间件 (memoryStorage, 50MB 限制, 类型过滤)
    ↓
documentController.upload()
    ↓
fileParser.parseFile(buffer, fileName)
    ├── .pdf  → pdf-parse 库提取文本
    ├── .docx → mammoth.extractRawText 提取文本
    └── .txt  → UTF-8 解码
    ↓
    → 返回 ParsedDocument { fileName, fileType, content }
```

**关键知识点：**
- [multer](https://github.com/expressjs/multer) — Node.js 文件上传中间件
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) — PDF 文本提取
- [mammoth](https://github.com/mwilliamson/mammoth.js) — Word 文档解析
- FormData + multipart 上传

**核心代码片段** — 文件类型路由过滤 (`routes/document.ts`)：
```typescript
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.txt']
    const ext = getExtension(file.originalname)
    cb(null, allowed.includes(ext))
  },
})
```

---

### 6.2 文本分块 (Chunking)

**涉及文件：** `services/vectorStoreService.ts`

**实现原理：**

文档不能整篇喂给 LLM（上下文窗口有限），需要切分成小块。

```
整篇文档（可能几万字）
    ↓
RecursiveCharacterTextSplitter
    ├── chunkSize: 800 字符
    ├── chunkOverlap: 150 字符（重叠避免切断语义）
    └── 分隔符优先级: \n\n → \n → 空格 → 字符
    ↓
N 个文本块 (chunks)
```

**为什么 chunkSize=800, overlap=150？**
- 800 字符 ≈ 200-300 中文词，足够表达一个完整段落
- 150 字符重叠确保切分边界不丢失关键信息
- 太小则语义不完整，太大则检索精度下降

**关键知识点：**
- [LangChain Text Splitters](https://js.langchain.com/docs/how_to/#text-splitters)
- [文档分割策略详解](https://js.langchain.com/docs/concepts/text_splitters/)

**核心代码片段：**
```typescript
export function createTextSplitter() {
  return new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 150,
  })
}
```

---

### 6.3 Embedding 向量化

**涉及文件：** `services/vectorStoreService.ts`

**实现原理：**

"Embedding" 就是把文本变成一串数字（向量），让语义相似的文本在向量空间中距离更近。

```
"面试需要准备什么"  →  ZhipuAI embedding-2  →  [0.123, -0.456, 0.789, ...]  (1024维)
"如何准备面试"      →  ZhipuAI embedding-2  →  [0.119, -0.462, 0.781, ...]  (相近)
"今天天气真好"      →  ZhipuAI embedding-2  →  [-0.512, 0.234, -0.123, ...]  (不同)
```

**批处理优化：**
```typescript
const MAX_BATCH_ITEMS = 50   // 单次最多 50 个文本
const MAX_BATCH_CHARS = 15000 // 单次最多 15000 字符
```
- 自动动态分批，同时满足条数限制和字符数限制
- 输入清洗：去掉控制字符避免 API 报错

**关键知识点：**
- [智谱 AI Embedding API 文档](https://open.bigmodel.cn/dev/api/normal-model/embedding)
- [Text Embedding 概念](https://platform.deepseek.com/api-docs)
- 向量维度对检索精度和性能的影响

**核心代码片段 — 动态批处理：**
```typescript
async function createEmbedding(input: string | string[]): Promise<number[] | number[][]> {
  // 单条文本直接调用
  if (typeof input === 'string') return callEmbeddingAPI(sanitize(input))

  // 批量文本 → 动态分批
  const cleaned = input.map(sanitize)
  const allResults: number[][] = []
  let i = 0
  while (i < cleaned.length) {
    let batchEnd = i
    let charCount = 0
    while (batchEnd < cleaned.length &&
           batchEnd - i < MAX_BATCH_ITEMS &&
           charCount + cleaned[batchEnd].length < MAX_BATCH_CHARS) {
      charCount += cleaned[batchEnd].length
      batchEnd++
    }
    const batch = cleaned.slice(i, batchEnd)
    const batchEmbeddings = await callEmbeddingAPI(batch)
    allResults.push(...batchEmbeddings)
    i = batchEnd
  }
  return allResults
}
```

---

### 6.4 向量存储 (ChromaDB)

**涉及文件：** `services/vectorStoreService.ts`

**实现原理：**

ChromaDB 是一个轻量级向量数据库。它存储的是 "文本块 + 向量 + 元数据" 三元组。

**存储结构（一个 chunk 一条记录）：**

| 字段 | 值示例 | 说明 |
|------|--------|------|
| `id` | `面试经验.docx-1700000000000-chunk-0` | 唯一 ID |
| `embedding` | `[0.123, -0.456, ...]` (1024维) | 向量 |
| `document` | `"面试准备需要注意..."` | 原始文本 |
| `metadata.fileName` | `面试经验.docx` | 来源文件 |
| `metadata.fileType` | `docx` | 文件类型 |
| `metadata.uploadTime` | `2026-05-20T10:00:00.000Z` | 上传时间 |
| `metadata.chunkIndex` | `0` | 块索引 |
| `metadata.totalChunks` | `12` | 总分块数 |

**检索时：**
```typescript
await collection.query({
  queryEmbeddings: [vector],     // 用户的提问向量
  nResults: 30,                  // 返回 top-30
  include: [Documents, Metadatas, Distances],
})
// ChromaDB 用余弦相似度找到最近的 30 个文档块
```

**自动维度迁移：** 当切换 Embedding 模型时（如 512 维 → 1024 维），自动删除旧集合并重建。

**关键知识点：**
- [ChromaDB 官方文档](https://docs.trychroma.com/)
- [ChromaDB GitHub](https://github.com/chroma-core/chroma)
- 向量数据库 vs 传统数据库
- 余弦相似度 (Cosine Similarity)

---

### 6.5 混合检索 (Hybrid Search)

**涉及文件：** `services/ragService.ts` + `services/hybridSearchService.ts` + `services/rerankerService.ts`

**这是项目最核心、最精彩的部分！**

#### 为什么需要混合检索？

| 检索方式 | 优点 | 缺点 |
|---------|------|------|
| **纯向量检索** | 理解语义，同义词也能匹配 | 对精确关键词不敏感 |
| **纯 BM25** | 精确匹配关键词，TF-IDF 经典算法 | 不理解语义，"苹果"≠"水果" |

混合检索 = 两者结合，取长补短。

#### 三阶段检索流程：

```
用户查询: "面试需要准备什么"
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 第一阶段：向量检索 (ChromaDB)                                │
│ 查询 → Embedding → 向量 → ChromaDB.query(top-30)            │
│ 结果：语义相近的 30 个片段                                    │
├─────────────────────────────────────────────────────────────┤
│ 第二阶段：BM25 关键词检索                                    │
│ 查询 → tokenize → BM25.score() → top-30                     │
│ 结果：关键词匹配的 30 个片段                                  │
├─────────────────────────────────────────────────────────────┤
│ RRF 融合 (Reciprocal Rank Fusion)                           │
│ 对两个结果集做加权排名融合                                    │
│ Score(i) = 1/(k + rank_vector(i)) + 1/(k + rank_bm25(i))    │
│ k=60 是平滑参数                                              │
├─────────────────────────────────────────────────────────────┤
│ 第三阶段：Cross-encoder 重排序                               │
│ 取 RRF 融合后的 top-15                                      │
│ 用 cross-encoder 逐对评分 (query, chunk) → 精确分数          │
│ 返回 top-8                                                  │
└─────────────────────────────────────────────────────────────┘
```

#### BM25 原理详解

BM25 (Best Matching 25) 是搜索引擎经典算法，改进自 TF-IDF：

```
Score(D, Q) = Σ IDF(q) × TF(q, D) × (k₁ + 1) / [TF(q, D) + k₁ × (1 - b + b × |D| / avgDL)]

其中:
  - IDF(q)  = ln[(N - n(q) + 0.5) / (n(q) + 0.5) + 1]  // 稀有词权重更高
  - TF(q, D) = 词 q 在文档 D 中的出现频率
  - k₁ = 1.2 (词频饱和参数)
  - b = 0.75 (文档长度归一化参数)
  - |D| = 文档长度
  - avgDL = 平均文档长度
```

**CJK 分词策略：**
```typescript
function tokenize(text: string): string[] {
  // 对于中文：按字符切分（单字）
  // 对于英文：按空格/标点切分
  // 优点：不需要分词库，简单有效
  // 缺点：不如 jieba 等专业分词器
}
```

#### Cross-encoder 重排序

向量检索和 BM25 都是"双编码器"（query 和 doc 独立编码），效率高但精度有限。

Cross-encoder 把 query 和 doc 一起送入模型：
```
输入: [CLS] query [SEP] chunk [SEP]
输出: 相关性分数 (0~1)
模型: Xenova/ms-marco-MiniLM-L-6-v2 (ONNX 量化版)
```
优点：精度高；缺点：速度慢 → 所以只对 top-15 做重排序。

#### RRF 融合代码核心逻辑：

```typescript
// 给向量结果和 BM25 结果分别打分
for (const cand of vecCandidates) {
  rrfScores.set(idx, 1 / (60 + cand.rank + 1))
}
for (const cand of bm25Candidates) {
  if (existingIdx >= 0) {
    // 在两个结果集中都出现的 → 累加分数
    rrfScores.set(existingIdx, 
      (rrfScores.get(existingIdx) || 0) + 1 / (60 + cand.rank + 1))
  }
}
// 按 RRF 总分降序排列
merged.sort((a, b) => rrfScore(b) - rrfScore(a))
```

**关键知识点：**
- [TF-IDF 算法](https://zh.wikipedia.org/wiki/Tf-idf)
- [BM25 算法](https://en.wikipedia.org/wiki/Okapi_BM25)
- [Reciprocal Rank Fusion (RRF)](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
- [Cross-encoder](https://www.sbert.net/examples/applications/cross-encoder/README.html)
- [Transformers.js](https://huggingface.co/docs/transformers.js)

---

### 6.6 查询重写 (Query Rewriting)

**涉及文件：** `services/ragService.ts` — `rewriteQuery()` 方法

**为什么需要查询重写？**

在多轮对话中，用户的提问通常是简短的、依赖上下文的：

```
用户: "面试需要准备什么？"       ← 完整问题，可以直接检索
助手: "需要准备技术基础、项目经验..."
用户: "那算法呢？"              ← 省略问法，需要结合历史
```

如果不重写，直接检索"那算法呢"，什么都匹配不到。

**重写后：** `"那算法呢"` → `"面试算法需要准备什么内容"`

**实现方式 — 调 LLM 做改写：**
```typescript
private async rewriteQuery(question: string, history?: ChatMessage[]): Promise<string> {
  const recentHistory = (history ?? []).slice(-4)
  // 拼成提示词
  const prompt = `将以下对话历史和当前问题改写为一个独立的搜索查询...`
  
  const response = await client.messages.create({
    model: 'deepseek-v4-flash',
    max_tokens: 128,    // 只要简短的一句话
    temperature: 0,     // 确定性输出
    messages: [{ role: 'user', content: prompt }],
  })
  return rewritten || question  // 失败时回退到原始问题
}
```

**关键知识点：**
- [Prompt Engineering](https://platform.deepseek.com/api-docs)
- [Anthropic SDK 文档](https://docs.anthropic.com/zh-CN/api)

---

### 6.7 RAG 生成

**涉及文件：** `services/ragService.ts` — `streamAnswer()` 方法

**核心：构建系统提示词（System Prompt）**

这是 RAG 生成最关键的技术点 — 如何把检索到的内容组织成 LLM 能理解的上下文。

#### 带检索结果的提示词：

```
你是一个基于文档内容回答问题的助手。
请使用以下参考资料回答问题，如果资料中不包含答案，
请明确说"该问题不在知识库范围内"。

当前知识库中包含以下 3 个文档：
1. 面试经验总结.docx
2. 技术面试指南.docx
3. 算法题库.docx

参考资料：
[来源: 面试经验总结.docx (段落 2)]
面试准备首先要了解公司背景...

[来源: 技术面试指南.docx (段落 5)]
常见面试题包括：JavaScript 闭包、原型链...
```

#### 无检索结果的提示词（降级）：

```
你是一个智能助手，请根据你的知识回答用户的问题。
如果不知道答案，请如实说明。

当前知识库中的文档列表（仅供参考）：
1. 面试经验总结.docx
2. 技术面试指南.docx
```

#### 关键设计决策：

1. **文档清单注入**：让 LLM 知道"我知道你有哪些文档"，即使没检索到也能给出方向性提示
2. **"不在知识库则明确说明"**：强制 LLM 诚实，减少幻觉
3. **引用来源标注**：`[来源: 文件名 (段落 N)]` → 前端可展示溯源

**关键知识点：**
- [System Prompt 设计](https://docs.anthropic.com/zh-CN/docs/build-with-claude/prompt-engineering)
- [DeepSeek API 文档](https://platform.deepseek.com/api-docs)

---

### 6.8 SSE 流式传输

**涉及文件：**
- 前端: `stores/chat.ts` + `api/chat.ts` + `ChatPanel.vue`
- 后端: `services/ragService.ts`

**为什么需要 SSE 而不是普通 HTTP？**

LLM 生成回答需要时间（3-10 秒），如果等全部生成完再返回，用户体验很差。
SSE (Server-Sent Events) 可以让服务端**边生成边推送**，用户实时看到打字效果。

#### SSE 协议格式：

```
data: { "type": "heartbeat" }

data: { "type": "sources", "sources": [...] }

data: { "type": "token", "content": "基于" }

data: { "type": "token", "content": "您" }

data: { "type": "token", "content": "的文档" }

data: [DONE]
```

#### 后端 SSE 实现：

```typescript
// 1. 设置 SSE 响应头
res.setHeader('Content-Type', 'text/event-stream')
res.setHeader('Cache-Control', 'no-cache')
res.setHeader('Connection', 'keep-alive')
res.setHeader('X-Accel-Buffering', 'no')  // 禁用 Nginx 缓冲（重要！）

// 2. 发送心跳（确认连接存活）
res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)

// 3. 发送来源信息
res.write(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`)

// 4. 流式发送生成内容
stream.on('text', (text) => {
  res.write(`data: ${JSON.stringify({ type: 'token', content: text })}\n\n`)
})

// 5. 结束
stream.on('end', () => {
  res.write('data: [DONE]\n\n')
  res.end()
})
```

#### 前端 SSE 解析：

```typescript
async function chatStream(message, temperature, history, collection) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, temperature, history, collection }),
  })
  
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n\n')
    buffer = lines.pop() || ''
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') return
        
        const event = JSON.parse(data)
        switch (event.type) {
          case 'token':   // 追加内容到助手消息
          case 'sources': // 保存引用来源
          case 'error':   // 显示错误
          case 'heartbeat': // 保活信号，忽略
        }
      }
    }
  }
}
```

#### SSE vs WebSocket：

| 对比 | SSE | WebSocket |
|------|-----|-----------|
| 方向 | 服务端→客户端单向 | 双向 |
| 协议 | HTTP (简单) | 独立协议 (复杂) |
| 自动重连 | 原生支持 | 需要自己实现 |
| 适用场景 | 流式推送、通知 | 实时游戏、聊天 |

本项目中 SSE 是完美选择，因为只有服务端→客户端单向数据流。

**关键知识点：**
- [SSE (Server-Sent Events)](https://developer.mozilla.org/zh-CN/docs/Web/API/Server-sent_events)
- [Fetch API ReadableStream](https://developer.mozilla.org/zh-CN/docs/Web/API/ReadableStream)
- [Nginx SSE 配置](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering)

---

### 6.9 评估系统 (LLM-as-Judge)

**涉及文件：** `evaluation/testSet.ts` + `evaluation/evaluator.ts`

#### 为什么需要评估 RAG 系统？

RAG 系统复杂，涉及检索、重排序、生成等多个环节，人工测试费时费力。

**LLM-as-Judge** = 用大模型自动评判 RAG 生成质量。

#### 评估维度（1-5 分）：

| 维度 | 中文 | 评分标准 |
|------|------|---------|
| **Faithfulness** | 忠实度 | 回答是否忠实于检索到的文档内容，不编造 |
| **Relevance** | 相关度 | 回答是否直接针对用户问题 |
| **Completeness** | 完整度 | 回答是否覆盖了问题的所有重要方面 |

#### 17 个测试用例（4 类）：

```typescript
const testCases = [
  // 事实性问答 (5个) — 问文档中的具体内容
  { id: 'factual-1', question: '文档的主要内容是什么？', category: 'factual' },
  
  // 多文档综合 (4个) — 综合多个文档回答
  { id: 'multi-1', question: '比较不同文档中的观点', category: 'multi_document' },
  
  // 边界情况 (4个) — 测试系统鲁棒性
  { id: 'edge-1', question: '今天天气怎么样？', category: 'edge_case' },  // 不在知识库中
  { id: 'edge-2', question: '', category: 'edge_case' },                   // 空消息
  
  // 推理问题 (4个) — 需要推理的复杂问题
  { id: 'chain-1', question: '根据文档推断...', category: 'chained_reasoning' },
]
```

#### 评估流程：

```
for each test case:
  1. 调用 RAG pipeline 获取回答和检索结果
  2. 用 LLM-as-Judge 评分（忠实度/相关度/完整度）
  3. 记录结果

输出 Markdown 评估报告
```

**关键知识点：**
- [LLM-as-Judge 评估方法论](https://docs.anthropic.com/zh-CN/docs/build-with-claude/evaluations)
- RAG 评估的三大维度（忠实度/相关度/完整度）

---



### 6.10 P1: Tool 系统 -- 标准化工具封装

**涉及文件：** `services/toolRegistry.ts` + `tools/retrieveKnowledge.ts` + `tools/listDocuments.ts` + `tools/getDocumentContent.ts` + `tools/chatWithContext.ts`

#### 为什么需要 Tool 系统？

RAG 系统中，LLM 只能"回答"不能"行动"。Tool 系统将后端能力（检索、文档操作等）封装为标准接口，让 LLM 可以主动调用。

#### Tool 接口定义

```typescript
export interface Tool {
  name: string
  description: string
  parameters: ToolParameter[]
  execute(args: Record<string, any>): Promise<any>
}
```

#### 4 个内置工具

| 工具名称 | 功能 | 参数 | 底层服务 |
|----------|------|------|---------|
| `retrieve_knowledge` | 检索知识库相关文档片段 | query, topK?, collection? | `ragService.retrieveRelevantChunks()` |
| `list_documents` | 列出当前知识库的文档 | collection? | `vectorStoreService.listDocuments()` |
| `get_document_content` | 获取文档完整内容 | fileName | 读取 `data/uploads/` |
| `chat_with_context` | 基于上下文的问答 | messages, temperature? | `ragService.generateAnswerNonStreaming()` |

**关键知识点：**
- [ReAct 模式](https://react-lm.github.io/)
- [Function Calling 概念](https://platform.deepseek.com/api-docs)

---

### 6.11 P2: 智能体编排引擎 -- ReAct 推理循环

**涉及文件：** `services/agentService.ts` + `routes/agent.ts` + `controllers/agentController.ts`

#### 什么是 ReAct？

ReAct（Reasoning + Acting）让 LLM 交替进行"推理思考"和"工具调用"，形成完整的任务执行循环。

#### ReAct 循环流程

```
用户: "先列出我的文档，再检索关于面试的内容"

第 1 轮:
  Thought: 用户需要先查看文档列表，然后检索相关内容。
  Action: list_documents({})
  Observation: 知识库中有 3 个文档：面试经验.docx、算法指南.docx、项目总结.docx

第 2 轮:
  Thought: 找到了文档列表，现在需要检索关于"面试"的内容。
  Action: retrieve_knowledge({"query": "面试"})
  Observation: 检索到 5 个相关片段：[面试经验.docx] 面试准备首先要了解...

第 3 轮:
  Thought: 我已经获取了足够的文档信息，可以回答用户了。
  Final Answer: 您的知识库中有 3 个文档。关于"面试"的内容，主要提到...
```

#### SSE 流式事件

| 事件类型 | 说明 | 数据字段 |
|----------|------|---------|
| `agent_thinking` | 推送 LLM 的思考过程 | `{ type, content }` |
| `agent_tool_use` | 工具调用开始 | `{ type, tool, args }` |
| `agent_observation` | 工具返回结果 | `{ type, content }` |
| `token` | 最终回答的文本流 | `{ type, content }` |

#### 错误恢复策略

工具调用失败时自动重试 1 次，仍失败则跳过该步并告知 LLM。

**关键知识点：**
- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
- [Anthropic Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)

---

### 6.12 P3: 结构化记忆管理 -- 三级记忆架构

**涉及文件：** `services/memoryService.ts`

#### 三级记忆架构

| 层级 | 名称 | 存储方式 | 作用范围 | 更新频率 |
|------|------|---------|---------|---------|
| L1 | 工作记忆 | 内存(当前消息列表) | 当前对话 | 每次轮交互 |
| L2 | 对话摘要 | JSON 文件 (`data/memories/`) | 跨轮对话 | 每 4 轮对话 |
| L3 | 语义记忆 | ChromaDB (`memory_store` 集合) | 跨会话 | 事实级更新 |

#### L2 对话摘要

每 4 轮对话（8 条消息）后自动触发 LLM 摘要生成。摘要注入 System Prompt，让 LLM 在长对话中保持上下文连贯。

#### L3 语义记忆

重要事实用 Embedding 存入 ChromaDB 的 `memory_store` collection。在 RAG 检索时同时查询语义记忆，实现跨会话知识关联。

#### 会话管理 API

```typescript
createSession(name?): SessionMeta
getSession(id): SessionMeta | undefined
listSessions(): SessionMeta[]
deleteSession(id): boolean
```

**关键知识点：**
- [记忆系统架构](https://docs.anthropic.com/en/docs/build-with-claude/memory)

---

### 6.13 P4: 运行时监控系统

**涉及文件：** `services/monitorService.ts` + `services/metricsStore.ts` + `routes/monitor.ts`

#### 监控指标

| 指标 | 采集时机 | 数据点 |
|------|---------|--------|
| LLM 调用延迟 | 每次 `client.messages.create()` | 模型、输入Token、输出Token、耗时(ms) |
| 工具调用 | 每次 `ToolRegistry.execute()` | 工具名、参数、耗时、成功/失败 |
| 检索质量 | 每次 `retrieveRelevantChunks()` | 向量命中数、BM25命中数、rerank数、耗时 |

#### 聚合存储

按小时聚合（sum/avg/max/min/count），保留 7 天，`data/metrics/` 按天分文件。定时每 30 秒 flush 一次。

#### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/monitor/metrics?timeRange=1h|24h|7d` | 聚合指标 |
| GET | `/api/monitor/realtime` | 当前运行状态 |
| GET | `/api/monitor/logs?level=error&limit=50` | 最近错误日志 |

**关键知识点：**
- [OpenTelemetry 指标语义](https://opentelemetry.io/docs/concepts/signals/metrics/)

---

### 6.14 P5: 用户反馈与在线评估

**涉及文件：** `services/feedbackService.ts` + `routes/feedback.ts` + `services/evaluationService.ts`

#### 反馈流程

AI 回复后，用户可点击 👍/👎 按钮 → 1-5 星评分 + 可选评论 → 存入 `data/feedback/feedback.json` → 低分分析

#### 反馈 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/feedback` | 提交反馈 { messageId, rating(1-5), comment?, tags? } |
| GET | `/api/feedback/stats` | 反馈统计 |
| POST | `/api/feedback/analyze` | 触发低分模式分析 |

#### 在线评估

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/evaluation/run` | 后台运行测试集评估 |
| GET | `/api/evaluation/trend` | 最近 10 次评分趋势 |

---

### 6.15 P6: 对话历史滑动窗口与摘要管理

**涉及文件：** `services/contextManager.ts`

#### 为什么需要滑动窗口？

长时间对话中，完整历史消息会不断膨胀，超出 LLM 上下文窗口。

#### 窗口策略

```
对话 ≤ 6 条消息 → 全部发送
对话 > 6 条消息 → 保留最近 6 条 + LLM 摘要替换最早消息
```

#### Token 估算

```typescript
estimateTokens(text: string): number {
  // 中文: Math.ceil(chineseChars / 2)
  // 英文: Math.ceil(englishChars / 4)
}
```

| 文本 | 估算 Token |
|------|-----------|
| "你好世界" | 2 |
| "Hello World" | 3 |
| "Hello World 你好" | 5 |

#### 双重截断机制

1. **按消息数截断** (`applyWindow`): `maxHistoryTurns=6`，超出时摘要最早消息
2. **按 Token 预算截断** (`truncateByTokenBudget`): `MAX_TOKEN_BUDGET=2000`，超出时逐步移除最早消息

摘要注入 System Prompt 并与 `memoryService` 的 L2 记忆集成。

---

### 6.16 P7: Agent 评估系统升级

**涉及文件：** `evaluation/agentEvaluator.ts` + `evaluation/testSet.ts`

#### 新增评估维度

| 维度 | 中文 | 说明 | 范围 |
|------|------|------|------|
| Tool Correctness | 工具正确性 | 选择的工具和参数是否正确 | 1-5 |
| Task Completeness | 任务完整性 | Agent 是否完整执行了所有步骤 | 1-5 |
| Reasoning Quality | 推理质量 | Agent 的推理过程是否合理清晰 | 1-5 |

#### 8 个 Agent 测试用例

| ID | 类别 | 测试点 |
|----|------|--------|
| agent-multi-tool-1 | 多工具编排 | "先列出文档，再检索面试相关内容" |
| agent-multi-tool-2 | 多工具编排 | "获取文档内容，然后总结主要观点" |
| agent-reasoning-1 | 复杂推理 | "根据文档信息推断知识库关注领域" |
| agent-reasoning-2 | 多文档综合 | "综合所有文档内容给出分析报告" |
| agent-error-recovery-1 | 错误恢复 | "调用不存在的工具" |
| agent-error-recovery-2 | 参数错误 | "用不存在的参数调用工具" |
| agent-memory-1 | 跨轮记忆 | "根据对话回忆关键信息" |
| agent-memory-2 | 历史依赖 | "结合讨论给出深入分析" |

运行命令：
```bash
cd packages/server && npm run evaluate:agent
```

---



## 七、完整 API 端点清单

| 方法 | 路径 | 请求体/参数 | 响应 | 说明 |
|------|------|-------------|------|------|
| `GET` | `/api/health` | - | `{ status: 'ok' }` | 健康检查 |
| `POST` | `/api/chat` | `{ message, temperature?, history?, collection?, sessionId? }` | SSE 流 | RAG 流式聊天（核心接口） |
| `POST` | `/api/agent/chat` | `{ message, temperature?, history?, collection?, sessionId? }` | SSE 流 | Agent 智能体聊天（ReAct + 工具调用） |
| `POST` | `/api/documents/upload` | FormData: `files[]` + `collection?` | `{ message, documents[] }` | 上传文档 |
| `GET` | `/api/documents` | query: `collection?` | `{ documents[] }` | 文档列表 |
| `GET` | `/api/documents/:filename/content` | URL 参数 | `{ fileName, fileType, content }` | 文档内容 |
| `DELETE` | `/api/documents/:filename` | query: `collection?` | 200 | 删除文档 |
| `GET` | `/api/knowledge-bases` | - | `{ knowledgeBases[] }` | 知识库列表 |
| `POST` | `/api/knowledge-bases` | `{ name, description? }` | `{ knowledgeBase }` | 创建知识库 |
| `DELETE` | `/api/knowledge-bases/:name` | URL 参数 | 200 | 删除知识库 |
| `GET` | `/api/monitor/metrics` | query: `timeRange=1h\|24h\|7d`, `category?` | `{ metrics[] }` | 聚合指标（P4 监控） |
| `GET` | `/api/monitor/realtime` | - | `{ qps, avgLatencyMs, toolCallCount, errorCount }` | 实时状态 |
| `GET` | `/api/monitor/logs` | query: `level?`, `limit?` | `{ logs[] }` | 错误日志 |
| `POST` | `/api/feedback` | `{ messageId, rating(1-5), comment?, tags?, sessionId? }` | `{ feedbackEntry }` | 提交反馈（P5） |
| `GET` | `/api/feedback/stats` | - | `{ total, avgRating, distribution }` | 反馈统计 |
| `POST` | `/api/feedback/analyze` | - | `{ totalLowScore, patterns[] }` | 低分反馈分析 |
| `POST` | `/api/evaluation/run` | - | `{ success, reportPath }` | 运行测试集评估 |
| `GET` | `/api/evaluation/trend` | - | `{ trend[] }` | 最近 10 次评分趋势 |
| `POST` | `/api/sessions` | `{ sessionId?, title? }` | `{ session }` | 创建/恢复会话（P3 记忆） |
| `GET` | `/api/sessions` | - | `{ sessions[] }` | 会话列表 |
| `GET` | `/api/sessions/:id` | URL 参数 | `{ session }` | 获取会话详情 |
| `DELETE` | `/api/sessions/:id` | URL 参数 | 200 | 删除会话 |

---

## 八、功能清单（50 项）

### 文档管理 ✅

- [x] **多格式上传** — 支持 PDF / DOCX / TXT
- [x] **拖拽上传** — Element Plus el-upload 拖拽模式
- [x] **上传进度条** — 实时进度反馈（上限 99%）
- [x] **文档列表** — 展示文件名、块数、上传时间
- [x] **文档内容查看** — 原始文本预览
- [x] **文档删除** — 含确认对话框
- [x] **文件类型校验** — multer 中间件过滤非法文件
- [x] **文件大小限制** — 50MB 上限

### 知识库管理 ✅

- [x] **多知识库切换** — 下拉选择器切换
- [x] **创建知识库** — 自定义名称
- [x] **删除知识库** — 默认库不可删除保护
- [x] **知识库元数据持久化** — JSON 文件存储

### 检索系统 ✅

- [x] **向量检索** — ChromaDB 语义搜索 (top-30)
- [x] **BM25 关键词检索** — 自实现 (top-30)
- [x] **RRF 融合排序** — Reciprocal Rank Fusion
- [x] **Cross-encoder 重排序** — 本地 ONNX 模型 (top-15→top-8)
- [x] **文档多样性** — 轮询算法避免单文档刷屏
- [x] **优雅降级** — ChromaDB 不可用时走纯对话

### 问答系统 ✅

- [x] **查询重写** — 结合历史对话改写为用户独立查询
- [x] **流式 SSE 响应** — 实时打字效果
- [x] **Markdown 渲染** — markdown-it 库
- [x] **引用来源展示** — 可折叠面板显示来源文档
- [x] **多轮对话** — 发送历史消息给 LLM
- [x] **文档清单注入** — 系统提示词包含全部文档名
- [x] **超出知识库明确说明**
- [x] **错误重试机制**

### 对话管理 ✅

- [x] **会话保存** — localStorage 持久化
- [x] **会话加载** — 从 localStorage 恢复
- [x] **导出 Markdown** — 带来源引用的完整导出
- [x] **清空对话**
- [x] **建议问题** — 空状态 4 个引导问题
- [x] **骨架屏加载** — el-skeleton

### 配置与控制 ✅

- [x] **API Key 配置** — 前端可选输入，localStorage 持久化
- [x] **Temperature 控制** — 0-1 滑块，默认 0.3
- [x] **流式动画指示** — 脉动圆点

### 评估系统 ✅

- [x] **17 个 RAG 测试用例** — 4 类场景覆盖
- [x] **LLM-as-Judge 三维评分** — 忠实度/相关度/完整度
- [x] **Markdown 评估报告生成**
- [x] **在线评估 API** — POST /api/evaluation/run 触发评估

### 智能体系统（P1-P7） ✅

- [x] **P1: Tool 系统** — 4 个标准工具封装（检索/列表/内容/问答），自动记录执行时间
- [x] **P2: Agent 编排引擎** — ReAct 推理循环，SSE 流式输出思考过程，工具调用错误自动恢复
- [x] **P3: 三级记忆管理** — L1 工作记忆/L2 对话摘要/L3 语义记忆(ChromaDB)
- [x] **P4: 运行时监控** — LLM/工具/检索指标采集，7 天聚合，实时状态 API
- [x] **P5: 用户反馈** — 1-5 星评分 + 评论 + 低分分析，在线评估趋势追踪
- [x] **P6: 滑动窗口** — 6 轮上限 + Token 预算 2000 + LLM 摘要生成
- [x] **P7: Agent 评估** — 8 个 Agent 测试用例，6 维度评分（含工具正确性/任务完整性/推理质量）

### 部署 ✅

- [x] **Docker Compose 三容器编排**
- [x] **前端 Nginx + 后端 Express 分离部署**
- [x] **SSE 兼容 Nginx 代理**
- [x] **健康检查与容器依赖管理**

---

## 九、涉及知识点与学习资源

### 9.1 前端技术

| 知识点 | 重要性 | 说明 | 推荐学习资源 |
|--------|--------|------|-------------|
| **Vue 3 Composition API** | ⭐⭐⭐⭐⭐ | `script setup` + `ref`/`reactive`/`computed`/`watch` | [Vue 3 官方文档 (中文)](https://cn.vuejs.org/guide/introduction.html) · [Vue 3 组合式 API](https://cn.vuejs.org/api/composition-api-setup.html) |
| **Pinia 状态管理** | ⭐⭐⭐⭐ | 替代 Vuex 的轻量状态管理 | [Pinia 官方文档 (中文)](https://pinia.vuejs.org/zh/) |
| **Vue Router** | ⭐⭐⭐ | SPA 路由管理 | [Vue Router 文档 (中文)](https://router.vuejs.org/zh/) |
| **Element Plus** | ⭐⭐⭐⭐ | Vue 3 UI 组件库 | [Element Plus 文档 (中文)](https://element-plus.org/zh-CN/component/overview.html) |
| **Axios** | ⭐⭐⭐⭐ | HTTP 请求库 | [Axios 文档 (中文)](https://axios-http.com/zh/docs/intro) |
| **markdown-it** | ⭐⭐⭐ | Markdown → HTML 渲染 | [markdown-it 中文文档](https://markdown-it.docschina.org/) |
| **Vite** | ⭐⭐⭐⭐ | 前端构建工具 | [Vite 中文文档](https://cn.vite.dev/guide/) |
| **TypeScript** | ⭐⭐⭐⭐⭐ | 类型安全的 JavaScript | [TypeScript 中文文档](https://www.typescriptlang.org/zh/docs/) |
| **CSS 变量 (自定义属性)** | ⭐⭐⭐ | 主题系统 | [MDN CSS 变量](https://developer.mozilla.org/zh-CN/docs/Web/CSS/Using_CSS_custom_properties) |
| **响应式布局** | ⭐⭐⭐ | @media 断点适配 | [MDN 媒体查询](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_media_queries) |

### 9.2 后端技术

| 知识点 | 重要性 | 说明 | 推荐学习资源 |
|--------|--------|------|-------------|
| **Express.js** | ⭐⭐⭐⭐⭐ | Node.js Web 框架 | [Express 中文文档](https://express.nodejs.cn/) · [Express 路由](https://express.nodejs.cn/guide/routing.html) |
| **Node.js 文件系统** | ⭐⭐⭐ | fs 模块操作文件 | [Node.js fs 文档 (中文)](http://nodejs.cn/api/fs.html) |
| **multer 文件上传** | ⭐⭐⭐⭐ | multipart/form-data 处理 | [multer GitHub](https://github.com/expressjs/multer) |
| **中间件模式** | ⭐⭐⭐⭐ | Express 中间件链 | [Express 中间件](https://express.nodejs.cn/guide/using-middleware.html) |
| **TypeScript 类型系统** | ⭐⭐⭐⭐⭐ | 接口、泛型、类型守卫 | [TypeScript 进阶类型](https://www.typescriptlang.org/zh/docs/handbook/2/types-from-types.html) |
| **环境变量管理 (dotenv)** | ⭐⭐⭐ | .env 文件加载 | [dotenv npm](https://www.npmjs.com/package/dotenv) |

### 9.3 AI / 大模型技术

| 知识点 | 重要性 | 说明 | 推荐学习资源 |
|--------|--------|------|-------------|
| **RAG (检索增强生成)** | ⭐⭐⭐⭐⭐ | 项目的核心技术架构 | 📺 [李宏毅 RAG 教程](https://www.youtube.com/watch?v=0E7k2j1fdxI) · [LangChain RAG 概念](https://js.langchain.com/docs/concepts/rag/) |
| **Text Embedding** | ⭐⭐⭐⭐⭐ | 文本向量化技术 | [OpenAI Embedding 指南](https://platform.openai.com/docs/guides/embeddings) · [智谱 AI Embedding 文档](https://open.bigmodel.cn/dev/api/normal-model/embedding) |
| **ChromaDB 向量数据库** | ⭐⭐⭐⭐ | 向量存储与检索 | [ChromaDB 文档](https://docs.trychroma.com/) · 📺 [ChromaDB 教程](https://www.youtube.com/results?search_query=chromadb+tutorial) |
| **BM25 算法** | ⭐⭐⭐⭐ | 关键词检索算法 | [BM25 维基百科](https://en.wikipedia.org/wiki/Okapi_BM25) · [TF-IDF 讲解](https://zh.wikipedia.org/wiki/Tf-idf) |
| **RRF 融合排序** | ⭐⭐⭐⭐ | 多结果集融合 | [RRF 原始论文](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) |
| **Cross-encoder 重排序** | ⭐⭐⭐⭐ | 精确相关性评分 | [SBERT Cross-encoder](https://www.sbert.net/examples/applications/cross-encoder/README.html) |
| **Transformers.js** | ⭐⭐⭐ | 浏览器/Node.js 运行 Transformer 模型 | [Transformers.js 文档](https://huggingface.co/docs/transformers.js) |
| **LLM 流式生成** | ⭐⭐⭐⭐⭐ | 实时 token 生成 | [Anthropic SDK 流式](https://docs.anthropic.com/zh-CN/docs/sdk-overview#streaming) · [DeepSeek API](https://platform.deepseek.com/api-docs) |
| **SSE (Server-Sent Events)** | ⭐⭐⭐⭐ | 服务端推送 | [MDN SSE](https://developer.mozilla.org/zh-CN/docs/Web/API/Server-sent_events) · 📺 [SSE 教程](https://www.youtube.com/results?search_query=server+sent+events) |
| **Prompt Engineering** | ⭐⭐⭐⭐⭐ | 提示词工程 | [Anthropic 提示词工程指南 (中文)](https://docs.anthropic.com/zh-CN/docs/build-with-claude/prompt-engineering) · [DeepSeek Prompt 指南](https://platform.deepseek.com/api-docs) |
| **LLM-as-Judge** | ⭐⭐⭐⭐ | 自动评估 RAG 质量 | [Anthropic Evaluation 指南](https://docs.anthropic.com/zh-CN/docs/build-with-claude/evaluations) |

### 9.4 工程化与部署

| 知识点 | 重要性 | 说明 | 推荐学习资源 |
|--------|--------|------|-------------|
| **Docker** | ⭐⭐⭐⭐ | 容器化部署 | [Docker 中文文档](https://docs.docker.com/get-started/) · 📺 [Docker 入门教程](https://www.youtube.com/results?search_query=docker+入门教程) |
| **Docker Compose** | ⭐⭐⭐⭐ | 多容器编排 | [Docker Compose 文档](https://docs.docker.com/compose/) |
| **Nginx 反向代理** | ⭐⭐⭐⭐ | 静态文件服务 + API 代理 | [Nginx 文档](https://nginx.org/en/docs/) |
| **npm workspaces** | ⭐⭐⭐ | Monorepo 管理 | [npm Workspaces 文档](https://docs.npmjs.com/cli/v7/using-npm/workspaces) |
| **LangChain.js** | ⭐⭐⭐ | LLM 应用开发框架 | [LangChain.js 文档](https://js.langchain.com/docs/) |

### 📺 推荐视频教程合集

| 主题 | 推荐搜索关键词 | 推荐平台 |
|------|---------------|---------|
| RAG 入门到实战 | "RAG 检索增强生成 教程" | B站/YouTube |
| Vue 3 完全指南 | "Vue 3 Composition API 教程" | B站/YouTube |
| TypeScript 入门 | "TypeScript 从零开始 教程" | B站/YouTube |
| ChromaDB | "ChromaDB 向量数据库 教程" | B站/YouTube |
| Docker | "Docker 容器化 前端开发" | B站/YouTube |
| 大模型 API | "DeepSeek API 调用" | B站/YouTube |
| 提示词工程 | "Prompt Engineering 入门" | B站/YouTube |

---

## 十、从零开始运行项目

### 10.1 环境要求

- Node.js >= 18 (推荐 20)
- npm >= 8
- Docker + Docker Compose (可选，生产部署用)

### 10.2 获取 API Key

1. **DeepSeek API Key** → [platform.deepseek.com](https://platform.deepseek.com/) → 注册 → 创建 API Key
2. **智谱 AI API Key** → [open.bigmodel.cn](https://open.bigmodel.cn/) → 注册 → 创建 API Key

### 10.3 快速启动

```bash
# 1. 进入项目
cd RAG-Knowledge-Base-Dialog-System

# 2. 配置环境变量
cp packages/server/.env.example packages/server/.env
# 编辑 .env 填入你的 API Key
#
# 主要环境变量说明：
#   DEEPSEEK_API_KEY=sk-xxx                 # DeepSeek API 密钥（必填）
#   DEEPSEEK_ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic  # DeepSeek Anthropic 兼容接口地址
#   ZHIPU_API_KEY=xxx                       # 智谱 AI API 密钥（用于 Embedding）
#   MAX_TOKENS=200000                       # LLM 最大 Token 数（默认 200000）
#   PORT=3001                               # 后端服务端口（默认 3001）
#   CHROMA_URL=http://localhost:8000         # ChromaDB 地址（默认 localhost:8000）

# 3. 安装依赖
npm install                  # 根目录
cd packages/server && npm install && cd ../..
cd packages/client && npm install && cd ../..

# 4. 启动 ChromaDB（需要 Docker）
docker run -p 8000:8000 chromadb/chroma

# 5. 启动后端（新终端）
cd packages/server && npm run dev

# 6. 启动前端（新终端）
cd packages/client && npm run dev

# 7. 浏览器访问 http://localhost:5173
```

### 10.4 Docker Compose 部署

```bash
# 一键启动全部服务
docker-compose up --build

# 访问 http://localhost
```

---

## 十一、后续优化方向与改进计划

> ✅ **智能体架构升级（P1-P7）已完成：** Tool 系统、Agent 编排引擎、三级记忆管理、运行时监控、用户反馈、滑动窗口、Agent 评估升级均已实现。详见第六章 6.10-6.16 节。

### 11.1 短期优化（1-2 周）

#### 🎯 优化 1：添加文件加载状态提示

**现状：** 上传大文件时，前端没有任何加载提示，用户不知道正在处理

**改进：**
```typescript
// documentController.ts
res.json({ message: '文件上传成功', documents: uploadResults })
// → 改为先返回"处理中"状态，处理完成后通知

// 或者在前端增加 loading 状态
chatStore.uploading = true
await uploadDocuments(formData)
chatStore.uploading = false
```

**难度：** ⭐ 简单

---

#### 🎯 优化 2：添加检索结果置信度显示

**现状：** 用户看到引用来源，但不知道这个来源有多相关

**改进：** 在前端显示每个 chunk 的 relevance score

```typescript
// ragService.ts — 在 source event 中附带分数
res.write(JSON.stringify({
  type: 'sources',
  sources: chunks.map(c => ({
    ...c,
    relevanceScore: c.distance ? (1 - c.distance).toFixed(2) : null
  }))
}))
```

**难度：** ⭐ 简单

---

#### 🎯 优化 3：增加文档预览的格式支持

**现状：** 文档内容以纯文本 `<pre>` 展示

**改进：** 对 PDF 保持原始格式，对 Word 保留基本排版

**难度：** ⭐⭐ 中等

---

### 11.2 中期优化（1-2 个月）

#### 🚀 优化 4：添加用户认证系统

**现状：** 无用户系统，所有人都能看到同一知识库

**改进方案：**
```
添加 JWT 认证
用户注册/登录
知识库与用户绑定
权限管理
```

**涉及变更：**
- 新文件: `services/authService.ts`, `middleware/auth.ts`
- 新增依赖: `jsonwebtoken`, `bcrypt`
- 新增表: `users` (可用 SQLite 或直接 JSON 文件)

**难度：** ⭐⭐⭐

**对应提示词：**
```
请为 RAG 知识库问答系统添加用户认证系统。
要求：
1. 用户注册/登录接口 (JWT)
2. 认证中间件保护 /api/* 路由
3. 知识库与用户绑定（每个用户只能看到自己的知识库）
4. 前端登录/注册页面
5. API Key 改为绑定用户而非 localStorage
请使用 TypeScript + Express，参考现有项目的代码风格。
```

---

#### 🚀 优化 5：改进 BM25 分词器

**现状：** 中文按单字切分 → "人工智能" 被切成 "人" "工" "智" "能"

**改进方案：** 使用 jieba 分词或 @node-rs/jieba

```
"人工智能" → ["人工智能", "人工", "智能"]  (jieba)
"人工智能" → ["人", "工", "智", "能"]      (当前)
```

**难度：** ⭐⭐

**对应提示词：**
```
请优化 hybridSearchService.ts 中的 tokenize 函数，
引入 @node-rs/jieba 分词库改进中文分词效果。
要求：
1. 安装 @node-rs/jieba 依赖
2. 中文文本使用 jieba 分词而非单字切分
3. 英文保持原有空格/标点切分
4. 保持 BM25 索引构建流程不变
5. 性能测试对比新旧分词效果
```

---

#### 🚀 优化 6：添加流式传输的取消功能

**现状：** 用户发完消息后只能等待回答完成

**改进：** 添加"停止生成"按钮

```typescript
// 前端
chatStore.abortStream()  // 已有实现
// 只需在 ChatPanel.vue 中添加停止按钮
```

**难度：** ⭐

---

#### 🚀 优化 7：优化 Chunk 策略

**现状：** 所有文档用固定 800/150 分块

**改进方案：**
```
1. 根据文档类型智能分块
   - Markdown → 按标题分块
   - 代码 → 按函数/类分块
2. 语义分块 (Semantic Chunking)
   - 用 Embedding 检测语义边界
   - 自然段落分块
```

**难度：** ⭐⭐⭐

**对应提示词：**
```
请为项目添加高级文档分块策略。
要求：
1. Markdown 文档按标题层级 (# ## ###) 分块
2. 代码文件按函数/类定义分块
3. 实现 SemanticChunker：用 Embedding 检测句子间语义相似度，
   相似度低于阈值时切分
4. 保留现有 RecursiveCharacterTextSplitter 作为 fallback
5. 写测试用例验证分块效果
```

---

### 11.3 长期演进（3-6 个月）

#### 🌟 优化 8：支持更多文档格式

| 格式 | 处理方式 |
|------|---------|
| HTML | cheerio 提取文本 |
| Markdown | marked 解析 |
| 图片 (OCR) | Tesseract.js 文字识别 |
| 音频 (ASR) | Whisper API 语音转文字 |

**难度：** ⭐⭐⭐⭐

---

#### 🌟 优化 9：添加 MMR (最大边际相关性)

**现状：** 检索结果可能存在高度冗余

**MMR 算法：** 在相关性和多样性之间取得平衡
```typescript
// MMR = λ × Sim(q, d) - (1-λ) × max Sim(d, already_selected)
// λ 在 0~1 之间，控制多样性权重
```

**难度：** ⭐⭐⭐

**对应提示词：**
```
请在 ragService.ts 中的 retrieveRelevantChunks 方法中添加 MMR (最大边际相关性) 多样化处理。
要求：
1. 在 Cross-encoder 重排序之后应用 MMR
2. λ 参数设为 0.7（平衡相关性和多样性）
3. MMR 结果数设为 8
4. 保留现有的 diversifyByDocument 作为 fallback
```

---

#### ✅ 优化 10：对话历史管理（滑动窗口 + 摘要）— **已完成**

**现状：** 已实现滑动窗口 + LLM 摘要（P6）。详见 6.15 节。

**实现内容：** `services/contextManager.ts` — maxHistoryTurns=6, Token 预算 2000, 双重截断机制

---

#### 🌟 优化 11：多模态支持（图文检索）

**现状：** 只能检索文本

**改进：** 支持图片检索、表格检索

**难度：** ⭐⭐⭐⭐⭐

---

#### 🌟 优化 12：A/B 测试框架

**现状：** 无法对比不同配置的 RAG 效果

**改进方案：**
```
建立 A/B 测试框架：
- 可对比不同 Chunk 策略
- 可对比不同 Embedding 模型
- 可对比不同检索参数 (nResults, K1, B)
- 自动生成对比报告
```

**难度：** ⭐⭐⭐⭐

---

### 优化路线图总览

```
时间线
│
│                  已完成：智能体架构升级（P1-P7）
│   ├── P1: Tool 系统
│   ├── P2: Agent 编排引擎
│   ├── P3: 三级记忆管理
│   ├── P4: 运行时监控
│   ├── P5: 用户反馈系统
│   ├── P6: 滑动窗口与摘要
│   └── P7: Agent 评估升级
│
├── 第 1-2 周 (短期)
│   ├── 文件加载状态提示
│   ├── 检索置信度显示
│   └── 文档预览优化
│
├── 第 3-6 周 (中期)
│   ├── 用户认证系统
│   ├── BM25 分词改进
│   ├── 停止生成按钮
│   └── 智能分块策略
│
├── 第 7-12 周 (中后期)
│   ├── 更多文档格式
│   └── MMR 多样化
│
└── 第 13 周+ (长期)
    ├── 多模态支持
    └── A/B 测试框架
```

---

## 十二、推荐学习路径

### 如果你是前端开发者，想入门 AI Agent：

```
步骤 1：理解 RAG 概念
   → 阅读本指南第六、七、八章
   → 📺 看 RAG 入门视频
   → 运行项目体验

步骤 2：掌握核心知识点
   → 前端: Vue 3 Composition API + Pinia
   → 后端: Express + TypeScript
   → AI: Embedding + 向量检索

步骤 3：深入 RAG Pipeline
   → 重点阅读 ragService.ts (446行)
   → 理解每个服务的作用
   → 尝试修改参数观察效果

步骤 4：动手改进
   → 从 ⭐ 难度的优化开始
   → 逐步挑战 ⭐⭐⭐
   → 最终尝试新增功能模块

步骤 5：举一反三
   → 理解了这个项目，你就理解了 90% 的 RAG 系统
   → 可以在此基础上构建：
     - 企业知识库客服
     - 文档分析助手
     - 代码审查助手
     - 个人学习助手
```

### 学习路线图

```
第 1 周 ─── 理解 RAG 概念 + 运行项目
第 2 周 ─── 阅读源码 (重点: ragService.ts)
第 3 周 ─── 完成 1-2 个短期优化
第 4 周 ─── 学习 Embedding + ChromaDB 原理
第 5 周 ─── 深入混合检索算法
第 6 周 ─── 完成中期优化 + 写总结博客
```

---

> 💡 **最后的话：**
>
> 这个项目是一个绝佳的 RAG 学习资源 —— 它麻雀虽小五脏俱全，
> 覆盖了从文档解析、向量存储、混合检索到流式生成的全链路。
> 作为一个前端开发者，你完全可以驾驭这个项目，
> 因为整个项目都是用 TypeScript 写的，没有 Python！
>
> 记住：**先运行起来 → 理解流程 → 修改源码 → 增加功能**
> 按照这个路径，一个月内你就能成为 RAG 领域的熟手。

---

*文档生成日期: 2026-05-20*
