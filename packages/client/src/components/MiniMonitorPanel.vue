<template>
  <div class="mini-monitor">
    <el-collapse v-model="activeName" accordion>
      <!-- 实时监控折叠面板，展示 QPS、延迟、工具调用数、错误数 -->
      <el-collapse-item title="⚡ 实时监控" name="monitor">
        <div class="mini-cards">
          <div class="mini-card">
            <div class="mini-label">QPS</div>
            <div class="mini-value">{{ realtime.qps }}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">延迟</div>
            <div class="mini-value">{{ realtime.avgLatencyMs }}<small>ms</small></div>
          </div>
          <div class="mini-card">
            <div class="mini-label">工具调用</div>
            <div class="mini-value">{{ realtime.toolCallCount }}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">错误</div>
            <div class="mini-value" :class="{ 'has-error': realtime.errorCount > 0 }">
              {{ realtime.errorCount }}
            </div>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getRealtime } from '../api/monitor'  // 监控 API：获取实时运行状态

const activeName = ref('monitor')  // 折叠面板当前展开项
const realtime = ref({ qps: 0, avgLatencyMs: 0, toolCallCount: 0, errorCount: 0 })  // 实时指标数据
let refreshTimer: ReturnType<typeof setInterval> | null = null  // 轮询定时器

// 加载实时监控数据并更新状态
async function loadRealtime() {
  try {
    const res = await getRealtime()
    if (res.data.success) {
      realtime.value = res.data.data
    }
  } catch {
    // 静默降级：后端不可用时不影响前端其他功能
  }
}

onMounted(() => {
  loadRealtime()  // 组件挂载后首次加载
  refreshTimer = setInterval(loadRealtime, 30_000)  // 每 30 秒自动轮询刷新
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)  // 组件销毁时清除定时器
})
</script>

<style scoped>
/* ===== 迷你监控面板容器 ===== */
.mini-monitor {
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.mini-monitor :deep(.el-collapse-item__header) {
  padding-left: 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  background-color: var(--aside-bg);
  height: 40px;
}

.mini-monitor :deep(.el-collapse-item__content) {
  padding: 8px 12px 12px;
  background-color: var(--aside-bg);
}

/* ===== 指标卡片网格 ===== */
.mini-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mini-card {
  background: #fff;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px 8px;
  text-align: center;
}

.mini-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.mini-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.mini-value small {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-secondary);
  margin-left: 2px;
}

/* 错误数过高时标红 */
.mini-value.has-error {
  color: #f56c6c;
}
</style>
