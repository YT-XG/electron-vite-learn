/**
 * Claude Code 常驻状态通知窗口
 * @description 底部居中显示的常驻状态条，用于显示 Claude Code 的运行状态
 *              与 NoticeNewFrame 不同，此窗口不会自动销毁，支持更新状态文本
 */
import { BrowserWindowConstructorOptions, screen } from 'electron'
import BaseFrame from './BaseFrame'
import { getBottomMargin } from '../utils/platform'

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

export default class ClaudeCodeStatusFrame extends BaseFrame {
  /** 弹窗高度 */
  private static readonly POPUP_HEIGHT = 50

  /** 窗口宽度 */
  private static readonly POPUP_WIDTH = 320

  /** 窗口底部距屏幕边缘的间距（像素） */
  private static readonly BOTTOM_MARGIN = 120

  /** 当前状态 */
  #currentStatus: ClaudeCodeStatus = 'running'

  /** 自定义状态文本（可选，覆盖默认文本） */
  #customText: string | null = null

  /** 消息是否已发送给渲染进程 */
  #msgSent = false

  /** 隐藏动画定时器 */
  #hideTimer: ReturnType<typeof setTimeout> | null = null

  /** 窗口配置 - 透明无边框气泡 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: ClaudeCodeStatusFrame.POPUP_WIDTH,
    height: ClaudeCodeStatusFrame.POPUP_HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false
  }

  /** 路由路径 */
  protected readonly routePath = '/claudeCodeStatus'

  /**
   * 更新状态
   * @param status - 状态类型
   * @param customText - 自定义状态文本（可选）
   */
  updateStatus(status: ClaudeCodeStatus, customText?: string): void {
    this.#currentStatus = status
    this.#customText = customText || null

    // 如果窗口已存活，直接发送更新
    if (this.isAlive() && this.#msgSent) {
      this.sendStatusUpdate()
    }
  }

  /**
   * 发送状态更新到渲染进程
   */
  private sendStatusUpdate(): void {
    const config = STATUS_CONFIG[this.#currentStatus]
    const displayText = this.#customText || config.text

    this.sendOne(
      'to-renderer-ClaudeCodeStatusFrame:updateStatus',
      this.#currentStatus,
      config.icon,
      displayText
    )
  }

  /**
   * 注册 IPC 监听器
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 渲染进程已就绪，发送缓存的状态并显示窗口
    this.recvOne('to-main-ClaudeCodeStatusFrame:ready', () => {
      if (!this.#msgSent) {
        this.sendStatusUpdate()
        this.#msgSent = true
      }
    })
  }

  /**
   * 计算屏幕底部居中位置（偏上，避开普通通知）
   * @returns 窗口左上角坐标
   */
  #calcBottomCenterPosition(): { x: number; y: number } {
    const display = screen.getPrimaryDisplay()
    const { workArea } = display

    // 水平居中
    const x = Math.round(workArea.x + (workArea.width - ClaudeCodeStatusFrame.POPUP_WIDTH) / 2)
    // 距底部 120px（比普通通知高 60px，macOS 会额外加上 Dock 高度）
    const bottomMargin = getBottomMargin(ClaudeCodeStatusFrame.BOTTOM_MARGIN)
    const y = Math.round(
      workArea.y + workArea.height - ClaudeCodeStatusFrame.POPUP_HEIGHT - bottomMargin
    )

    return { x, y }
  }

  /**
   * 显示常驻状态通知
   * @description 如果窗口不存在则创建，已存在则更新状态
   * @param overrideY - 覆盖 Y 坐标（由 NoticeManager 传入，协调位置）
   */
  show(overrideY?: number): void {
    this.#clearHideTimer()

    const pos = this.#calcBottomCenterPosition()
    const y = overrideY ?? pos.y

    if (!this.isAlive()) {
      // 窗口不存在 → 创建新窗口
      this.#msgSent = false
      this.create()
      // 设置鼠标穿透
      this.window!.setIgnoreMouseEvents(true, { forward: true })
    } else {
      // 窗口已存在 → 直接发送状态更新
      this.sendStatusUpdate()
      this.#msgSent = true
    }

    // 定位
    this.window!.setBounds({
      x: pos.x,
      y,
      width: ClaudeCodeStatusFrame.POPUP_WIDTH,
      height: ClaudeCodeStatusFrame.POPUP_HEIGHT
    })

    // 显示窗口（不抢占焦点，避免影响搜索框等前台窗口）
    this.window!.showInactive()

    // 通知渲染进程播放淡入动画
    this.sendOne('to-renderer-ClaudeCodeStatusFrame:show')
  }

  /**
   * 隐藏常驻状态通知（带淡出动画）
   * @param delay - 延迟隐藏时间（毫秒），默认 0
   */
  hideWithAnimation(delay = 0): void {
    this.#clearHideTimer()

    if (delay > 0) {
      this.#hideTimer = setTimeout(() => {
        this.#doHide()
      }, delay)
    } else {
      this.#doHide()
    }
  }

  /**
   * 执行隐藏操作
   */
  #doHide(): void {
    if (!this.isAlive()) return

    // 通知渲染进程播放淡出动画
    this.sendOne('to-renderer-ClaudeCodeStatusFrame:hide')

    // 动画完成后隐藏窗口
    setTimeout(() => {
      if (this.isAlive()) {
        this.window!.hide()
      }
    }, 300) // 与 CSS 动画时长一致
  }

  /**
   * 清除隐藏定时器
   */
  #clearHideTimer(): void {
    if (this.#hideTimer) {
      clearTimeout(this.#hideTimer)
      this.#hideTimer = null
    }
  }

  /**
   * 平滑移动到目标 Y 坐标
   * @param targetY - 目标 Y 坐标
   * @param animated - 是否使用动画，默认 true
   */
  moveTo(targetY: number, animated = true): void {
    if (!this.isAlive()) return

    if (!animated) {
      const [x] = this.window!.getPosition()
      this.window!.setPosition(x, targetY)
      return
    }

    const [x, startY] = this.window!.getPosition()
    if (startY === targetY) return

    const duration = 300
    const startTime = Date.now()

    const animate = (): void => {
      if (!this.isAlive()) return
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      // 缓动函数：easeOutCubic - 先快后慢，自然停止
      const eased = 1 - Math.pow(1 - progress, 3)
      const currentY = Math.round(startY + (targetY - startY) * eased)

      this.window!.setPosition(x, currentY)

      if (progress < 1) {
        setTimeout(animate, 16) // ~60fps
      }
    }

    animate()
  }

  /**
   * 销毁窗口
   */
  destroy(): void {
    this.#clearHideTimer()
    this.#msgSent = false
    this.#currentStatus = 'running'
    this.#customText = null
    super.destroy()
  }
}
