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

  /** 弹窗之间的间距（像素） */
  private readonly GAP = 8

  /** 距屏幕底部间距（像素） */
  private readonly BOTTOM_MARGIN = 60

  /** 当前存活的弹窗列表（索引 0 = 最新，越往后越旧） */
  private popups: PopupItem[] = []

  /** Claude 状态通知（特殊管理，单例） */
  private claudeStatusPopup: PopupItem | null = null

  /** 权限请求弹窗（特殊管理，单例） */
  private permissionPopup: PopupItem | null = null

  /** 弹窗数量变化回调函数 */
  private onPopupCountChange: (() => void) | null = null

  /**
   * 设置弹窗数量变化回调函数
   * @param callback - 回调函数
   */
  setOnPopupCountChange(callback: () => void): void {
    this.onPopupCountChange = callback
  }

  // ========== 显示方法 ==========

  /**
   * 显示普通通知
   * @param createWindowFn - 创建窗口的函数，返回 BrowserWindow
   * @param popupOptions - 弹窗配置
   * @param noticeOptions - 通知配置
   * @returns PopupItem 实例
   */
  showNotice(
    createWindowFn: () => BrowserWindow,
    popupOptions: PopupOptions,
    noticeOptions: NoticeOptions
  ): PopupItem {
    const { duration = 5000 } = noticeOptions

    // 如果已达到上限，销毁最早的（最上面的）弹窗
    if (this.popups.length >= this.MAX_POPUPS) {
      const oldest = this.popups[this.popups.length - 1]
      this.removePopup(oldest)
    }

    // 创建新弹窗
    const window = createWindowFn()
    const popup = new PopupItem(popupOptions, window)

    // 设置销毁定时器
    if (duration > 0) {
      setTimeout(() => {
        this.removePopup(popup)
      }, duration)
    }

    // 添加到列表头部
    this.popups.unshift(popup)

    // 重新排列所有弹窗位置
    this.repositionAll()

    return popup
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
      // 已存在 → 更新内容
      updateContentFn(this.claudeStatusPopup.window!, text, 'default')
    } else {
      // 不存在 → 创建新弹窗
      const window = createWindowFn()
      const popup = new PopupItem(
        { type: 'notice', width: window.getBounds().width, height: 60, isClaudeStatus: true },
        window
      )

      updateContentFn(window, text, 'default')

      this.claudeStatusPopup = popup
      this.popups.unshift(popup)

      // 显示弹窗
      window.showInactive()
    }

    // 重新排列所有弹窗位置
    this.repositionAll()
  }

  /**
   * 隐藏 Claude 状态通知
   * @description 销毁状态通知并从堆叠中移除
   */
  hideClaudeStatus(): void {
    if (this.claudeStatusPopup) {
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
      this.removePopup(this.permissionPopup)
      this.permissionPopup = null
    }
  }

  /**
   * 显示更新通知
   * @param createWindowFn - 创建窗口的函数，返回 BrowserWindow
   * @param popupOptions - 弹窗配置
   * @param showContentFn - 显示内容的函数
   * @returns PopupItem 实例
   */
  showUpdateNotice(
    createWindowFn: () => BrowserWindow,
    popupOptions: PopupOptions,
    showContentFn: (window: BrowserWindow) => void
  ): PopupItem {
    // 如果已达到上限，销毁最早的弹窗
    if (this.popups.length >= this.MAX_POPUPS) {
      const oldest = this.popups[this.popups.length - 1]
      this.removePopup(oldest)
    }

    // 创建新弹窗
    const window = createWindowFn()
    const popup = new PopupItem(popupOptions, window)

    showContentFn(window)

    // 添加到列表头部
    this.popups.unshift(popup)

    // 显示弹窗
    window.showInactive()

    // 重新排列所有弹窗位置
    this.repositionAll()

    return popup
  }

  // ========== 通用方法 ==========

  /**
   * 移除指定弹窗并重新排列
   * @param popup - 要移除的弹窗
   */
  private removePopup(popup: PopupItem): void {
    const index = this.popups.indexOf(popup)
    if (index !== -1) {
      this.popups.splice(index, 1)
    }

    // 销毁弹窗（带动画）
    popup.destroy()

    // 重新排列所有弹窗
    this.repositionAll()
  }

  /**
   * 重新计算所有弹窗位置并平滑移动
   * @description 从底部开始堆叠，每个弹窗占据 height + gap 的空间
   */
  private repositionAll(): void {
    for (let i = 0; i < this.popups.length; i++) {
      const popup = this.popups[i]
      const targetY = this.calcY(i)
      popup.moveTo(targetY, true)
    }

    // 通知 UpdateNewFrame 重新定位
    if (this.onPopupCountChange) {
      this.onPopupCountChange()
    }
  }

  /**
   * 计算第 index 个弹窗的 Y 坐标
   * @param index - 从底部开始的索引（0 = 最底部，最新）
   * @returns Y 坐标
   */
  private calcY(index: number): number {
    const display = screen.getPrimaryDisplay()
    const { workArea } = display
    const screenHeight = workArea.height + workArea.y

    // macOS 需要额外加上 Dock 高度
    const bottomMargin = getBottomMargin(this.BOTTOM_MARGIN)

    // 从底部开始累加高度
    let y = screenHeight - bottomMargin
    for (let i = 0; i <= index; i++) {
      y -= this.popups[i].height
      if (i < index) {
        y -= this.GAP
      }
    }

    return Math.round(y)
  }

  /**
   * 销毁所有弹窗
   */
  destroyAll(): void {
    for (const popup of this.popups) {
      popup.destroy()
    }
    this.popups = []
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
   * 获取所有弹窗
   * @returns 弹窗列表
   */
  getPopups(): PopupItem[] {
    return [...this.popups]
  }
}
