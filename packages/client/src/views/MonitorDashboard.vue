<template>
  <div class="monitor-dashboard">
    <header class="dashboard-header">
      <div class="header-left">
        <el-button @click="$router.push('/')" :icon="ArrowLeft" size="small" circle />
        <h1>监控看板</h1>
      </div>
      <div class="header-actions">
        <el-radio-group v-model="timeRange" @change="loadMetrics">
          <el-radio-button value="1h">近 1 小时</el-radio-button>
          <el-radio-button value="24h">近 24 小时</el-radio-button>
          <el-radio-button value="7d">近 7 天</el-radio-button>
        </el-radio-group>
        <el-button type="primary" @click="refreshAll" :loading="loading">
          刷新
        </el-button>
      </div>
    </header>

    <!-- Realtime status cards -->
    <section class="status-cards">
      <div class="status-card">
        <div class="card-label">QPS</div>
        <div class="card-value">{{ realtime.qps }}</div>
      </div>
      <div class="status-card">
        <div class="card-label">平均延迟</div>
        <div class="card-value">{{ realtime.avgLatencyMs }}<small>ms</small></div>
      </div>
      <div class="status-card">
        <div class="card-label">工具调用</div>
        <div class="card-value">{{ realtime.toolCallCount }}</div>
      </div>
      <div class="status-card">
        <div class="card-label">错误数</div>
        <div class="card-value error">{{ realtime.errorCount }}</div>
      </div>
    </section>

    <!-- LLM metrics section -->
    <section class="metrics-section">
      <h2>LLM 调用指标</h2>
      <el-table :data="llmMetrics" stripe style="width: 100%" v-if="llmMetrics.length">
        <el-table-column prop="name" label="调用类型" width="160" />
        <el-table-column prop="count" label="调用次数" width="100" sortable />
        <el-table-column prop="avg" label="平均延迟 (ms)" width="140" sortable>
          <template #default="{ row }">
            <div class="bar-cell">
              <div class="bar" :style="{ width: barWidth(row.avg, llmMetrics, 'avg') + '%' }"></div>
              <span>{{ row.avg }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="max" label="最大延迟 (ms)" width="140" sortable />
        <el-table-column prop="min" label="最小延迟 (ms)" width="140" sortable />
        <el-table-column label="Token 消耗" min-width="160">
          <template #default="{ row }">
            <span v-if="row.tags.tokensIn !== undefined">
              输入: {{ row.tags.tokensIn }} / 输出: {{ row.tags.tokensOut }}
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无 LLM 指标数据" />
    </section>

    <!-- Tool metrics section -->
    <section class="metrics-section">
      <h2>工具调用指标</h2>
      <el-table :data="toolMetrics" stripe style="width: 100%" v-if="toolMetrics.length">
        <el-table-column prop="name" label="工具名称" width="200" />
        <el-table-column prop="count" label="调用次数" width="100" sortable />
        <el-table-column prop="avg" label="平均耗时 (ms)" width="140" sortable />
        <el-table-column label="成功率" width="120" sortable>
          <template #default="{ row }">
            <span :class="getSuccessRateClass(row)">
              {{ getSuccessRate(row) }}%
            </span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无工具指标数据" />
    </section>

    <!-- Retrieval metrics section -->
    <section class="metrics-section">
      <h2>检索指标</h2>
      <el-table :data="retrievalMetrics" stripe style="width: 100%" v-if="retrievalMetrics.length">
        <el-table-column prop="name" label="检索类型" width="160" />
        <el-table-column prop="count" label="检索次数" width="100" sortable />
        <el-table-column prop="avg" label="平均耗时 (ms)" width="140" sortable />
        <el-table-column label="平均命中数" width="120" sortable>
          <template #default="{ row }">
            {{ row.avgChunks || '-' }}
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无检索指标数据" />
    </section>

    <!-- Error logs section -->
    <section class="metrics-section">
      <h2>错误日志</h2>
      <div class="log-filters">
        <el-select v-model="logLevel" placeholder="日志级别" @change="loadLogs" style="width: 140px">
          <el-option label="全部" value="" />
          <el-option label="错误" value="error" />
          <el-option label="警告" value="warn" />
          <el-option label="信息" value="info" />
        </el-select>
      </div>
      <el-table :data="errorLogs" stripe style="width: 100%" v-if="errorLogs.length">
        <el-table-column prop="timestamp" label="时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.timestamp) }}
          </template>
        </el-table-column>
        <el-table-column prop="level" label="级别" width="80">
          <template #default="{ row }">
            <el-tag :type="logTagType(row.level)" size="small">{{ row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="100" />
        <el-table-column prop="message" label="消息" min-width="300" />
      </el-table>
      <el-empty v-else description="暂无错误日志" />
    </section>

    <!-- Navigation back -->
    <div style="margin-top: 24px; text-align: center">
      <el-button @click="$router.push('/')">返回对话</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ArrowLeft } from '@element-plus/icons-vue'
import { getMetrics, getRealtime, getLogs, AggregatedMetric, RealtimeStatus, ErrorLog } from '../api/monitor'

const timeRange = ref<'1h' | '24h' | '7d'>('1h')  // 时间范围选择：近 1 小时 / 24 小时 / 7 天
const loading = ref(false)  // 刷新数据时的加载状态
const llmMetrics = ref<AggregatedMetric[]>([])  // LLM 调用指标数据
const toolMetrics = ref<AggregatedMetric[]>([])  // 工具调用指标数据
const retrievalMetrics = ref<AggregatedMetric[]>([])  // 检索指标数据
const errorLogs = ref<ErrorLog[]>([])  // 错误日志列表
const logLevel = ref('')  // 日志级别过滤条件
const realtime = ref({ qps: 0, avgLatencyMs: 0, toolCallCount: 0, errorCount: 0 })  // 实时运行状态

let refreshTimer: ReturnType<typeof setInterval> | null = null  // 自动轮询定时器

// 格式化时间戳为 zh-CN 本地时间字符串
function formatTime(ts: string) {
  return new Date(ts).toLocaleString('zh-CN')
}

// 根据日志级别返回对应的 Element Plus Tag 类型
function logTagType(level: string) {
  if (level === 'error') return 'danger'
  if (level === 'warn') return 'warning'
  return 'info'
}

// 计算指标在表格中条形图的宽度（相对于同列最大值）
function barWidth(value: number, all: AggregatedMetric[], field: 'avg' | 'max' | 'min') {
  const max = Math.max(...all.map((m) => m[field] as number), 1)
  return (value / max) * 100
}

// 计算工具调用的成功率百分比
function getSuccessRate(row: AggregatedMetric): string {
  const successCount = row.tags.success !== false ? row.count : 0
  return ((successCount / row.count) * 100).toFixed(1)
}

// 根据成功率返回对应的 CSS 类名（绿色 >= 95%，黄色 >= 80%，红色 < 80%）
function getSuccessRateClass(row: AggregatedMetric): string {
  const rate = parseFloat(getSuccessRate(row))
  if (rate >= 95) return 'success-text'
  if (rate >= 80) return 'warning-text'
  return 'error-text'
}

// 加载 LLM、工具、检索三类指标数据
async function loadMetrics() {
  try {
    const [llmRes, toolRes, retrievalRes] = await Promise.all([
      getMetrics(timeRange.value, 'llm'),
      getMetrics(timeRange.value, 'tool'),
      getMetrics(timeRange.value, 'retrieval'),
    ])
    llmMetrics.value = llmRes.data.metrics.map((m) => ({
      ...m,
      avgChunks: m.tags.chunkCount as number || 0,
    }))
    toolMetrics.value = toolRes.data.metrics
    retrievalMetrics.value = retrievalRes.data.metrics
  } catch {
    // 静默降级，不影响其他数据加载
  }
}

// 加载实时运行状态（QPS、延迟等）
async function loadRealtime() {
  try {
    const res = await getRealtime()
    if (res.data.success) {
      realtime.value = res.data.data
    }
  } catch {
    // 静默降级
  }
}

// 加载错误日志列表
async function loadLogs() {
  try {
    const res = await getLogs(logLevel.value || undefined, 50)
    errorLogs.value = res.data.logs
  } catch {
    // 静默降级
  }
}

// 刷新所有数据（指标 + 实时状态 + 日志）
async function refreshAll() {
  loading.value = true
  await Promise.all([loadMetrics(), loadRealtime(), loadLogs()])
  loading.value = false
}

onMounted(() => {
  refreshAll()  // 组件挂载后立即加载数据
  refreshTimer = setInterval(refreshAll, 30_000)  // 每 30 秒自动轮询刷新
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)  // 组件销毁时清除定时器
})
</script>

<style scoped>
.monitor-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}

.dashboard-header h1 {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Status cards */
.status-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 28px;
}

.status-card {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  transition: box-shadow 0.2s;
}

.status-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card-label {
  font-size: 13px;
  color: #909399;
  margin-bottom: 8px;
}

.card-value {
  font-size: 28px;
  font-weight: 700;
  color: #303133;
}

.card-value small {
  font-size: 14px;
  font-weight: 400;
  color: #909399;
  margin-left: 4px;
}

.card-value.error {
  color: #f56c6c;
}

/* Metrics sections */
.metrics-section {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.metrics-section h2 {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

/* Bar chart in table */
.bar-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bar {
  height: 16px;
  background: linear-gradient(90deg, #409eff, #79bbff);
  border-radius: 3px;
  min-width: 4px;
  transition: width 0.3s;
}

/* Status colors */
.success-text {
  color: #67c23a;
  font-weight: 600;
}

.warning-text {
  color: #e6a23c;
  font-weight: 600;
}

.error-text {
  color: #f56c6c;
  font-weight: 600;
}

/* Log filters */
.log-filters {
  margin-bottom: 12px;
}

/* Responsive */
@media (max-width: 768px) {
  .status-cards {
    grid-template-columns: repeat(2, 1fr);
  }

  .dashboard-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
