import axios from 'axios'
import { ElMessage } from 'element-plus'

/**
 * Axios HTTP 客户端实例
 *
 * - baseURL: 留空表示使用相对路径，由代理或部署配置决定实际后端地址
 * - timeout: 300 秒超时（SSE 流式聊天需要较长的等待时间）
 */
const request = axios.create({
  baseURL: '',
  timeout: 300000,
})

/**
 * 响应拦截器 —— 统一处理 HTTP 错误，并通过 Element Plus 消息组件提示用户
 */
request.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // 服务器返回了错误状态码
      const { status } = error.response
      switch (status) {
        case 500:
          // 后端未捕获异常或内部处理失败
          ElMessage.error('服务器错误')
          break
        case 404:
          // 请求的资源路径不存在
          ElMessage.error('请求的资源不存在')
          break
        case 400:
          // 请求参数校验失败（如缺少必填字段、格式错误）
          ElMessage.error('请求参数错误')
          break
        default:
          // 其他未明确映射的 HTTP 错误码
          ElMessage.error(`请求失败 (${status})`)
      }
    } else if (error.code === 'ECONNABORTED') {
      // 请求超时（超出 timeout 配置的时间）
      ElMessage.error('请求超时')
    } else {
      // 网络断开、DNS 解析失败等无法到达服务器的错误
      ElMessage.error('网络错误')
    }
    return Promise.reject(error)
  }
)

export default request
