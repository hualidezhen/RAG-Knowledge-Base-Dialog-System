<template>
  <!-- 主布局容器：左侧知识库文档面板 + 右侧对话面板 -->
  <el-container class="app-container">
    <!-- 左侧：知识库管理与文档列表 -->
    <el-aside width="380px" class="app-aside">
      <DocumentPanel />
    </el-aside>
    <!-- 右侧：对话交互区域 -->
    <el-main class="app-main">
      <div class="panel-header">
        <el-icon :size="20"><ChatLineSquare /></el-icon>
        <span>对话区域</span>
      </div>
      <ChatPanel />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { ChatLineSquare } from '@element-plus/icons-vue'
import DocumentPanel from '../components/DocumentPanel.vue'  // 知识库文档面板组件
import ChatPanel from '../components/ChatPanel.vue'  // 对话交互面板组件
</script>

<style scoped>
/* ===== 主布局 ===== */
.app-container {
  height: 100vh;
  width: 100vw;
}

/* ===== 左侧栏 ===== */
.app-aside {
  background-color: var(--aside-bg);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.08);
  position: relative;
  z-index: 1;
}

/* ===== 右侧主区域 ===== */
.app-main {
  background-color: var(--main-bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  background-color: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

/* ===== 响应式布局：移动端适配 ===== */
@media (max-width: 860px) {
  .app-container {
    flex-direction: column;
  }

  .app-aside {
    width: 100% !important;
    height: auto;
    max-height: 45vh;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }

  .message-bubble {
    max-width: 90% !important;
  }
}

@media (max-width: 480px) {
  .app-aside {
    max-height: 35vh;
  }

  .suggestion-grid {
    grid-template-columns: 1fr !important;
  }
}
</style>
