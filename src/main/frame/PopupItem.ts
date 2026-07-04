import { BrowserWindow } from 'electron'

/** 弹窗类型 */
export type PopupType = 'notice' | 'permission' | 'update'

/** 弹窗配置选项 */
export interface PopupOptions {
  /** 弹窗类型 */
  type: PopupType
  /** 弹窗宽度 */
  width: number
  /** 弹窗高度 */
  height: number
  /** 是否为 Claude 状态通知 */
  isClaudeStatus?: boolean
}

/**
 * 弹窗元数据
 * @description 封装弹窗窗口实例和元数据，供 PopupManager 统一管理
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

  /** 隐藏动画定时器 */
  #hideTimer: ReturnType<typeof setTimeout> | null = null

  /** 目标 Y 坐标（由 PopupManager 设置） */
  targetY = 0

  /** 动画起始 Y 坐标 */
  animStartY = 0

  /** 动画开始时间戳 */
  animStartTime = 0

  /** 动画时长（毫秒），0 表示不在动画中 */
  animDuration = 0

  /** 销毁目标 Y 坐标（屏幕底部外，由 PopupManager 设置） */
  destroyingTargetY = 0

  /** 是否正在销毁中（动画播放期间为 true，用于 repositionAll 跳过） */
  #isDestroying = false

  /**
   * 是否正在销毁中
   * @description 从调用 destroy() 开始到动画完成，此标记为 true
   */
  get isDestroying(): boolean {
    return this.#isDestroying
  }

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
   * 直接移动到目标 Y 坐标（不再做动画，动画由 PopupManager 驱动）
   * @param targetY - 目标 Y 坐标
   * @param _animated - 保留参数以兼容调用方，已无实际作用
   */
  moveTo(targetY: number, _animated?: boolean): void {
    if (!this.window || this.window.isDestroyed()) return
    const [x] = this.window.getPosition()
    this.window.setPosition(x, targetY)
  }

  /**
   * 销毁弹窗（不播动画，动画由 PopupManager 前置完成）
   */
  async destroy(): Promise<void> {
    this.#isDestroying = true
    // 清除定时器
    if (this.#hideTimer) {
      clearTimeout(this.#hideTimer)
      this.#hideTimer = null
    }
    this.#cleanupWindow()
  }

  /**
   * 立即销毁弹窗（不播放动画）
   * @description 用于 destroyAll 等需要同步清理的场景
   */
  destroyImmediate(): void {
    this.#isDestroying = true
    // 清除定时器
    if (this.#hideTimer) {
      clearTimeout(this.#hideTimer)
      this.#hideTimer = null
    }
    // 立即销毁窗口
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
  }

  /**
   * 清理窗口资源
   * @description 动画结束后调用，销毁窗口并释放引用
   */
  #cleanupWindow(): void {
    // 销毁窗口
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
  }

  /**
   * 获取窗口当前 Y 坐标
   * @returns Y 坐标，窗口不存在时返回 0
   */
  getY(): number {
    if (!this.window || this.window.isDestroyed()) return 0
    const [, y] = this.window.getPosition()
    return y
  }

  /**
   * 仅设置窗口 Y 坐标，不做动画
   * @param y - 目标 Y 坐标
   */
  setPositionY(y: number): void {
    if (!this.window || this.window.isDestroyed()) return
    const [x] = this.window.getPosition()
    this.window.setPosition(x, y)
  }

  /**
   * 检查窗口是否存活
   * @description 正在销毁中的弹窗也视为不存活
   * @returns 窗口是否存活
   */
  isAlive(): boolean {
    return !this.#isDestroying && this.window !== null && !this.window.isDestroyed()
  }

  /**
   * 标记弹窗为销毁状态（由 PopupManager.removePopup 调用）
   */
  markDestroying(): void {
    this.#isDestroying = true
  }
}
