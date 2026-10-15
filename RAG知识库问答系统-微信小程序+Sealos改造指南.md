# 📱 RAG 知识库问答系统 — 微信小程序/App + Sealos Cloud 上手指南

> **适用对象：** 已理解项目原理，想将其改造为移动端并部署到 Sealos Cloud
> **核心思路：** 前端用 uni-app (一套代码 = 微信小程序 + App + H5)，后端改造兼容移动端，用 Sealos 云服务替代自建基础设施
> **前置知识：** 了解 Vue 3 和本项目架构

---

## 📋 目录

- [一、改造总览](#一改造总览)
- [二、技术选型为什么是 uni-app + Sealos？](#二技术选型为什么是-uni-app--sealos)
- [三、Sealos Cloud 介绍](#三sealos-cloud-介绍)
- [四、整体架构设计](#四整体架构设计)
- [五、后端改造计划](#五后端改造计划)
- [六、前端改造计划 (uni-app)](#六前端改造计划-uni-app)
- [七、移动端特有功能设计](#七移动端特有功能设计)
- [八、Sealos Cloud 部署步骤](#八sealos-cloud-部署步骤)
- [九、改造工作量评估](#九改造工作量评估)
- [十、开发阶段规划](#十开发阶段规划)
- [十一、功能清单对比](#十一功能清单对比)
- [十二、常见问题 FAQ](#十二常见问题-faq)

---

## 一、改造总览

### 1.1 一句话总结

> **把 Vue 3 前端 → uni-app（一套代码发三端），把部署从自建服务器 → Sealos Cloud（托管容器+数据库+存储），后端做适应性改造。**

### 1.2 改造前后对比

| 维度 | 当前（Web 版） | 改造后（小程序/App 版） |
|------|-------------|---------------------|
| **前端框架** | Vue 3 + Element Plus | uni-app (Vue 语法) |
| **UI 组件** | Element Plus (桌面端) | uView / Vant Weapp (移动端) |
| **支持平台** | Web 浏览器 | 微信小程序 + H5 + App (iOS/Android) |
| **后端框架** | Express + TypeScript | **不变**（接口兼容） |
| **流式传输** | SSE | SSE (H5) / WebSocket (小程序) |
| **用户认证** | 无 | 微信登录 + JWT |
| **文件存储** | 本地文件系统 | Sealos 对象存储 |
| **元数据存储** | JSON 文件 | PostgreSQL（Sealos 云数据库） |
| **向量数据库** | ChromaDB 容器 | ChromaDB 容器（Sealos 部署） |
| **部署平台** | 自建服务器 | Sealos Cloud |
| **HTTPS/域名** | 手动配置 | Sealos 自动管理 |

### 1.3 改造路线图

```
当前项目 (Vue3 + Express + ChromaDB + 自建服务器)
    │
    ├── 前端改造 ─── uni-app (一套代码)
    │                  ├── 微信小程序
    │                  ├── H5 (浏览器)
    │                  └── App (iOS/Android)
    │
    ├── 后端改造 ─── 保持 Express + TypeScript
    │                  ├── + 微信登录
    │                  ├── + WebSocket (替代 SSE)
    │                  ├── + 对象存储 (替换本地文件)
    │                  └── + PostgreSQL (替换 JSON 文件)
    │
    └── 部署平台 ─── Sealos Cloud
                       ├── App Launchpad (容器部署)
                       ├── Database (PostgreSQL)
                       ├── Object Storage (文件存储)
                       └── Domain (自动 HTTPS)
```

---

## 二、技术选型为什么是 uni-app + Sealos？

### 2.1 为什么选 uni-app 而不是其他？

| 方案 | 微信小程序 | App | H5 | 学习成本 | 推荐度 |
|------|-----------|-----|-----|---------|-------|
| **uni-app** (Vue) | ✅ | ✅ | ✅ | 低（你会 Vue） | ⭐⭐⭐⭐⭐ |
| Taro (React) | ✅ | ✅ | ✅ | 中（需学 React） | ⭐⭐⭐ |
| 原生小程序 | ✅ | ❌ | ❌ | 低 | ⭐⭐ |
| Flutter | ❌ | ✅ | ❌ | 高 | ⭐⭐ |
| React Native | ❌ | ✅ | ❌ | 中 | ⭐⭐ |

**选择 uni-app 的核心原因：**
- 你会 **Vue 3** → uni-app 也是 Vue 语法，零成本上手
- 一套代码 = **微信小程序 + H5 + Android/iOS App**
- 有成熟的 UI 库 [uView](https://uviewui.com/) 专门适配 uni-app
- 微信小程序生态最完善，用户最多
- H5 版本可以直接在浏览器中打开，方便测试

### 2.2 为什么选 Sealos Cloud 而不是其他云？

| 对比项 | Sealos Cloud | 阿里云 | 腾讯云 | 自建服务器 |
|-------|-------------|-------|-------|-----------|
| **部署复杂度** | ⭐ 极简（点几下就行） | ⭐⭐⭐ 中等 | ⭐⭐⭐ 中等 | ⭐⭐⭐⭐⭐ 复杂 |
| **K8s 管理** | 自动托管 | 手动管理 | 手动管理 | 全手动 |
| **数据库** | 内置托管（一键创建） | RDS（额外付费） | RDS（额外付费） | 自建 |
| **对象存储** | 内置 | OSS | COS | 无 |
| **域名+HTTPS** | 自动 | 手动 | 手动 | 手动 |
| **费用** | 按量计费 | 按量计费 | 按量计费 | 固定月付 |
| **适合人群** | 个人/小团队 | 企业 | 企业 | 运维能力强 |

> **Sealos 特别适合"开发出身、不想学运维"的人**

### 2.3 uni-app + Sealos = 全栈移动端最佳搭配

```
前端: 你会 Vue → uni-app 无缝迁移
后端: 你的 Express 代码不用变
数据库: Sealos 帮你托管 PostgreSQL
文件: Sealos 对象存储（兼容 S3 API）
部署: Sealos 一键部署容器，自动 HTTPS
```

---

## 三、Sealos Cloud 介绍

### 3.1 Sealos 是什么？

[Sealos Cloud](https://cloud.sealos.io/) 是一个以 Kubernetes 为核心的云操作系统，对开发者提供：

| 服务 | 用途 | 本项目用在哪 |
|------|------|-------------|
| **App Launchpad** | 部署 Docker 容器 | 部署后端 Express + ChromaDB |
| **Database** | 托管数据库 | PostgreSQL 存元数据 + 用户数据 |
| **Object Storage** | 对象存储（S3 兼容） | 存储上传的文件 |
| **Domain** | 域名 + 自动 HTTPS | 为 API 提供公网访问 |
| **Terminal** | 网页终端 | 管理你的服务器 |

### 3.2 注册与初始化

```bash
# 1. 打开 https://cloud.sealos.io/
# 2. 微信扫码注册（秒注册）
# 3. 进入 Dashboard

# 4. （可选）安装 Sealos CLI
curl -sfL https://raw.githubusercontent.com/labring/sealos/main/install.sh | sh -
```

> Sealos 提供**免费额度**，个人项目基本够用。具体以官网最新价格为准。

### 3.3 Sealos 在本项目中的角色

```
传统运维模式：                          Sealos 模式：
┌──────────────────────┐              ┌──────────────────────┐
│ 买服务器              │              │ App Launchpad        │
│ 装 Docker            │              │  一键部署容器         │
│ 配 Nginx             │              │  自动负载均衡         │
│ 申请 SSL             │              │  自动 HTTPS           │
│ 装 PostgreSQL        │              │                       │
│ 配置防火墙            │              │ Database              │
│ 写备份脚本            │              │  一键创建 PostgreSQL   │
│ ...（太多事）         │              │  自动备份             │
└──────────────────────┘              └──────────────────────┘
```

---

## 四、整体架构设计

### 4.1 架构图

```
┌──────────────────────────────────────────────────────────┐
│                    用户设备                                │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐      │
│  │ 微信小程序 │  │  App     │  │  H5 / 浏览器      │      │
│  │          │  │ (iOS/An) │  │                   │      │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘      │
└───────┼──────────────┼────────────────┼──────────────────┘
        │              │                │
        └──────────────┼────────────────┘
                       │ HTTPS
                       ▼
┌──────────────────────────────────────────────────────────┐
│                   Sealos Cloud                            │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ App Launchpad                                      │  │
│  │  ┌─────────────┐   ┌─────────────┐                │  │
│  │  │  Express API     │   │  ChromaDB         │        │  │
│  │  │  :3001            │   │  :8000            │        │  │
│  │  │  RAG + Agent +    │   │  向量数据库 +      │        │  │
│  │  │  监控 + 反馈 + 评估│   │  语义记忆(L3)     │        │  │
│  │  └──────┬──────┘   └──────┬──────┘                │  │
│  └─────────┼─────────────────┼────────────────────────┘  │
│            │                 │                            │
│  ┌─────────┴─────────┐  ┌───┴────────┐                  │
│  │ Database          │  │ Object     │                  │
│  │ PostgreSQL        │  │ Storage    │                  │
│  │ 用户/知识库/会话   │  │ 上传文件    │                  │
│  └───────────────────┘  └────────────┘                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Domain (自动 HTTPS)                                │  │
│  │ 你的项目.sealos.run 或 自定义域名                    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 4.2 数据流对比：Web vs 小程序

```
Web 版（当前）：
  用户上传文件 → 存本地磁盘 → 路径存 JSON 文件
  用户提问 → SSE 流式返回 → 前端直接显示

小程序版（改造后）：
  用户上传文件 → Sealos 对象存储（S3） → 文件 ID 存 PostgreSQL
  用户提问 → WebSocket 流式返回 → 前端显示
  用户登录 → 微信 OAuth → JWT Token → 后续请求带 Token
```

---

## 五、后端改造计划

### 5.1 改造清单

| 模块 | 改动内容 | 影响范围 | 难度 |
|------|---------|---------|------|
| 用户认证 | 新增微信登录 + JWT | 新服务 + 中间件 | ⭐⭐⭐ |
| 流式传输 | 新增 WebSocket（保留 SSE） | 新路由 + 新服务 | ⭐⭐ |
| 文件存储 | 本地 → 对象存储 (S3 API) | documentController | ⭐⭐ |
| 元数据存储 | JSON → PostgreSQL | collectionService + 新 | ⭐⭐⭐ |
| 权限中间件 | JWT 验证保护 API | 新中间件 | ⭐⭐ |
| **P1-P7 新 API** | Agent/监控/反馈/评估/会话端点需加 JWT 保护 | routes + controllers | ⭐⭐ |
| 需要保护的 API 路由清单 | |
| `POST /api/agent/chat` — Agent 智能体聊天 | |
| `GET /api/monitor/metrics` — 聚合指标 | |
| `GET /api/monitor/realtime` — 实时状态 | |
| `GET /api/monitor/logs` — 错误日志 | |
| `POST /api/feedback` — 提交反馈 | |
| `GET /api/feedback/stats` — 反馈统计 | |
| `POST /api/feedback/analyze` — 低分分析 | |
| `POST /api/evaluation/run` — 运行评估 | |
| `GET /api/evaluation/trend` — 评估趋势 | |
| `POST /api/sessions` — 创建/恢复会话 | |
| `GET /api/sessions` — 会话列表 | |
| `GET /api/sessions/:id` — 会话详情 | |
| `DELETE /api/sessions/:id` — 删除会话 | |

### 5.2 新增依赖

```json
{
  "dependencies": {
    "jsonwebtoken": "^9.0.0",        // JWT 签发与验证
    "ws": "^8.16.0",                 // WebSocket 服务端
    "@aws-sdk/client-s3": "^3.500.0", // Sealos 对象存储（S3 兼容）
    "pg": "^8.11.0",                 // PostgreSQL 驱动
    "axios": "^1.6.0"                // HTTP 请求（微信登录时用）
  }
}
```

### 5.3 新增文件结构

```
packages/server/src/
├── middleware/
│   └── auth.ts                  # JWT 验证中间件
├── services/
│   ├── authService.ts           # 微信登录 + JWT 签发
│   ├── storageService.ts        # 对象存储封装 (S3)
│   └── databaseService.ts       # PostgreSQL 封装
├── routes/
│   └── auth.ts                  # 登录路由
└── websocket/
    └── chatSocket.ts            # WebSocket 聊天处理器
```

### 5.4 关键改造详解

#### 5.4.1 微信登录 + JWT 认证

```typescript
// packages/server/src/services/authService.ts

import jwt from 'jsonwebtoken'
import axios from 'axios'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

interface WxLoginResult {
  openid: string
  session_key: string
  unionid?: string
}

/**
 * 微信小程序登录流程：
 * 1. 前端调用 wx.login() 获取 code
 * 2. 后端用 code 向微信服务器换取 openid
 * 3. 后端生成 JWT Token 返回给前端
 * 4. 前端后续请求在 Header 中携带 Token
 */
export async function wxLogin(code: string): Promise<{ token: string; openid: string }> {
  const APPID = process.env.WX_APPID
  const SECRET = process.env.WX_SECRET

  // 向微信服务器换取 openid
  const { data } = await axios.get<WxLoginResult>(
    'https://api.weixin.qq.com/sns/jscode2session',
    {
      params: {
        appid: APPID,
        secret: SECRET,
        js_code: code,
        grant_type: 'authorization_code',
      },
    }
  )

  if (!data.openid) {
    throw new Error('微信登录失败：' + JSON.stringify(data))
  }

  // 检查用户是否存在，不存在则创建
  const user = await findOrCreateUser(data.openid)

  // 生成 JWT Token（有效期 7 天）
  const token = jwt.sign(
    { userId: user.id, openid: data.openid },
    JWT_SECRET,
    { expiresIn: '7d' }
  )

  return { token, openid: data.openid }
}

// JWT 验证中间件
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' })
  }

  try {
    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ error: 'Token 无效或已过期' })
  }
}
```

**前端（uni-app）调用登录：**
```javascript
// uni-app 中获取 code
uni.login({
  provider: 'weixin',
  success: async (loginRes) => {
    // loginRes.code 是临时凭证
    const { data } = await uni.request({
      url: 'https://your-api.sealos.run/api/auth/wx-login',
      method: 'POST',
      data: { code: loginRes.code },
    })
    // 保存 Token 到本地
    uni.setStorageSync('token', data.token)
  }
})
```

#### 5.4.2 WebSocket 替代 SSE

**为什么需要 WebSocket？**

微信小程序的网络请求 API（`wx.request`）不支持 SSE 的 `ReadableStream` 读取方式。WebSocket 是双向通道，更适合小程序。

**后端 WebSocket 服务：**
```typescript
// packages/server/src/websocket/chatSocket.ts

import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage } from 'http'
import jwt from 'jsonwebtoken'
import { getRagService } from '../services/ragService'

export function setupChatWebSocket(wss: WebSocketServer) {
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    // 从 URL 参数中获取 Token（WebSocket 不支持自定义 Header）
    const url = new URL(req.url || '', 'http://localhost')
    const token = url.searchParams.get('token')

    // 验证 Token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret')
      ;(ws as any).userId = decoded.userId
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: '未授权' }))
      ws.close()
      return
    }

    console.log('WebSocket 客户端已连接')

    // 接收消息
    ws.on('message', async (raw) => {
      try {
        const { message, temperature, history, collection } = JSON.parse(raw.toString())
        const ragService = getRagService()

        // 定义一个假的 Response 对象来适配 ragService
        // 方式一：修改 ragService 使其支持 WebSocket（推荐）
        // 方式二：用 SSE 的 EventEmitter 转发到 WebSocket

        // 最简单的方式：用非流式接口（RAG 问答）
        const { answer, chunks } = await ragService.generateAnswerNonStreaming(message, {
          temperature,
          history,
          collection,
        })

        // 注：Agent 聊天同样需要 WebSocket 适配
        // 方式一：调用 agentService.streamChat() 并转发其 SSE 事件到 WebSocket
        // 方式二：调用 agentService.executeChat() 获取完整结果后一次性发送
        // 详见 agentService.ts 的 streamChat 方法（输出 agent_thinking/agent_tool_use 事件）

        ws.send(JSON.stringify({ type: 'sources', sources: chunks }))
        ws.send(JSON.stringify({ type: 'token', content: answer }))
        ws.send(JSON.stringify({ type: 'done' }))
      } catch (err: any) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }))
      }
    })

    ws.on('close', () => {
      console.log('WebSocket 客户端已断开')
    })
  })
}
```

**在 Express 中集成 WebSocket：**
```typescript
// packages/server/src/index.ts
import { WebSocketServer } from 'ws'
import { setupChatWebSocket } from './websocket/chatSocket'

// 创建 HTTP Server（而不是直接用 app.listen）
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

// 在同一个 HTTP Server 上挂载 WebSocket
const wss = new WebSocketServer({ server, path: '/ws/chat' })
setupChatWebSocket(wss)
```

**前端 uni-app 中使用 WebSocket：**
```javascript
// stores/chat.js (uni-app 版)
export function sendMessage(text) {
  const token = uni.getStorageSync('token')

  // 连接 WebSocket
  const socketTask = uni.connectSocket({
    url: `wss://your-api.sealos.run/ws/chat?token=${token}`,
    success: () => console.log('WebSocket 连接成功'),
  })

  uni.onSocketOpen(() => {
    // 发送消息
    uni.sendSocketMessage({
      data: JSON.stringify({
        message: text,
        temperature: 0.3,
        history: [],
        collection: 'rag_knowledge',
      }),
    })
  })

  uni.onSocketMessage((res) => {
    const event = JSON.parse(res.data)
    switch (event.type) {
      case 'sources':
        // 保存引用来源
        break
      case 'token':
        // 累加显示回答内容
        break
      case 'done':
        // 回答完成
        break
      case 'error':
        // 显示错误
        break
    }
  })
}
```

> **更优方案：** 修改 `ragService.retrieveRelevantChunks()` 和 `ragService.generateAnswerNonStreaming()`，让它们返回 EventEmitter 或 AsyncGenerator，这样 SSE 和 WebSocket 可以共用同一套业务逻辑。同时 `agentService.streamChat()` 也可用同样方式改造，使其 SSE 事件（agent_thinking/agent_tool_use/agent_observation）能通过 WebSocket 转发。

#### 5.4.3 文件存储：本地 → 对象存储 (S3)

```typescript
// packages/server/src/services/storageService.ts

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const s3Client = new S3Client({
  region: 'default',
  endpoint: process.env.S3_ENDPOINT,          // Sealos 对象存储地址
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
  forcePathStyle: true,                        // Sealos 需要
})

const BUCKET = process.env.S3_BUCKET || 'rag-documents'

/**
 * 上传文件到 Sealos 对象存储
 * 替换原来的 fs.writeFileSync()
 */
export async function uploadFile(
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const key = `uploads/${Date.now()}-${fileName}`

  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }))

  return key  // 返回文件 key，存入 PostgreSQL
}

/**
 * 通过 WebSocket 流式返回文件内容
 * 替换原来的 fs.readFileSync()
 */
export async function getFileContent(key: string): Promise<string> {
  const { Body } = await s3Client.send(new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }))

  return await Body!.transformToString('utf-8')
}

export async function deleteFile(key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }))
}
```

#### 5.4.4 元数据存储：JSON → PostgreSQL

```typescript
// packages/server/src/services/databaseService.ts

import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,  // Sealos 数据库连接字符串
})

// ─── 初始化表结构 ───
export async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      openid VARCHAR(255) UNIQUE NOT NULL,
      nickname VARCHAR(255),
      avatar_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS knowledge_bases (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      knowledge_base_id INTEGER REFERENCES knowledge_bases(id) ON DELETE CASCADE,
      file_name VARCHAR(255) NOT NULL,
      file_type VARCHAR(10) NOT NULL,
      file_key TEXT NOT NULL,          -- 对象存储中的 key
      chunk_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      knowledge_base_id INTEGER REFERENCES knowledge_bases(id),
      title VARCHAR(255),
      messages JSONB DEFAULT '[]',     -- 全部消息存 JSON
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `)
}

// ─── 替换 collectionService.ts ───
export async function createKnowledgeBase(userId: number, name: string, description?: string) {
  const { rows } = await pool.query(
    `INSERT INTO knowledge_bases (user_id, name, description) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, name) DO NOTHING RETURNING *`,
    [userId, name, description || '']
  )
  return rows[0]
}

export async function listKnowledgeBases(userId: number) {
  const { rows } = await pool.query(
    'SELECT * FROM knowledge_bases WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  )
  return rows
}
```

### 5.5 后端 .env 新增配置

```bash
# ─── 新增环境变量 ───

# 微信小程序
WX_APPID=wx你的小程序AppId
WX_SECRET=你的小程序AppSecret

# JWT
JWT_SECRET=一个随机的长字符串

# Sealos 对象存储 (S3 兼容)
S3_ENDPOINT=https://对象存储地址.sealos.run
S3_ACCESS_KEY=你的AccessKey
S3_SECRET_KEY=你的SecretKey
S3_BUCKET=rag-documents

# Sealos PostgreSQL
POSTGRES_URL=postgres://user:password@host:5432/rag_system
```

---

## 六、前端改造计划 (uni-app)

### 6.1 uni-app 项目结构

```bash
packages/miniapp/                     # 新建 uni-app 项目
├── App.vue                           # 应用入口（类似 main.ts）
├── main.js                           # 挂载全局插件
├── pages.json                        # 路由配置（类似 router/index.ts）
├── manifest.json                     # 小程序/App 配置
├── uni.scss                          # 全局样式变量
│
├── pages/                            # 页面
│   ├── index/
│   │   └── index.vue                 # 首页（聊天界面）
│   ├── login/
│   │   └── login.vue                 # 微信登录页
│   └── document/
│       ├── list.vue                  # 文档列表
│       └── upload.vue                # 文档上传
│
├── components/                       # 可复用组件
│   ├── chat-message.vue              # 消息气泡组件
│   ├── document-card.vue             # 文档卡片
│   └── sources-panel.vue             # 引用来源面板
│
├── api/                              # API 请求封装
│   ├── request.ts                    # 封装 uni.request（带 Token）
│   ├── chat.ts                       # WebSocket 聊天
│   ├── document.ts                   # 文档 API
│   └── knowledgeBase.ts             # 知识库 API
│
└── store/                            # 状态管理（Vuex / Pinia）
    ├── chat.js
    └── document.js
```

### 6.2 从 Vue 3 迁移到 uni-app 的对应关系

| Vue 3 (Web 版) | uni-app (小程序版) | 说明 |
|----------------|-------------------|------|
| `axios` | `uni.request()` | 网络请求 |
| `el-input` | `u-input` / `van-field` | 输入框 |
| `el-button` | `u-button` / `van-button` | 按钮 |
| `el-table` | `u-table` / 原生 list | 表格 → 列表 |
| `el-upload` | `uni.chooseImage()` / `uni.uploadFile()` | 上传 |
| `el-dialog` | `uni.showModal()` / 自定义弹窗 | 对话框 |
| `el-message` | `uni.showToast()` | 提示消息 |
| `el-select` | `u-select` / `picker` | 下拉选择 |
| `el-scrollbar` | `scroll-view` | 滚动容器 |
| `markdown-it` | `mp-html` / `u-parse` | Markdown 渲染 |
| `localStorage` | `uni.getStorageSync()` / `uni.setStorageSync()` | 本地存储 |
| `Vue Router` | `pages.json` | 路由配置 |
| `Pinia` | `Vuex` 或仍用 `Pinia`（uni-app 2.0+ 支持） | 状态管理 |

### 6.3 核心页面改造要点

#### 页面一：聊天首页（pages/index/index.vue）

```vue
<template>
  <view class="chat-container">
    <!-- 头部 -->
    <u-navbar title="知识库助手">
      <view slot="right" @click="showSidebar"><u-icon name="list"></u-icon></view>
    </u-navbar>

    <!-- 消息列表 -->
    <scroll-view class="message-list" scroll-y :scroll-into-view="scrollTo">
      <view v-for="(msg, i) in messages" :key="i" :id="'msg-'+i">
        <!-- 用户消息：右对齐蓝色气泡 -->
        <view v-if="msg.role === 'user'" class="msg-row user-row">
          <view class="msg-bubble user-bubble">{{ msg.content }}</view>
          <image class="avatar" src="/static/user-avatar.png"></image>
        </view>

        <!-- 助手消息：左对齐白色气泡 -->
        <view v-else class="msg-row assistant-row">
          <image class="avatar" src="/static/bot-avatar.png"></image>
          <view class="msg-bubble assistant-bubble">
            <!-- Markdown 渲染 -->
            <u-parse :html="renderMarkdown(msg.content)"></u-parse>
            <!-- 引用来源（可折叠） -->
            <view v-if="msg.sources" @click="msg.showSources = !msg.showSources">
              查看来源 ({{ msg.sources.length }})
            </view>
            <view v-if="msg.showSources">
              <view v-for="(src, j) in msg.sources" :key="j">
                📄 {{ src.fileName }} (段落 {{ src.chunkIndex + 1 }})
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 流式加载指示 -->
      <view v-if="streaming" class="streaming-indicator">
        <u-loading-icon mode="circle"></u-loading-icon>
        <text>正在生成回答...</text>
      </view>
    </scroll-view>

    <!-- 底部输入区 -->
    <view class="input-area">
      <u-input v-model="inputText" type="text" placeholder="输入您的问题..."
        :disabled="streaming" :border="true" @confirm="sendMessage">
      </u-input>
      <u-button type="primary" :disabled="!inputText.trim() || streaming"
        @click="sendMessage">发送</u-button>
    </view>
  </view>
</template>

<script>
import { renderMarkdown } from '@/utils/markdown'

export default {
  data() {
    return {
      messages: [],
      inputText: '',
      streaming: false,
      scrollTo: '',
    }
  },
  methods: {
    sendMessage() {
      if (!this.inputText.trim() || this.streaming) return
      // 同 Web 版一样的 SSE/WebSocket 调用
      // ... 调用 uni.connectSocket / uni.request
    },
    renderMarkdown,  // 使用 markdown-it 渲染
  },
}
</script>

<style>
.chat-container { height: 100vh; display: flex; flex-direction: column; }
.message-list { flex: 1; padding: 20rpx; }
.msg-row { display: flex; margin-bottom: 30rpx; }
.user-row { justify-content: flex-end; }
.assistant-row { justify-content: flex-start; }
.msg-bubble { max-width: 70%; padding: 20rpx 30rpx; border-radius: 16rpx; }
.user-bubble { background: #409EFF; color: #fff; }
.assistant-bubble { background: #f0f0f0; color: #333; }
.avatar { width: 60rpx; height: 60rpx; border-radius: 50%; margin: 0 16rpx; }
.input-area { display: flex; padding: 20rpx; border-top: 1px solid #eee; }
.input-area u-input { flex: 1; margin-right: 16rpx; }
</style>
```

#### 页面二：文档列表 + 上传（pages/document/）

```vue
<template>
  <view class="document-page">
    <u-navbar title="文档管理">
      <view slot="right" @click="showUpload = true">
        <u-icon name="plus"></u-icon>
      </view>
    </u-navbar>

    <!-- 知识库切换 -->
    <u-cell-group>
      <u-cell-item title="当前知识库" :value="currentKB.name"
        @click="showKBSwitcher = true"></u-cell-item>
    </u-cell-group>

    <!-- 文档列表 -->
    <view v-if="documents.length === 0" class="empty-state">
      <u-empty text="还没有文档，点击右上角上传" mode="list"></u-empty>
    </view>

    <view v-for="doc in documents" :key="doc.fileName" class="doc-card">
      <view class="doc-info">
        <u-icon name="file-text" size="40"></u-icon>
        <view class="doc-text">
          <text class="doc-name">{{ doc.fileName }}</text>
          <text class="doc-meta">{{ doc.chunkCount }} 个片段 · {{ doc.uploadTime }}</text>
        </view>
      </view>
      <view class="doc-actions">
        <u-icon name="eye" @click="viewContent(doc)"></u-icon>
        <u-icon name="trash" @click="deleteDoc(doc)"></u-icon>
      </view>
    </view>

    <!-- 上传弹窗 -->
    <u-popup :show="showUpload" @close="showUpload = false">
      <view class="upload-panel">
        <u-upload :action="uploadUrl" :auto-upload="true" :max-count="5"
          :accept="['pdf', 'docx', 'txt']" @success="onUploadSuccess">
        </u-upload>
      </view>
    </u-popup>
  </view>
</template>

<script>
export default {
  data() {
    return {
      documents: [],
      currentKB: { name: '默认知识库' },
      showUpload: false,
      showKBSwitcher: false,
      uploadUrl: 'https://your-api.sealos.run/api/documents/upload',
    }
  },
  methods: {
    onUploadSuccess(res) {
      // 上传成功，刷新列表
      uni.showToast({ title: '上传成功' })
    },
    async deleteDoc(doc) {
      const confirm = await uni.showModal({
        title: '确认删除',
        content: `删除 ${doc.fileName}？`,
      })
      if (!confirm) return
      // 调用删除 API
    },
  },
}
</script>
```

### 6.4 uni-app 项目创建命令

```bash
# 方式一：通过 HBuilderX 可视化创建（最简单）
# 下载 HBuilderX → 新建项目 → uni-app → 默认模板

# 方式二：命令行创建
npx degit dcloudio/uni-preset-vue#vite-ts packages/miniapp
cd packages/miniapp
npm install

# 安装 UI 库（uView）
npm install uview-plus
# 或使用 Vant Weapp（仅微信小程序）
npm install @vant/weapp
```

### 6.5 小程序配置文件要点

```json
// packages/miniapp/manifest.json (微信小程序特有配置)
{
  "appid": "wx你的小程序AppId",              // 微信小程序 AppId
  "setting": {
    "urlCheck": false                        // 开发时关闭域名校验
  }
}

// packages/miniapp/pages.json (路由配置)
{
  "pages": [
    {"path": "pages/index/index", "style": {"navigationBarTitleText": "知识库助手"}},
    {"path": "pages/login/login", "style": {"navigationBarTitleText": "登录"}},
    {"path": "pages/document/list", "style": {"navigationBarTitleText": "文档管理"}},
    {"path": "pages/document/upload", "style": {"navigationBarTitleText": "上传文档"}}
  ],
  "globalStyle": {
    "navigationBarTextStyle": "black",
    "navigationBarTitleText": "RAG 知识库",
    "navigationBarBackgroundColor": "#F8F8F8",
    "backgroundColor": "#F8F8F8"
  },
  "tabBar": {                               // 底部 Tab 导航
    "list": [
      {"pagePath": "pages/index/index", "text": "问答", "iconPath": "static/chat.png"},
      {"pagePath": "pages/document/list", "text": "文档", "iconPath": "static/doc.png"}
    ]
  }
}
```

---

## 七、移动端特有功能设计

### 7.1 微信登录流程

```
用户打开小程序
    ↓
uni.login() 获取 code
    ↓
wx.request() → POST /api/auth/wx-login { code }
    ↓
后端用 APPID + SECRET + code → 微信服务器 → 获取 openid
    ↓
后端创建/查找用户 → 生成 JWT Token → 返回给前端
    ↓
前端存 Token 到 Storage
    ↓
后续请求 Header: Authorization: Bearer <token>
```

### 7.2 语音输入（App 特有功能）

```javascript
// 使用 uni-app 的录音 API
uni.startRecord({
  success: async (res) => {
    // 上传录音文件
    const { data } = await uni.uploadFile({
      url: 'https://your-api.sealos.run/api/speech-to-text',
      filePath: res.tempFilePath,
      name: 'audio',
    })
    // 识别结果填入输入框
    this.inputText = data.text
  }
})
```

### 7.3 文件预览

```javascript
// 微信小程序预览文件
wx.downloadFile({
  url: 'https://your-api.sealos.run/api/documents/file-key/content',
  success: (res) => {
    // 打开文件预览
    wx.openDocument({
      filePath: res.tempFilePath,
      fileType: 'pdf',  // 或 docx, txt
    })
  }
})
```

### 7.4 订阅消息通知

当 LLM 回答完成时，可以通过微信订阅消息通知用户（适用于耗时长的问题）：

```javascript
// 请求订阅
wx.requestSubscribeMessage({
  tmplIds: ['模板ID'],
  success: (res) => {
    // 用户同意后，后端可以通过微信推送消息
  }
})
```

### 7.5 移动端适配要点

| 适配点 | Web 版 | 小程序版 |
|-------|--------|---------|
| **单位** | `px` | `rpx` (750 宽设计稿) |
| **安全区域** | 无 | `safe-area-inset-bottom` (iPhone X 刘海) |
| **下拉刷新** | 无 | `enablePullDownRefresh` |
| **上拉加载** | 无 | `onReachBottom` |
| **触屏事件** | `click` | `tap` (300ms 延迟) |
| **图片上传** | `<el-upload>` | `uni.chooseImage()` |
| **网络状态** | 无 | `uni.getNetworkType()` (断网提示) |

---

## 八、Sealos Cloud 部署步骤

### 8.1 部署概览

在 Sealos 上，我们部署 3 个服务：

| 服务 | 部署方式 | 说明 |
|------|---------|------|
| **后端 API (Express)** | App Launchpad | 主后端服务，:3001 |
| **ChromaDB** | App Launchpad | 向量数据库，:8000 |
| **PostgreSQL** | Database 服务 | 用户/知识库/会话数据 |
| **对象存储** | Object Storage | 上传文件存储 |

### 8.2 详细部署步骤

#### Step 1：创建 PostgreSQL 数据库

```
1. 打开 Sealos Dashboard → Database
2. 点击 "创建数据库"
3. 选择 PostgreSQL，版本 16
4. 设置：
   - 名称: rag-postgres
   - 规格: 1C1G（够用就行）
   - 存储: 1GB （先小后大）
5. 点击部署
6. 部署完成后，点击 "连接" → 复制连接字符串
   格式: postgres://postgres:密码@主机:端口/postgres
7. 把这个连接字符串保存到 .env 的 POSTGRES_URL
```

#### Step 2：创建对象存储桶

```
1. Sealos Dashboard → Object Storage
2. 点击 "创建存储桶"
3. 名称: rag-documents
4. 地域: 默认
5. 创建完成后 → 点击 "API 密钥" → 创建 AccessKey
6. 保存以下信息到 .env：
   - S3_ENDPOINT = 对象存储的 Endpoint 地址
   - S3_ACCESS_KEY = 你的 AccessKey
   - S3_SECRET_KEY = 你的 SecretKey
   - S3_BUCKET = rag-documents
```

#### Step 3：创建 ChromaDB 实例

```
1. Sealos Dashboard → App Launchpad
2. 点击 "创建应用"
3. 配置：
   - 名称: rag-chromadb
   - 镜像: chromadb/chroma:latest
   - 端口: 8000
   - CPU: 1C, 内存: 1G
   - 存储: 挂载 /chroma/chroma → 5GB (持久化向量数据)
   - 环境变量:
     IS_PERSISTENT=TRUE
     ANONYMIZED_TELEMETRY=FALSE
4. 点击部署
5. 部署后获得内部域名: rag-chromadb.namespace:8000
```

#### Step 4：构建并推送后端 Docker 镜像

```dockerfile
# packages/server/Dockerfile.prod
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
USER nodejs
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

```bash
# 在本地构建并推送到 Docker Hub（或阿里云镜像仓库）

# 构建镜像
docker build -f packages/server/Dockerfile.prod -t yourname/rag-server:latest .

# 推送到 Docker Hub
docker push yourname/rag-server:latest

# 或者推送到阿里云镜像仓库（国内访问更快）
# docker tag yourname/rag-server:latest registry.cn-hangzhou.aliyuncs.com/yournamespace/rag-server:latest
# docker push registry.cn-hangzhou.aliyuncs.com/yournamespace/rag-server:latest
```

#### Step 5：在 Sealos 部署后端 API

```
1. Sealos Dashboard → App Launchpad
2. 点击 "创建应用"
3. 配置：
   - 名称: rag-server
   - 镜像: yourname/rag-server:latest（刚推送的）
   - 端口: 3001
   - CPU: 2C, 内存: 2G (需要跑 cross-encoder)
   - 副本数: 1
   - 环境变量:（全部从 .env 复制）
     DEEPSEEK_API_KEY=sk-xxx
     DEEPSEEK_ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
     ZHIPU_API_KEY=xxx
     CHROMA_URL=http://rag-chromadb.namespace:8000
     POSTGRES_URL=postgres://...（Step 1 获取的）
     S3_ENDPOINT=...（Step 2 获取的）
     S3_ACCESS_KEY=...
     S3_SECRET_KEY=...
     S3_BUCKET=rag-documents
     JWT_SECRET=你的随机密钥
     PORT=3001
4. 高级设置：
   - 健康检查: /api/health → 初始延迟 30s
   - 自动扩缩容: 关闭（个人项目 1 个副本够用）
5. 点击部署
```

#### Step 6：配置公网访问

```
1. 在 rag-server 应用详情页 → 点击 "外网访问"
2. 选择 "开启外网访问"
3. 域名: rag-api.namespace.sealos.run（自动生成）
4. HTTPS: 自动配置（Sealos 自动管理证书）
5. 访问你的 API: https://rag-api.namespace.sealos.run/api/health

6. （可选）绑定自定义域名：
   - 添加你的域名解析到 Sealos 提供的 IP
   - 在 Sealos 域名配置中添加自定义域名
```

#### Step 7：部署前端（uni-app）

```bash
# uni-app 发布到微信小程序
# 用 HBuilderX 打开 packages/miniapp
# 发行 → 小程序-微信
# 生成 /packages/miniapp/dist/build/mp-weixin
# 用微信开发者工具打开这个目录 → 上传

# 或者发布为 H5（托管在 Sealos）
npm run build:h5
# 将 dist/build/h5 部署到 Sealos App Launchpad
# 用 Nginx 镜像托管静态文件
```

### 8.3 Sealos 部署架构总览

```
Sealos Dashboard
│
├── Database
│   └── rag-postgres (PostgreSQL 16)
│       ├── 用户: users
│       ├── 知识库: knowledge_bases
│       ├── 文档: documents
│       └── 会话: chat_sessions
│
├── Object Storage
│   └── rag-documents 存储桶
│       └── uploads/*.pdf/docx/txt
│
├── App Launchpad
│   ├── rag-chromadb
│   │   └── http://rag-chromadb:8000
│   │
│   └── rag-server
│       ├── 环境变量（密钥）
│       ├── 健康检查 /api/health
│       └── 外网访问: https://rag-api.xxx.sealos.run
│           └── 自动 HTTPS
│
└── Domain（可选）
    └── api.yourdomain.com → rag-server
```

---

## 九、改造工作量评估

### 9.1 按角色估算

| 角色 | 工作内容 | 预估天数 |
|------|---------|---------|
| **后端开发** | 新增微信登录、WebSocket、PostgreSQL 替换 JSON、对象存储替换本地文件 | 3-5 天 |
| **前端开发** | 新建 uni-app 项目、重写聊天界面、文档管理、上传、登录 | 5-7 天 |
| **部署与测试** | Sealos 配置、数据库初始化、联调测试、小程序审核 | 1-2 天 |
| **总计** | 一个人全栈开发 | **约 10-14 天** |

### 9.2 分阶段建议

```
第一阶段（MVP，5 天）：能跑起来
├── 后端：PostgreSQL + 对象存储 + 微信登录
├── 前端：聊天页面 + 文档上传（基础版）
└── 部署：Sealos 上线可访问

第二阶段（完善，5 天）：更好用
├── 后端：WebSocket 流式 + JWT 中间件
├── 前端：Markdown 渲染 + 引用来源 + 知识库切换
└── 测试：小程序体验优化

第三阶段（打磨，3 天）：更专业
├── 语音输入
├── 下拉刷新 + 上拉加载
├── 骨架屏 + 空状态
└── 小程序审核提交
```

---

## 十、开发阶段规划

### 10.1 开发环境搭建（Day 1）

```bash
# ─── 1. 后端（保持现有项目，添加新功能）───
cd packages/server
npm install jsonwebtoken ws @aws-sdk/client-s3 pg
# 新增文件：
#   src/services/authService.ts
#   src/services/storageService.ts
#   src/services/databaseService.ts
#   src/websocket/chatSocket.ts
#   src/routes/auth.ts
#   src/middleware/auth.ts

# ─── 2. 前端 uni-app 项目 ───
# 方式一：HBuilderX 可视化创建
# 方式二：CLI 创建
npx degit dcloudio/uni-preset-vue#vite-ts packages/miniapp
cd packages/miniapp
npm install
npm install uview-plus

# ─── 3. 本地开发调试 ───
# 后端
cd packages/server && npm run dev

# 小程序（用 HBuilderX 打开 packages/miniapp 目录）
# 运行 → 运行到小程序模拟器
```

### 10.2 核心开发任务表

```markdown
## Sprint 1：基础设施改造

- [ ] 后端：安装新依赖，创建基础目录
- [ ] 后端：实现 databaseService.js（PostgreSQL 初始化）
- [ ] 后端：实现 storageService.js（S3 对象存储）
- [ ] 后端：实现 authService.js（微信登录 + JWT）
- [ ] 后端：添加 JWT 中间件
- [ ] 后端：创建 auth 路由
- [ ] 后端：重构 documentController（文件存 S3 + 元数据存 PG）
- [ ] 后端：重构 collectionService（元数据从 JSON 迁移到 PG）
- [ ] 部署：在 Sealos 创建 PostgreSQL + 对象存储 + ChromaDB

## Sprint 2：WebSocket 流式通信

- [ ] 后端：创建 WebSocket 服务端（websocket/chatSocket.ts）
- [ ] 后端：重构 ragService 使其能同时支持 SSE 和 WebSocket
- [ ] 后端：测试 WebSocket 流式返回
- [ ] 前端 uni-app：封装 WebSocket 客户端（api/chat.ts）
- [ ] 前端 uni-app：实现消息气泡组件（chat-message.vue）

## Sprint 3：前端页面开发

- [ ] 前端：聊天首页（消息列表 + 输入区）
- [ ] 前端：Markdown 渲染（mp-html / u-parse）
- [ ] 前端：文档列表页（文档卡片）
- [ ] 前端：上传功能（uni.uploadFile）
- [ ] 前端：登录页面（uni.login + Token 存储）
- [ ] 前端：知识库切换
- [ ] 前端：空状态 + 加载状态

## Sprint 4：部署与联调

- [ ] 构建后端 Docker 镜像并推送到仓库
- [ ] Sealos App Launchpad 部署后端
- [ ] Sealos 配置外网域名 + HTTPS
- [ ] 小程序中配置合法域名（Sealos 地址）
- [ ] 端到端联调测试
- [ ] 微信开发者工具上传小程序
```

---

## 十一、功能清单对比

| 功能 | Web 版 | 小程序版 | App 版 | 备注 |
|------|--------|---------|-------|------|
| 流式问答 | SSE | WebSocket | WebSocket | 核心功能 |
| Agent 智能体聊天 | SSE (ReAct) | WebSocket | WebSocket | 多工具调用、思考过程可见 |
| 文档上传 (PDF/DOCX/TXT) | ✅ | ✅ | ✅ | 通过对象存储 |
| 文档列表/删除 | ✅ | ✅ | ✅ | 从 PostgreSQL 读取 |
| 文档内容查看 | ✅ | ✅ | ✅ | 从对象存储读取 |
| 知识库切换 | ✅ | ✅ | ✅ | 同上 |
| 创建/删除知识库 | ✅ | ✅ | ✅ | 同上 |
| 会话保存/加载 | localStorage | PostgreSQL | PostgreSQL | ✅ 跨设备同步 |
| Tool 系统 (4 个工具) | ✅ | ✅ | ✅ | P1: 检索/列表/内容/问答 |
| 记忆管理 (L2+L3) | ✅ | ✅ | ✅ | P3: 摘要+语义记忆 |
| 监控看板 | ✅ (Vue) | - | - | P4: 延迟/Token/QPS 图表 |
| 监控 API | ✅ | ✅ | ✅ | REST 接口可用 |
| 用户反馈评分 | ✅ | ✅ | ✅ | P5: 1-5 星 + 评论 |
| 滑动窗口摘要 | ✅ | ✅ | ✅ | P6: 自动管理 Token |
| Agent 评估 | ✅ (CLI) | - | - | P7: npm run evaluate:agent |
| Markdown 渲染 | ✅ | ✅ | ✅ | mp-html |
| 引用来源展示 | ✅ | ✅ | ✅ | 可折叠 |
| 温度控制 | ✅ | ✅ | ✅ | 设置页 |
| 微信登录 | - | ✅ | - | 新增 |
| 用户认证 | - | ✅ | ✅ | JWT |
| 语音输入 | - | - | ✅ | 录音 API |
| 文件预览 | 下载 | 在线预览 | 在线预览 | wx.openDocument |
| 离线提示 | - | ✅ | ✅ | 网络状态检测 |
| 消息推送 | - | ✅ | ✅ | 订阅消息 |
| 多端同步 | - | ✅ | ✅ | 数据在云端 |

---

## 十二、常见问题 FAQ

### Q1：微信小程序需要备案吗？

**需要！** 2023 年 9 月起，微信小程序要求域名已备案。
- 如果你用 Sealos 提供的域名（`*.sealos.run`），需要在微信小程序后台配置为合法域名
- 如果用自定义域名，需要先 ICP 备案

### Q2：uni-app 中能用 Pinia 吗？

uni-app 2.0+ (Vue 3 版本) 支持 Pinia。也可以用 Vuex。

### Q3：微信小程序的 SSE 问题怎么解决？

微信小程序不支持 SSE 的 `ReadableStream`。解决方案：
1. **使用 WebSocket（推荐）** — 后端新增 WebSocket 服务，小程序原生支持
2. **短轮询** — 发请求后轮询结果（简单但浪费资源）
3. **分包 + 合并** — 后端将生成的内容分批，每批完成后推送给小程序

### Q4：Sealos 的费用大概多少？

以个人项目为例：
- PostgreSQL 1C1G 1GB：约 ¥20-30/月
- 对象存储：按量计费，个人项目 ¥5-10/月
- 容器 (App Launchpad)：按 CPU/内存计费，2C2G 约 ¥50-80/月
- **个人项目总计：约 ¥80-120/月**

> Sealos 有免费额度，具体查看官网最新政策。

### Q5：ChromaDB 在 Sealos 上性能怎么样？

ChromaDB 在 Sealos 容器中运行良好。需要注意：
- 给 ChromaDB 挂载持久化存储卷（Sealos 支持）
- 部署在同一 namespace 内，网络延迟极低
- 如果文档量大（>10000 个 chunk），建议给 2C2G

### Q6：已有 Web 版用户数据怎么迁移？

```bash
# 1. 从本地 JSON 导出知识库数据
# collections.json → 导入 PostgreSQL

# 2. 上传文件从本地迁移到对象存储
# data/uploads/ → 通过脚本上传到 S3

# 3. ChromaDB 数据（推荐重新 Embedding）
# 因为向量已存在，可以把 ChromaDB 的持久化数据整体迁移到 Sealos
# 或者直接重新上传文档建立索引
```

### Q7：如果没有微信小程序 AppId 怎么办？

1. 在 [微信公众平台](https://mp.weixin.qq.com/) 注册小程序账号
2. 个人主体可以注册，不需要企业资质
3. AppId 在 "开发 → 开发设置" 中查看
4. 开发阶段可以用测试号（不需要真注册）
   - [微信小程序测试号](https://developers.weixin.qq.com/miniprogram/dev/devtools/sandbox.html)

### Q8：uni-app 调试需要什么工具？

| 平台 | 调试工具 | 说明 |
|------|---------|------|
| 微信小程序 | 微信开发者工具 | 必须装 |
| H5 | 浏览器 DevTools | 最简单 |
| App (Android) | Android Studio + 真机调试 | 需配置 |
| App (iOS) | Xcode + 真机调试 | 需 Mac |

---

## 附：开发者工具箱

### 微信小程序相关

| 资源 | 链接 |
|------|------|
| 微信公众平台（注册小程序） | https://mp.weixin.qq.com/ |
| 微信小程序开发文档 | https://developers.weixin.qq.com/miniprogram/dev/framework/ |
| 微信小程序测试号申请 | https://developers.weixin.qq.com/miniprogram/dev/devtools/sandbox.html |
| 微信开发者工具下载 | https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html |

### uni-app 相关

| 资源 | 链接 |
|------|------|
| uni-app 官方文档 | https://uniapp.dcloud.net.cn/ |
| uni-app 组件库 (uView) | https://uviewui.com/ |
| uni-app 插件市场 | https://ext.dcloud.net.cn/ |

### Sealos 相关

| 资源 | 链接 |
|------|------|
| Sealos Cloud 官网 | https://cloud.sealos.io/ |
| Sealos 文档 | https://sealos.io/docs/ |
| Sealos GitHub | https://github.com/labring/sealos |

### 后端技术

| 资源 | 链接 |
|------|------|
| PostgreSQL 中文文档 | http://www.postgres.cn/docs/16/ |
| WebSocket (ws 库) | https://github.com/websockets/ws |
| JWT (jsonwebtoken) | https://github.com/auth0/node-jsonwebtoken |
| AWS SDK S3 (Node.js) | https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/s3-examples.html |

---

> 💡 **最后的建议：**
>
> 1. **不要一次性重写所有功能** — 先让"上传文档 + 聊天"跑通，再逐步添加
> 2. **H5 版本优先调试** — uni-app 的 H5 模式可以直接在浏览器里跑，调试最方便
> 3. **小程序审核周期** — 首次提交审核约 1-7 天，做好心理准备
> 4. **Sealos 有免费额度** — 先探索免费额度，确定项目真需要再付费
> 5. **遇到问题先查文档** — 微信小程序和 uni-app 的坑很多，但文档也相对完善

---

*文档生成日期: 2026-05-20*
