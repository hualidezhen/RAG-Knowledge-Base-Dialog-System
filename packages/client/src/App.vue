<template>
  <!-- 根级路由出口，根据 URL 渲染对应的视图组件 -->
  <router-view />
</template>

<style>
/* ===== 全局样式重置 ===== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* 根元素撑满视口，禁止滚动溢出 */
html, body, #app {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* ===== CSS 变量定义 ===== */
:root {
  --aside-bg: #f5f7fa;         /* 侧边栏背景色 */
  --main-bg: #ffffff;           /* 主区域背景色 */
  --border-color: #e4e7ed;      /* 边框颜色 */
  --header-bg: #f0f2f5;         /* 页眉背景色 */
  --text-primary: #303133;      /* 主要文字颜色 */
  --text-secondary: #909399;    /* 次要文字颜色 */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06);   /* 小阴影 */
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);  /* 中阴影 */
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);  /* 大阴影 */
  --transition-fast: 0.15s ease;    /* 快速过渡 */
  --transition-normal: 0.25s ease;  /* 常规过渡 */
}

/* ===== 全局淡入淡出过渡 ===== */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-normal);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
