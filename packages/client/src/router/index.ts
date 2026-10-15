import { createRouter, createWebHistory } from 'vue-router'  // 导入 Vue Router 创建函数和 HTML5 历史模式
import Home from '../views/Home.vue'  // 导入首页组件

const router = createRouter({
  history: createWebHistory(),  // 使用 HTML5 History 模式，支持干净的 URL（无 # 号）
  routes: [
    {
      path: '/',  // 首页路径
      name: 'home',  // 路由名称
      component: Home,  // 直接加载首页组件
    },
    {
      path: '/monitor',  // 监控看板路径
      name: 'monitor',  // 路由名称
      component: () => import('../views/MonitorDashboard.vue'),  // 懒加载监控看板组件，优化首屏加载体积
    },
  ],
})

export default router  // 导出路由实例，供 main.ts 注册到 Vue 应用
