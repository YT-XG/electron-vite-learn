import { BrowserWindow } from 'electron'

/** 弹窗类型 */
export type PopupType = 'notice' | 'permission' | 'update' | 'shareSelect'

/** 弹窗配置选项 */
export interface PopupOptions {
  /** 弹窗类型 */
  type: PopupType
  /** 弹窗宽度 */
  width: number
  /** 弹窗高度 */
  height: number
  /** 是否为 Claude Code 状态通知 */
  isClaudeStatus?: boolean
}

/**
 * 弹窗元数据
 * @description 封装弹窗窗口实例和元数据，供 PopupManager 统一管理
 *              动画由渲染进程 CSS 驱动，此类仅管理窗口引用和销毁
 */
export default class PopupItem {
  /** 唯一标识 */
  readonly id: string

  /** 弹窗类型 */
  readonly type: PopupType

  /** 是否为 Claude 状态通知 */
  readonly isClaudeStatus: boolean

  /** 窗口实例 */
  window: BrowserWindow | null

  /** 弹窗高度 */
  readonly height: number

  /** 弹窗宽度 */
  readonly width: number

  /** 创建时间（用于排序） */
  readonly createdAt: number

  /** 槽位索引（由 PopupManager 分配，-1 表示未分配） */
  slotIndex = -1

  /**
   * 构造函数
   * @param options - 弹窗配置
   * @param window - 浏览器窗口实例
   */
  constructor(options: PopupOptions, window: BrowserWindow) {
    this.id = `popup-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    this.type = options.type
    this.isClaudeStatus = options.isClaudeStatus ?? false
    this.window = window
    this.height = options.height
    this.width = options.width
    this.createdAt = Date.now()
  }

  /**
   * 立即销毁弹窗
   * @description 直接销毁窗口，不播放动画（用于 destroyAll 等同步清理场景）
   */
  destroyImmediate(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
  }

  /**
   * 检查窗口是否存活
   * @returns 窗口是否存活
   */
  isAlive(): boolean {
    return this.window !== null && !this.window.isDestroyed()
  }
}
