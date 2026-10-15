/**
 * Express 应用配置——供服务器入口和测试共同使用
 * 不调用 app.listen()，以便测试框架（supertest）可独立绑定端口
 */
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';

const app = express();

// ---- 中间件配置 ----
app.use(cors());
app.use(express.json());

// ---- Anthropic 客户端（兼容 DeepSeek 端点） ----
const anthropic = new Anthropic({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_ANTHROPIC_BASE_URL,
});

// ---- 路由导入 ----
import documentRouter from './routes/document';
import chatRouter from './routes/chat';
import knowledgeBaseRouter from './routes/knowledgeBase';
import agentRouter from './routes/agent';
import sessionRouter from './routes/session';
import monitorRouter from './routes/monitor';
import feedbackRouter from './routes/feedback';
import evaluationRouter from './routes/evaluation';

// ---- 预热 Embedding 模型（后台异步执行，不阻塞启动） ----
import { getEmbeddings } from './services/vectorStoreService';
(async () => {
  try {
    await getEmbeddings();
    console.log('Embedding model pre-initialized successfully');
  } catch (err: any) {
    console.warn('Embedding model pre-init failed:', err.message);
  }
})();

// ---- Tool System Initialization ----
import { getToolRegistry } from './services/toolRegistry';
import { retrieveKnowledgeTool } from './tools/retrieveKnowledge';
import { listDocumentsTool } from './tools/listDocuments';
import { getDocumentContentTool } from './tools/getDocumentContent';
import { chatWithContextTool } from './tools/chatWithContext';

const registry = getToolRegistry();
registry.register(retrieveKnowledgeTool);
registry.register(listDocumentsTool);
registry.register(getDocumentContentTool);
registry.register(chatWithContextTool);
console.log(`Tool Registry initialized with ${registry.list().length} tools`);

// ---- 健康检查端点 ----
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/documents', documentRouter);
app.use('/api/chat', chatRouter);
app.use('/api/knowledge-bases', knowledgeBaseRouter);
app.use('/api/agent', agentRouter);
app.use('/api/sessions', sessionRouter);
app.use('/api/monitor', monitorRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/evaluation', evaluationRouter);

// ---- 全局错误处理器 —— 捕获所有未处理的异常 ----
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  try {
    const { getMonitorService } = require('./services/monitorService')
    getMonitorService().logError('error', err.message || '未捕获异常', 'server')
  } catch { /* monitor not available */ }
  console.error('[Server] Unhandled error:', err.message)
  res.status(500).json({ error: '服务器内部错误' })
})

// 导出 Express 实例、Anthropic 客户端和工具注册表，供其他模块使用
export { app, anthropic, registry };
