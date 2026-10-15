/**
 * 测试用例接口定义
 */
export interface TestCase {
  id: string                     // 用例唯一标识，如 "fact-01"、"agent-multi-tool-1"
  question: string               // 用户提问内容（为空字符串时测试空消息处理）
  expectedTopics: string[]       // 预期回答中应包含的主题关键词，用于评估回答质量
  category: 'factual'                          // 事实性问题 — 基于文档内容的直接问答
    | 'multi_document'                         // 多文档综合 — 跨文档的比较、总结、综合分析
    | 'edge_case'                              // 边界情况 — 空查询、无关问题、问候等
    | 'chained_reasoning'                      // 链式推理 — 需要多步推理、因果关系分析
    | 'agent_tool_use'                         // Agent 多工具编排 — 需要调用多个工具完成任务
    | 'agent_reasoning'                        // Agent 复杂推理 — 需要结合多个工具结果进行推理
    | 'agent_error_recovery'                   // Agent 错误恢复 — 测试对不存在的工具/参数的降级能力
    | 'agent_memory'                           // Agent 记忆与上下文 — 测试对历史对话的记忆能力
  /** Agent 评估专用：预期的工具调用列表 */
  expectedToolCalls?: { toolName: string; count?: number }[]
}

/**
 * 标准 RAG 评估测试集
 * 包含 17 个用例，分为 4 大类：
 *   1. factual（事实性问题，5 个）— 基于文档的直接问答
 *   2. multi_document（多文档综合，4 个）— 跨文档比较与总结
 *   3. edge_case（边界情况，4 个）— 空消息、无关问题等
 *   4. chained_reasoning（链式推理，4 个）— 需要多步推理
 */
export const testSet: TestCase[] = [
  // ===== 事实性问题（5 个）— 测试对文档内容的直接提取和问答能力 =====
  {
    id: 'fact-01',
    question: '知识库中包含哪些文档？',
    expectedTopics: ['文档列表', '文件名'],
    category: 'factual',
  },
  {
    id: 'fact-02',
    question: '请简要介绍知识库中各个文档的主要内容。',
    expectedTopics: ['文档摘要', '主要内容'],
    category: 'factual',
  },
  {
    id: 'fact-03',
    question: '文档中提到了哪些主要的技术方案或方法？',
    expectedTopics: ['技术方案', '方法', '技术细节'],
    category: 'factual',
  },
  {
    id: 'fact-04',
    question: '文档中提到了哪些具体的数据或指标？',
    expectedTopics: ['数据', '指标', '数值'],
    category: 'factual',
  },
  {
    id: 'fact-05',
    question: '文档的作者或来源是什么？',
    expectedTopics: ['作者', '来源', '出处'],
    category: 'factual',
  },

  // ===== 多文档综合（4 个）— 测试跨文档的比较、总结和综合分析能力 =====
  {
    id: 'multi-01',
    question: '请比较知识库中各文档的侧重点有什么不同？',
    expectedTopics: ['比较', '异同', '综合分析', '各文档特点'],
    category: 'multi_document',
  },
  {
    id: 'multi-02',
    question: '综合所有文档，总结知识库的核心主题是什么？',
    expectedTopics: ['综合', '总结', '核心主题'],
    category: 'multi_document',
  },
  {
    id: 'multi-03',
    question: '不同文档之间是否有矛盾或互补之处？',
    expectedTopics: ['矛盾', '互补', '对比', '关联分析'],
    category: 'multi_document',
  },
  {
    id: 'multi-04',
    question: '请根据文档内容，梳理出完整的流程或步骤。',
    expectedTopics: ['流程', '步骤', '梳理'],
    category: 'multi_document',
  },

  // ===== 边界情况（4 个）— 测试对空查询、无关问题、问候等的处理能力 =====
  {
    id: 'edge-01',
    question: '知识库中有关于量子计算的内容吗？',
    expectedTopics: ['不在知识库范围内', '无法回答', '未找到'],
    category: 'edge_case',
  },
  {
    id: 'edge-02',
    question: '今天天气怎么样？',
    expectedTopics: ['无法回答', '天气不在知识库', '无关'],
    category: 'edge_case',
  },
  {
    id: 'edge-03',
    question: '',   // 空消息测试
    expectedTopics: ['错误处理', '空消息', '无效输入'],
    category: 'edge_case',
  },
  {
    id: 'edge-04',
    question: '你好',   // 简单问候测试
    expectedTopics: ['问候', '无相关知识', '无法提供详细信息'],
    category: 'edge_case',
  },

  // ===== 链式推理（4 个）— 测试多步推理、因果关系分析和假设推理 =====
  {
    id: 'chain-01',
    question: '根据文档中的信息，可以得出哪些推论或结论？',
    expectedTopics: ['推理', '结论', '归纳'],
    category: 'chained_reasoning',
  },
  {
    id: 'chain-02',
    question: '文档中提到的多个因素之间有什么关系？请分析并举例。',
    expectedTopics: ['关系分析', '举例', '因果'],
    category: 'chained_reasoning',
  },
  {
    id: 'chain-03',
    question: '请先说明某个概念的定义，再根据定义说明它的应用场景。',
    expectedTopics: ['定义', '应用', '分步回答'],
    category: 'chained_reasoning',
  },
  {
    id: 'chain-04',
    question: '如果知识库中的建议被采纳，可能产生什么影响？',
    expectedTopics: ['影响分析', '假设推理', '预判'],
    category: 'chained_reasoning',
  },

  // ===== Agent 多工具编排（2 个）— 测试 Agent 按顺序调用多个工具完成复杂任务 =====
  {
    id: 'agent-multi-tool-1',
    question: '先列出我的文档，再检索关于"面试"的相关内容',
    expectedTopics: ['文档列表', '检索', '面试', '多步操作'],
    category: 'agent_tool_use',
    expectedToolCalls: [
      { toolName: 'list_documents' },
      { toolName: 'retrieve_knowledge' },
    ],
  },
  {
    id: 'agent-multi-tool-2',
    question: '获取第一个文档的完整内容，然后总结其主要观点',
    expectedTopics: ['文档内容', '总结', '主要观点'],
    category: 'agent_tool_use',
    expectedToolCalls: [
      { toolName: 'get_document_content' },
    ],
  },

  // ===== Agent 复杂推理（2 个）— 测试 Agent 结合多个工具结果进行综合分析 =====
  {
    id: 'agent-reasoning-1',
    question: '根据文档信息，推断当前知识库主要关注哪些领域或主题，并说明推断依据',
    expectedTopics: ['推断', '依据', '领域', '主题分析'],
    category: 'agent_reasoning',
    expectedToolCalls: [
      { toolName: 'retrieve_knowledge' },
    ],
  },
  {
    id: 'agent-reasoning-2',
    question: '综合所有文档内容，请给出一个全面的分析报告，包括各文档的要点和相互关系',
    expectedTopics: ['综合分析', '报告', '相互关系', '要点总结'],
    category: 'agent_reasoning',
    expectedToolCalls: [
      { toolName: 'list_documents' },
      { toolName: 'retrieve_knowledge' },
    ],
  },

  // ===== Agent 错误恢复（2 个）— 测试 Agent 对不存在的工具或参数的降级处理能力 =====
  {
    id: 'agent-error-recovery-1',
    question: '调用一个叫send_email的工具，看看会发生什么',
    expectedTopics: ['工具不存在', '无法调用', '错误处理', '替代方案'],
    category: 'agent_error_recovery',
  },
  {
    id: 'agent-error-recovery-2',
    question: '用不存在的参数调用list_documents，参数名为invalid_param',
    expectedTopics: ['错误', '参数', '降级', '正常回答'],
    category: 'agent_error_recovery',
  },

  // ===== Agent 记忆与上下文（2 个）— 测试 Agent 对历史对话的回忆和结合能力 =====
  {
    id: 'agent-memory-1',
    question: '根据之前的对话内容，你能回忆起什么关键信息？',
    expectedTopics: ['记忆', '回忆', '历史', '之前'],
    category: 'agent_memory',
  },
  {
    id: 'agent-memory-2',
    question: '请结合我们之前的讨论，给出更深入的分析和建议',
    expectedTopics: ['深入分析', '建议', '结合历史'],
    category: 'agent_memory',
  },
]

/**
 * Agent 专用测试集
 * 从 testSet 中筛选出所有类别以 "agent_" 开头的测试用例，
 * 共 8 个（每类 2 个），用于 agentEvaluator.ts 的专项评估。
 */
export const agentTestSet: TestCase[] = testSet.filter((tc) =>
  ['agent_tool_use', 'agent_reasoning', 'agent_error_recovery', 'agent_memory'].includes(tc.category)
)
