import { createApp } from 'vue'  // Vue 应用创建函数
import { createPinia } from 'pinia'  // Pinia 状态管理库
import ElementPlus from 'element-plus'  // Element Plus UI 组件库
import 'element-plus/dist/index.css'  // 导入 Element Plus 默认样式
import * as ElementPlusIconsVue from '@element-plus/icons-vue'  // 导入所有 Element Plus 图标组件
import App from './App.vue'  // 根组件
import router from './router'  // 路由配置

const app = createApp(App)

app.use(createPinia())  // 注册 Pinia 状态管理
app.use(router)  // 注册 Vue Router
app.use(ElementPlus)  // 注册 Element Plus 组件库

// 全局注册所有图标组件，可在模板中直接通过 <el-icon> 使用
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.mount('#app')  // 挂载 Vue 应用到 #app DOM 节点
