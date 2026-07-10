// src/main/frame/PopupManager.ts
import { BrowserWindow, screen } from 'electron'
import PopupItem, { type PopupOptions } from './PopupItem'
import { getBottomMargin } from '../utils/platform'

/** 通知类型 */
export type NoticeType = 'default' | 'success' | 'error' | 'warning'

/** 通知配置选项 */
export interface NoticeOptions {
  /** 通知文本内容 */
  text: string
  /** 是否显示翻译按钮，默认 false */
  showTranslate?: boolean
  /** 显示时长（毫秒），默认 5000，传 0 表示持久显示 */
  duration?: number
  /** 通知类型，默认 'default' */
  type?: NoticeType
}

/** 动画动作 */
type PopupAnimationAction = 'enter' | 'exit'

const ANIMATION_DURATION_MS = 350 // 必须与 CSS transition 时长一致（含 buffer）

/**
 * 统一弹窗管理器
 * @description 管理所有通知弹窗的槽位分配、生命周期和动画控制
 *
 * 布局模型：固定 5 个槽位，从屏幕右下角开始堆叠
 * - 槽位 0 在最底部，槽位 4 在最顶部
 * - 新通知自动填充最低可用空槽位
 * - 每个槽位的 Y 坐标在创建时根据下方已填充槽位计算，之后不再变化
 * - 销毁弹窗后位置不变，空槽由后续新通知填充
 *
 * 动画模型：由渲染进程 CSS 驱动
 * - 主进程创建窗口并定位到最终 (x, y) 坐标
 * - 主进程通过 IPC 发送 { action: 'enter' | 'exit' }
 * - 渲染进程 CSS transition 处理滑入/滑出动画
 * - 主进程等待 ANIMATION_DURATION_MS 后销毁窗口（exit 时）
 */
export default class PopupManager {
  /** 最大同时显示弹窗数 */
  private readonly MAX_SLOTS = 5

  /** 弹窗间距（像素） */
  private readonly POPUP_GAP = 8

  /** 距屏幕右侧间距（像素） */
  private readonly RIGHT_MARGIN = 16

  /** 距屏幕底部间距（像素） */
  private readonly BOTTOM_MARGIN = 60

  /** 固定槽位数组，null 表示空槽 */
  private slots: (PopupItem | null)[] = new Array(this.MAX_SLOTS).fill(null)

  // ========== 公共方法 ==========

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
    const slotIndex = this.getFreeSlot()
    if (slotIndex === null) {
      // 所有槽位已满，丢弃最早的
      this.destroySlot(0)
      return this.showNotice(createWindowFn, popupOptions, noticeOptions)
    }

    // 创建窗口
    const window = createWindowFn()
    const popup = new PopupItem(popupOptions, window)
    popup.slotIndex = slotIndex

    // 定位并显示
    this.positionPopup(popup)
    this.playAnimation(popup, 'enter')

    // 存入槽位
    this.slots[slotIndex] = popup

    // 设置销毁定时器
    if (duration > 0) {
      setTimeout(() => {
        this.destroySlot(slotIndex)
      }, duration)
    }

    return popup
  }

  /**
   * 显示或更新 Claude 状态通知
   * @description 如果状态通知不存在则创建，已存在则更新内容
   * @param status - 状态文本
   * @param createWindowFn - 创建窗口的函数，返回 BrowserWindow
   * @param updateContentFn - 更新内容的函数，接收 (window, text)
   */
  showClaudeStatus(
    text: string,
    createWindowFn: () => BrowserWindow,
    updateContentFn: (window: BrowserWindow, text: string) => void
  ): PopupItem {
    // 检查是否已有 Claude 状态弹窗
    const existing = this.slots.find(
      (s) => s !== null && s.type === 'notice' && this.isClaudeStatusPopup(s)
    )
    if (existing) {
      updateContentFn(existing.window!, text)
      return existing
    }

    // 创建新弹窗
    const slotIndex = this.getFreeSlot()
    if (slotIndex === null) return this.showClaudeStatus(text, createWindowFn, updateContentFn)

    const window = createWindowFn()
    const popup = new PopupItem({ type: 'notice', width: 500, height: 60, isClaudeStatus: true }, window)
    popup.slotIndex = slotIndex

    this.positionPopup(popup)
    this.playAnimation(popup, 'enter')

    this.slots[slotIndex] = popup

    // 内容更新在渲染进程就绪后进行
    window.webContents.once('did-finish-load', () => {
      updateContentFn(window, text)
    })
    if (!window.webContents.isLoading()) {
      updateContentFn(window, text)
    }

    return popup
  }

  /**
   * 隐藏 Claude 状态通知
   */
  hideClaudeStatus(): void {
    const idx = this.slots.findIndex(
      (s) => s !== null && s.type === 'notice' && this.isClaudeStatusPopup(s)
    )
    if (idx !== -1) {
      this.destroySlot(idx)
    }
  }

  /**
   * 显示或更新权限请求弹窗
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
    // 检查是否已有权限弹窗（排除已销毁的窗口）
    const existing = this.slots.find((s) => s !== null && s.type === 'permission' && s.isAlive())
    if (existing) {
      showContentFn(existing.window!)
      return existing
    }
    // 清理已销毁的 permission 槽位
    const deadIdx = this.slots.findIndex((s) => s !== null && s.type === 'permission' && !s.isAlive())
    if (deadIdx !== -1) this.slots[deadIdx] = null

    const slotIndex = this.getFreeSlot()
    if (slotIndex === null) return this.showPermissionNotice(createWindowFn, popupOptions, showContentFn)

    const window = createWindowFn()
    const popup = new PopupItem(popupOptions, window)
    popup.slotIndex = slotIndex

    this.positionPopup(popup)
    showContentFn(window)
    this.playAnimation(popup, 'enter')

    this.slots[slotIndex] = popup

    return popup
  }

  /**
   * 销毁权限请求弹窗
   */
  destroyPermissionNotice(): void {
    const idx = this.slots.findIndex((s) => s !== null && s.type === 'permission')
    if (idx !== -1) {
      this.destroySlot(idx)
    }
  }

  /**
   * 显示更新通知
   * @param createWindowFn - 创建窗口的函数，返回 BrowserWindow
   * @param popupOptions - 弹窗配置
   * @param showContentFn - 显示内容的函数，接收 (window, x, y)
   * @returns PopupItem 实例
   */
  showUpdateNotice(
    createWindowFn: () => BrowserWindow,
    popupOptions: PopupOptions,
    showContentFn: (window: BrowserWindow) => void
  ): PopupItem {
    const slotIndex = this.getFreeSlot()
    if (slotIndex === null) {
      this.destroySlot(0)
      return this.showUpdateNotice(createWindowFn, popupOptions, showContentFn)
    }

    const window = createWindowFn()
    const popup = new PopupItem(popupOptions, window)
    popup.slotIndex = slotIndex

    // 先显示内容，然后定位并播放动画
    showContentFn(window)
    this.positionPopup(popup)
    this.playAnimation(popup, 'enter')

    this.slots[slotIndex] = popup

    return popup
  }

  // ========== 槽位管理 ==========

  /**
   * 获取最低可用空槽位
   * @description 先清理已失效的槽位（窗口被外部销毁的情况），再返回最低空槽
   * @returns 槽位索引，无空槽返回 null
   */
  private getFreeSlot(): number | null {
    // 清理已失效的槽位（帧被外部销毁时，窗口引用已失效但槽位未清理）
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] !== null && !this.slots[i]!.isAlive()) {
        this.slots[i] = null
      }
    }
    const idx = this.slots.findIndex((s) => s === null)
    return idx >= 0 ? idx : null
  }

  /**
   * 销毁指定槽位的弹窗（播退出动画后销毁）
   * @param slotIndex - 槽位索引
   */
  private async destroySlot(slotIndex: number): Promise<void> {
    const popup = this.slots[slotIndex]
    if (!popup) return

    // 播退出动画
    this.playAnimation(popup, 'exit')

    // 等待动画完成
    await this.sleep(ANIMATION_DURATION_MS)

    // 销毁窗口
    popup.destroyImmediate()
    this.slots[slotIndex] = null
  }

  // ========== 定位 & 动画 ==========

  /**
   * 计算弹窗在屏幕上的位置并设置
   * @param popup - 弹窗项
   */
  private positionPopup(popup: PopupItem): void {
    if (!popup.isAlive()) return

    const { x, y } = this.calcPopupPosition(popup.slotIndex, popup.height, popup.width)
    // 使用 setBounds 同时设置位置和尺寸（窗口创建时可能有不同尺寸）
    popup.window!.setBounds({ x, y, width: popup.width, height: popup.height })
    popup.window!.showInactive()
  }

  /**
   * 计算指定槽位的屏幕坐标
   * @param slotIndex - 槽位索引（0=最底）
   * @param popupHeight - 弹窗高度
   * @param popupWidth - 弹窗宽度
   * @returns { x, y }
   */
  private calcPopupPosition(
    slotIndex: number,
    popupHeight: number,
    popupWidth: number
  ): { x: number; y: number } {
    const display = screen.getPrimaryDisplay()
    const { workArea } = display

    // X：右对齐
    const x = workArea.x + workArea.width - popupWidth - this.RIGHT_MARGIN

    // Y：从底部往上计算
    const bottomMargin = getBottomMargin(this.BOTTOM_MARGIN)
    let y = workArea.y + workArea.height - bottomMargin - popupHeight

    // 累加下方所有已填充槽位的高度 + gap
    for (let i = 0; i < slotIndex; i++) {
      const slot = this.slots[i]
      if (slot !== null) {
        y -= slot.height + this.POPUP_GAP
      }
    }

    return { x: Math.round(x), y: Math.round(y) }
  }

  /**
   * 通过 IPC 发送动画指令到渲染进程
   * @param popup - 弹窗项
   * @param action - 动画动作
   */
  private playAnimation(popup: PopupItem, action: PopupAnimationAction): void {
    if (!popup.isAlive()) return

    // 通过窗口类型确定 IPC 频道名
    const channel = this.getAnimateChannel(popup)
    popup.window!.webContents.send(channel, { action })
  }

  /**
   * 根据弹窗类型获取动画 IPC 频道名
   */
  private getAnimateChannel(popup: PopupItem): string {
    switch (popup.type) {
      case 'notice':
        return 'to-renderer-NoticeNewFrame:animate'
      case 'permission':
        return 'to-renderer-PermissionNoticeFrame:animate'
      case 'update':
        return 'to-renderer-UpdateNewFrame:animate'
      case 'shareSelect':
        return 'to-renderer-ShareSelectFrame:animate'
    }
  }

  /**
   * 判断弹窗是否为 Claude 状态弹窗
   */
  private isClaudeStatusPopup(popup: PopupItem): boolean {
    return popup.isClaudeStatus === true
  }

  // ========== 生命周期 ==========

  /**
   * 销毁所有弹窗（同步，不播放动画）
   */
  destroyAll(): void {
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] !== null) {
        this.slots[i]!.destroyImmediate()
        this.slots[i] = null
      }
    }
  }

  /**
   * 获取当前弹窗数量
   */
  getPopupCount(): number {
    return this.slots.filter((s) => s !== null).length
  }

  /**
   * 按槽位索引销毁通知（供持久通知手动关闭）
   * @param slotIndex - 槽位索引
   */
  destroySlotByIndex(slotIndex: number): void {
    this.destroySlot(slotIndex)
  }

  /**
   * 延迟工具
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// 导出常量
export const POPUP_GAP = 8

// 导出单例
export const popupManager = new PopupManager()
