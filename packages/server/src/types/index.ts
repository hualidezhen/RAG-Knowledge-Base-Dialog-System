/**
 * 项目所有核心类型定义汇总
 * 涵盖文档解析、对话消息、SSE 事件、工具系统(P1)、智能体(P2)、监控(P4)、反馈与评估(P5)等模块
 */

/** 解析后的文档内容，包含文件名、类型和全文 */
export interface ParsedDocument {
  fileName: string  // 文件名
  fileType: 'pdf' | 'docx' | 'txt'  // 文件类型：PDF、Word 或纯文本
  content: string  // 文档的完整文本内容
}

/** 文档块的元数据，记录该块所属文件、位置及分块信息 */
export interface ChunkMetadata {
  [key: string]: string | number | boolean  // 允许扩展自定义字段
  fileName: string  // 所属文件名
  fileType: string  // 文件类型（pdf/docx/txt）
  uploadTime: string  // 上传时间（ISO 格式）
  chunkIndex: number  // 当前块的序号（从 0 开始）
  totalChunks: number  // 该文件的总块数
}

/** 文档上传结果，标识上传是否成功及分块信息 */
export interface UploadResult {
  documentId: string  // 文档唯一标识
  fileName: string  // 上传的文件名
  fileType: string  // 文件类型
  totalChunks: number  // 文档被分成的块数
  success: true  // 上传成功标识（恒为 true）
}

/** 知识库中的文档列表项，用于前端展示文档概览 */
export interface DocumentListItem {
  fileName: string  // 文件名
  fileType: string  // 文件类型
  uploadTime: string  // 上传时间
  chunkCount: number  // 该文档的块数量
}

/** 单条对话消息，包含角色和内容 */
export interface ChatMessage {
  role: 'user' | 'assistant'  // 消息角色：用户或助手
  content: string  // 消息文本内容
}

/** 聊天请求体，由客户端发送至后端 */
export interface ChatRequest {
  message: string  // 用户当前消息
  temperature?: number  // LLM 生成温度（可选，默认 0.3）
  history?: ChatMessage[]  // 历史对话上下文（可选）
  collection?: string  // 知识库名称（可选，默认使用主库）
  sessionId?: string  // 会话 ID（可选，用于记忆管理）
}

/** 从知识库检索到的相关文档块，按相关性排序 */
export interface RetrievedChunk {
  content: string  // 文档块文本内容
  fileName: string  // 来源文件名
  chunkIndex: number  // 在原文档中的块序号
  distance: number  // 与查询的向量距离（越小越相关）
}

/** SSE 事件——知识库来源信息，包含检索到的相关文档块列表 */
export interface SourceEvent {
  type: 'sources'  // 事件类型标识
  sources: RetrievedChunk[]  // 检索到的来源文档块列表
}

/** SSE 事件——流式生成的文本 Token */
export interface TokenEvent {
  type: 'token'  // 事件类型标识
  content: string  // 当前 Token 文本内容
}

/** SSE 事件——错误通知 */
export interface ErrorEvent {
  type: 'error'  // 事件类型标识
  message: string  // 错误描述
}

/** SSE 事件联合类型，覆盖所有可能的推送事件 */
export type SSEEvent = SourceEvent | TokenEvent | ErrorEvent

// ---- P1: Tool System 工具系统 ----
// 将知识库操作封装为标准化工具，供智能体（Agent）编排调用

/** 工具参数定义，描述工具接受的每个输入参数 */
export interface ToolParameter {
  name: string  // 参数名
  type: string  // 参数类型（string/number/boolean 等）
  description: string  // 参数说明，用于 LLM 理解用途
  required?: boolean  // 是否必需（默认为 true）
}

/** 工具定义，描述一个可被智能体调用的能力单元 */
export interface Tool {
  name: string  // 工具名称（如 retrieve_knowledge）
  description: string  // 工具功能描述，供 LLM 选择工具时参考
  parameters: ToolParameter[]  // 工具接受的参数列表
  execute(args: Record<string, any>): Promise<any>  // 执行工具并返回结果
}

/** 工具调用记录，追踪智能体对工具的每次调用过程 */
export interface ToolCall {
  toolName: string  // 被调用的工具名称
  args: Record<string, any>  // 调用时传入的参数
  result?: any  // 工具执行结果（可选，失败时可能不存在）
  error?: string  // 执行错误信息（可选）
  durationMs?: number  // 执行耗时（毫秒）
}

/** 工具执行结果，统一返回格式 */
export interface ToolResult {
  success: boolean  // 执行是否成功
  data?: any  // 成功时的返回数据
  error?: string  // 失败时的错误描述
  durationMs: number  // 执行耗时（毫秒）
  tokenCount?: number  // 本次调用消耗的 Token 数（可选）
}

// ---- P2: Agent 智能体编排引擎 ----
// 实现 ReAct 推理循环，让 LLM 能自主调用工具完成多步任务

/** 智能体运行配置参数 */
export interface AgentConfig {
  maxIterations: number  // ReAct 循环最大迭代次数，防止无限循环
  maxTokens: number  // 每次 LLM 调用的最大 Token 输出限制
  temperature: number  // LLM 生成温度
  availableTools: string[]  // 智能体可使用的工具名称列表
}

/** 智能体推理过程中的单步记录，包含思考、行动和观察 */
export interface AgentStep {
  thought: string  // LLM 的思考过程
  toolCall?: ToolCall  // 本轮调用的工具记录（可选，可能只有思考）
  observation?: string  // 工具执行后的观察结果
  timestamp: number  // 该步骤的时间戳（毫秒）
}

/** 智能体完整运行记录，包含从问题到最终答案的完整轨迹 */
export interface AgentRun {
  id: string  // 运行记录唯一标识
  sessionId: string  // 所属会话 ID
  question: string  // 用户提出的原始问题
  steps: AgentStep[]  // 推理步骤列表（Thought/Action/Observation）
  finalAnswer: string  // 最终生成的回答
  status: 'running' | 'completed' | 'failed'  // 运行状态
  startTime: number  // 开始时间戳（毫秒）
  endTime?: number  // 结束时间戳（毫秒，运行中为 undefined）
  totalTokens?: number  // 总 Token 消耗
}

// ---- P4: Monitoring 运行时监控系统 ----
// LLM 调用、工具调用、RAG 检索三类指标的实时采集与聚合

/** 单个指标数据点，记录某一时刻的监控数据 */
export interface MetricPoint {
  timestamp: string  // 数据采集时间（ISO 格式）
  category: 'llm' | 'tool' | 'retrieval'  // 指标分类
  name: string  // 指标名称（如 chat_completion、hybrid_search）
  value: number  // 指标数值（通常为耗时毫秒数）
  tags: Record<string, string | number | boolean>  // 标签，用于多维过滤
  metadata?: Record<string, any>  // 额外的元数据（可选）
}

/** 按小时聚合后的指标数据，用于监控图表展示 */
export interface AggregatedMetric {
  hour: string  // 聚合时间段（如 "2026-05-22T10:00:00"）
  category: string  // 指标分类
  name: string  // 指标名称
  sum: number  // 该小时内的数值总和
  avg: number  // 该小时内的平均值
  max: number  // 该小时内的最大值
  min: number  // 该小时内的最小值
  count: number  // 该小时内的采样次数
  tags: Record<string, string | number | boolean>  // 聚合时保留的标签
}

/** 错误日志条目，记录系统运行中的异常信息 */
export interface ErrorLog {
  timestamp: string  // 错误发生时间
  level: 'error' | 'warn' | 'info'  // 日志级别
  message: string  // 错误消息描述
  category: string  // 错误所属分类（如 server/agent/rag）
  stack?: string  // 调用堆栈信息（可选）
}

// ---- P5: Feedback & Evaluation 用户反馈与在线评估 ----
// 收集用户对回答的评分与评价，支持离线评测与趋势分析

/** 用户提交的反馈请求体 */
export interface FeedbackRequest {
  messageId: string  // 被评价的消息 ID
  rating: 1 | 2 | 3 | 4 | 5  // 评分（1-5 星）
  comment?: string  // 评论文本（可选）
  tags?: string[]  // 自定义标签（可选）
  sessionId?: string  // 所属会话 ID（可选）
}

/** 持久化存储的反馈记录 */
export interface FeedbackEntry {
  id: string  // 反馈唯一标识
  messageId: string  // 被评价的消息 ID
  rating: number  // 评分
  comment?: string  // 评论文本（可选）
  tags?: string[]  // 自定义标签（可选）
  sessionId?: string  // 所属会话 ID（可选）
  timestamp: string  // 提交时间（ISO 格式）
}

/** 反馈统计汇总，用于分析用户满意度 */
export interface FeedbackStats {
  total: number  // 总反馈数
  avgRating: number  // 平均评分
  distribution: Record<number, number>  // 评分分布（如 {1: 5, 2: 3, 3: 10, 4: 20, 5: 30}）
  recentComments: { rating: number; comment: string; timestamp: string }[]  // 近期评论列表
}

/** 离线评估运行记录，保存每次评估的结果数据 */
export interface EvalRunRecord {
  timestamp: string  // 评估运行时间
  totalCases: number  // 本次评估的测试用例总数
  avgFaithfulness: number  // 平均忠实度得分
  avgRelevance: number  // 平均相关性得分
  avgCompleteness: number  // 平均完整性得分
  details: { caseId: string; scores: Record<string, number>; error?: string }[]  // 每个用例的详细得分
}
