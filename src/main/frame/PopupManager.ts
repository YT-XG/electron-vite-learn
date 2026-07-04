// src/main/frame/PopupManager.ts
import { BrowserWindow, screen } from 'electron'
import PopupItem, { type PopupOptions } from './PopupItem'
import { getBottomMargin } from '../utils/platform'

/** 通知类型 */
export type NoticeType = 'default' | 'success' | 'error' | 'warning'

/** Claude Code 状态类型 */
export type ClaudeCodeStatus =
  | 'running' // 🟢 会话运行中
  | 'thinking' // 💭 思考中...
  | 'executing' // ⚡ 执行任务中
  | 'waiting_permission' // ⏳ 等待权限确认
  | 'completed' // ✅ 任务完成

/** 状态配置映射 */
const STATUS_CONFIG: Record<ClaudeCodeStatus, { icon: string; text: string }> = {
  running: { icon: '🟢', text: 'Claude Code 会话运行中' },
  thinking: { icon: '💭', text: '思考中...' },
  executing: { icon: '⚡', text: '执行任务中' },
  waiting_permission: { icon: '⏳', text: '等待权限确认' },
  completed: { icon: '✅', text: '任务完成' }
}

/** 弹窗间距常量（像素），供外部模块使用 */
export const POPUP_GAP = 8

/** 通知配置选项 */
export interface NoticeOptions {
  /** 通知文本内容 */
  text: string
  /** 是否显示翻译按钮，默认 false */
  showTranslate?: boolean
  /** 显示时长（毫秒），默认 5000 */
  duration?: number
  /** 通知类型，默认 'default' */
  type?: NoticeType
}

/**
 * 统一弹窗管理器
 * @description 管理所有底部弹窗的位置和生命周期，支持通知堆叠、自定义时长和移动动画
 */
export default class PopupManager {
  /** 最大同时显示弹窗数 */
  private readonly MAX_POPUPS = 5

  /** 弹窗之间的间距（像素），引用导出常量 */
  private readonly GAP = POPUP_GAP

  /** 距屏幕底部间距（像素） */
  private readonly BOTTOM_MARGIN = 60

  /** 当前存活的弹窗列表（索引 0 = 最新，越往后越旧） */
  private popups: PopupItem[] = []

  /** Claude 状态通知（特殊管理，单例） */
  private claudeStatusPopup: PopupItem | null = null

  /** 权限请求弹窗（特殊管理，单例） */
  private permissionPopup: PopupItem | null = null

  /** 单帧动画循环定时器 */
  #animationTimer: ReturnType<typeof setTimeout> | null = null

  /** 销毁中的弹窗列表（与 popups 分离，避免干扰堆叠计算） */
  #destroyingPopups: PopupItem[] = []

  // ========== 显示方法 ==========

  /**
   * 显示普通通知
   * @param createWindowFn - 创建窗口的函数，返回 BrowserWindow
   * @param popupOptions - 弹窗配置
   * @param noticeOptions - 通知配置
   * @returns PopupItem 实例和计算出的目标 Y 坐标
   */
  showNotice(
    createWindowFn: () => BrowserWindow,
    popupOptions: PopupOptions,
    noticeOptions: NoticeOptions
  ): { popup: PopupItem; targetY: number } {
    const { duration = 5000 } = noticeOptions

    // 如果已达到上限，销毁最早的（最上面的）弹窗
    if (this.popups.length >= this.MAX_POPUPS) {
      const oldest = this.popups[this.popups.length - 1]
      this.removePopup(oldest)
    }

    // 先计算新弹窗的目标位置（此时数组还未插入）
    const targetY = this.calcY(0)

    // 创建新弹窗
    const window = createWindowFn()
    const popup = new PopupItem(popupOptions, window)

    // 插入到列表头部（新弹窗在最底部）
    this.popups.unshift(popup)

    // 预先设置 targetY，让 repositionAll 认为无变化，跳过动画设置
    // 新弹窗由调用方的 showAtBottomCenter(targetY) 直接定位
    popup.targetY = targetY
    popup.animDuration = 0

    // 重新排列已有弹窗（跳过新弹窗，因为 targetY 已匹配）
    this.repositionAll()

    // 设置销毁定时器
    if (duration > 0) {
      setTimeout(() => {
        this.removePopup(popup)
      }, duration)
    }

    return { popup, targetY }
  }

  /**
   * 显示或更新 Claude 状态通知
   * @description 如果状态通知不存在则创建，已存在则更新内容
   * @param status - 状态类型
   * @param customText - 自定义状态文本（可选）
   * @param createWindowFn - 创建窗口的函数，返回 BrowserWindow
   * @param updateContentFn - 更新内容的函数
   */
  showClaudeStatus(
    status: ClaudeCodeStatus,
    customText: string | undefined,
    createWindowFn: () => BrowserWindow,
    updateContentFn: (window: BrowserWindow, text: string, type: NoticeType) => void
  ): void {
    const config = STATUS_CONFIG[status]
    const text = customText || config.text

    if (this.claudeStatusPopup && this.claudeStatusPopup.isAlive()) {
      // 已存在 → 更新内容（位置由动画循环管理）
      updateContentFn(this.claudeStatusPopup.window!, text, 'default')
      return // 内容更新不需要 reposition
    }

    // 不存在 → 创建新弹窗
    const window = createWindowFn()
    const popup = new PopupItem(
      { type: 'notice', width: window.getBounds().width, height: 60, isClaudeStatus: true },
      window
    )

    this.claudeStatusPopup = popup
    this.popups.unshift(popup)

    // 设置初始动画参数（窗口还没 show，动画在显示前就会完成）
    popup.targetY = this.calcY(0)
    popup.animStartY = popup.getY()
    popup.animStartTime = Date.now()
    popup.animDuration = 300

    // 等待渲染进程就绪后发送消息并显示窗口
    window.webContents.once('did-finish-load', () => {
      updateContentFn(window, text, 'default')
      window.showInactive()
    })

    if (window.webContents.isLoading() === false) {
      updateContentFn(window, text, 'default')
      window.showInactive()
    }

    // 重新排列已有弹窗
    this.repositionAll()
  }

  /**
   * 隐藏 Claude 状态通知
   * @description 销毁状态通知并从堆叠中移除
   */
  hideClaudeStatus(): void {
    if (this.claudeStatusPopup) {
      // 异步销毁，不等待完成
      this.removePopup(this.claudeStatusPopup)
      this.claudeStatusPopup = null
    }
  }

  /**
   * 显示或更新权限请求弹窗
   * @description 如果权限弹窗不存在则创建，已存在则更新内容
   * @param createWindowFn - 创建窗口的函数，返回 BrowserWindow
   * @param popupOptions - 弹窗配置
   * @param showContentFn - 显示内容的函数
   * @returns PopupItem 实例
   */
  showPermissionNotice(
    createWindowFn: () => BrowserWindow,
    popupOptions: PopupOptions,
    showContentFn: (window: BrowserWindow) => void
  ): PopupItem {
    if (this.permissionPopup && this.permissionPopup.isAlive()) {
      // 已存在 → 更新内容
      showContentFn(this.permissionPopup.window!)
      return this.permissionPopup
    }

    // 不存在 → 创建新弹窗
    const window = createWindowFn()
    const popup = new PopupItem(popupOptions, window)

    showContentFn(window)

    this.permissionPopup = popup
    this.popups.unshift(popup)

    // 设置初始动画参数
    popup.targetY = this.calcY(0)
    popup.animStartY = popup.getY()
    popup.animStartTime = Date.now()
    popup.animDuration = 300

    // 显示弹窗
    window.showInactive()

    // 重新排列所有弹窗位置
    this.repositionAll()

    return popup
  }

  /**
   * 销毁权限请求弹窗
   */
  destroyPermissionNotice(): void {
    if (this.permissionPopup) {
      // 异步销毁，不等待完成
      this.removePopup(this.permissionPopup)
      this.permissionPopup = null
    }
  }

  /**
   * 显示更新通知
   * @param createWindowFn - 创建窗口的函数，返回 BrowserWindow
   * @param popupOptions - 弹窗配置
   * @param showContentFn - 显示内容的函数，接收 window 和 y 坐标
   * @returns PopupItem 实例
   */
  showUpdateNotice(
    createWindowFn: () => BrowserWindow,
    popupOptions: PopupOptions,
    showContentFn: (window: BrowserWindow, y: number) => void
  ): PopupItem {
    // 如果已达到上限，销毁最早的弹窗
    if (this.popups.length >= this.MAX_POPUPS) {
      const oldest = this.popups[this.popups.length - 1]
      this.removePopup(oldest)
    }

    // 先计算新弹窗的目标位置
    const targetY = this.calcY(0)

    // 创建新弹窗
    const window = createWindowFn()
    const popup = new PopupItem(popupOptions, window)

    // 插入到列表头部
    this.popups.unshift(popup)

    // 先调用 showContentFn 将窗口定位到屏幕底部外（startY）
    // 这样才能正确捕获动画起始位置
    showContentFn(window, targetY)

    // 再捕获动画起始位置（此时窗口已在 screenHeight + 10）
    // 帧循环 #tick 会驱动从下方到 targetY 的入场动画
    popup.targetY = targetY
    popup.animStartY = popup.getY()
    popup.animStartTime = Date.now()
    popup.animDuration = 400 // 入场动画稍长

    // 重新排列已有弹窗
    this.repositionAll()

    return popup
  }

  // ========== 通用方法 ==========

  /**
   * 移除指定弹窗（加入销毁列表，由帧循环驱动滑出动画）
   * @description 从活跃数组移除后立即 repositionAll（其余弹窗填位），
   *              销毁弹窗加入 destroyingPopups 由 #tick 驱动滑出
   * @param popup - 要移除的弹窗
   */
  private removePopup(popup: PopupItem): void {
    // 已在销毁中则跳过
    if (popup.isDestroying) return

    // 从活跃弹窗列表移除
    const index = this.popups.indexOf(popup)
    if (index !== -1) {
      this.popups.splice(index, 1)
    }

    // 标记销毁状态
    popup.markDestroying()

    // 加入销毁列表
    this.#destroyingPopups.push(popup)

    // 设置销毁动画参数
    const currentY = popup.getY()
    popup.destroyingTargetY = this.#getScreenBottomY()
    popup.animStartY = currentY
    popup.animStartTime = Date.now()
    popup.animDuration = 250 // 销毁动画稍快

    // 清理可能存在的定时器
    // 剩余弹窗重新填位
    this.repositionAll()
  }

  /**
   * 确保动画循环正在运行
   * @description 如果循环未启动或已停止，重新启动
   */
  #ensureAnimationLoop(): void {
    if (this.#animationTimer !== null) return
    this.#animationTimer = setTimeout(this.#tick.bind(this), 16)
  }

  /**
   * 单帧动画循环
   * @description 驱动所有活跃弹窗和销毁弹窗的位置动画
   *              - 活跃弹窗：easeOutCubic 缓动到 targetY
   *              - 销毁弹窗：easeInCubic 缓动到 destroyingTargetY（屏幕底部外）
   *              所有弹窗到达目标后停止循环
   */
  #tick(): void {
    let hasActiveAnim = false

    // 1) 驱动活跃弹窗
    const activePopups = this.popups.filter((p) => !p.isDestroying)
    for (const popup of activePopups) {
      if (popup.animDuration <= 0) continue // 未在动画中

      // 检查窗口是否被外部销毁
      if (!popup.window || popup.window.isDestroyed()) {
        popup.animDuration = 0
        continue
      }

      const elapsed = Date.now() - popup.animStartTime
      const progress = Math.min(elapsed / popup.animDuration, 1)
      // easeOutCubic：先快后慢，自然停止
      const eased = 1 - Math.pow(1 - progress, 3)
      const currentY = Math.round(popup.animStartY + (popup.targetY - popup.animStartY) * eased)

      popup.setPositionY(currentY)

      if (progress < 1) {
        hasActiveAnim = true
      } else {
        popup.animDuration = 0 // 标记动画完成
      }
    }

    // 2) 驱动销毁弹窗的滑出动画
    for (let i = this.#destroyingPopups.length - 1; i >= 0; i--) {
      const popup = this.#destroyingPopups[i]
      if (!popup.window || popup.window.isDestroyed()) {
        // 窗口已被销毁（可能是外部触发），直接从列表移除
        this.#destroyingPopups.splice(i, 1)
        continue
      }

      const elapsed = Date.now() - popup.animStartTime
      const progress = Math.min(elapsed / popup.animDuration, 1)
      // easeInCubic：先慢后快，自然离开
      const easeInCubic = progress * progress * progress
      const currentY = Math.round(popup.animStartY + (popup.destroyingTargetY - popup.animStartY) * easeInCubic)

      popup.setPositionY(currentY)

      if (progress < 1) {
        hasActiveAnim = true
      } else {
        // 动画完成，彻底销毁窗口
        popup.destroyImmediate()
        this.#destroyingPopups.splice(i, 1)
      }
    }

    // 还有动画未完成时继续循环
    if (hasActiveAnim) {
      this.#animationTimer = setTimeout(this.#tick.bind(this), 16)
    } else {
      this.#animationTimer = null
    }
  }

  /**
   * 获取屏幕底部外 Y 坐标（用于销毁动画的目标位置）
   */
  #getScreenBottomY(): number {
    const display = screen.getPrimaryDisplay()
    const { workArea, bounds } = display
    const dockHeight = process.platform === 'darwin'
      ? bounds.y + bounds.height - (workArea.y + workArea.height)
      : 0
    const screenHeight = workArea.height + workArea.y + dockHeight
    return screenHeight + 10
  }

  /**
   * 重新计算所有弹窗位置并平滑移动
   * @description 从底部开始堆叠，每个弹窗占据 height + gap 的空间
   *   跳过正在销毁中的弹窗（isDestroying），避免动画期间位置计算错误
   */
  private repositionAll(): void {
    const activePopups = this.popups.filter((p) => !p.isDestroying)

    for (let i = 0; i < activePopups.length; i++) {
      const popup = activePopups[i]
      const newTargetY = this.calcYForList(activePopups, i)

      if (popup.targetY !== newTargetY) {
        // 目标变化：从当前位置开始动画
        popup.animStartY = popup.getY()
        popup.animStartTime = Date.now()
        popup.animDuration = 300
        popup.targetY = newTargetY
      }
    }

    // 启动动画循环
    this.#ensureAnimationLoop()
  }

  /**
   * 计算指定弹窗列表中第 index 个弹窗的 Y 坐标
   * @param list - 活跃弹窗列表
   * @param index - 从底部开始的索引（0 = 最底部，最新）
   * @returns Y 坐标
   */
  private calcYForList(list: PopupItem[], index: number): number {
    const display = screen.getPrimaryDisplay()
    const { workArea } = display
    const screenHeight = workArea.height + workArea.y

    // macOS 需要额外加上 Dock 高度
    const bottomMargin = getBottomMargin(this.BOTTOM_MARGIN)

    // 列表为空或 index 越界，返回底部基准位置（用于新弹窗的起始位置）
    if (list.length === 0 || index >= list.length) {
      return Math.round(screenHeight - bottomMargin)
    }

    // 从底部开始累加高度
    let y = screenHeight - bottomMargin
    for (let i = 0; i <= index; i++) {
      y -= list[i].height
      if (i < index) {
        y -= this.GAP
      }
    }

    return Math.round(y)
  }

  /**
   * 计算第 index 个弹窗的 Y 坐标（基于当前活跃弹窗列表）
   * @param index - 从底部开始的索引（0 = 最底部，最新）
   * @returns Y 坐标
   */
  private calcY(index: number): number {
    const activePopups = this.popups.filter((p) => !p.isDestroying)
    return this.calcYForList(activePopups, index)
  }

  /**
   * 销毁所有弹窗（同步，不播放动画）
   * @description 应用退出或需要立即清理时使用
   */
  destroyAll(): void {
    // 清理动画循环
    if (this.#animationTimer) {
      clearTimeout(this.#animationTimer)
      this.#animationTimer = null
    }

    // 立即销毁所有活跃弹窗
    for (const popup of this.popups) {
      popup.destroyImmediate()
    }
    this.popups = []

    // 立即销毁正在销毁的弹窗
    for (const popup of this.#destroyingPopups) {
      popup.destroyImmediate()
    }
    this.#destroyingPopups = []

    this.claudeStatusPopup = null
    this.permissionPopup = null
  }

  /**
   * 获取当前弹窗数量
   * @returns 弹窗数量
   */
  getPopupCount(): number {
    return this.popups.length
  }

  /**
   * 获取所有活跃弹窗（排除正在销毁中的）
   * @returns 活跃弹窗列表
   */
  getPopups(): PopupItem[] {
    return this.popups.filter((p) => !p.isDestroying)
  }
}
