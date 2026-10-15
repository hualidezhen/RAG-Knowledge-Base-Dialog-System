/**
 * 工具注册中心（ToolRegistry）。
 * 管理所有 Agent 可调用工具的注册、查找和执行。
 * 采用 Singleton 单例模式，全局共享一个注册中心实例。
 */

import { Tool, ToolResult } from '../types'
import { getMonitorService } from './monitorService'

export class ToolRegistry {
  /** 内部存储：工具名称 => Tool 对象的映射表 */
  private tools = new Map<string, Tool>()

  /**
   * 注册一个工具。
   * 工具的名称（tool.name）将作为唯一标识符。
   * @param tool 待注册的工具对象
   */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  /**
   * 按名称查找已注册的工具。
   * @param name 工具名称
   * @returns 找到的工具对象，未找到则返回 undefined
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  /**
   * 列出所有已注册的工具。
   * @returns 已注册工具的数组
   */
  list(): Tool[] {
    return Array.from(this.tools.values())
  }

  /**
   * 执行指定名称的工具。
   * 自动记录执行耗时，并通过 MonitorService 采集工具调用指标。
   * 工具不存在或执行失败时返回对应的错误信息（永不抛出异常）。
   * @param name 工具名称
   * @param args 工具参数键值对
   * @returns 工具执行结果（包含成功/失败状态、数据、耗时）
   */
  async execute(name: string, args: Record<string, any>): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      // 工具不存在：记录指标并返回错误结果
      getMonitorService().recordToolMetric(name, 0, false, args)
      return { success: false, error: `Tool '${name}' not found`, durationMs: 0 }
    }

    const startTime = Date.now()
    try {
      const data = await tool.execute(args)
      const duration = Date.now() - startTime
      getMonitorService().recordToolMetric(name, duration, true, args)
      return { success: true, data, durationMs: duration }
    } catch (err: any) {
      const duration = Date.now() - startTime
      getMonitorService().recordToolMetric(name, duration, false, args)
      return { success: false, error: err.message, durationMs: duration }
    }
  }
}

// ---- Singleton 单例模式 ----

let registryInstance: ToolRegistry | null = null

export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry()
  }
  return registryInstance
}
