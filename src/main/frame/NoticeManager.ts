// src/main/frame/NoticeManager.ts
import { screen } from 'electron'
import NoticeNewFrame from './NoticeNewFrame'
import ClaudeCodeStatusFrame, { type ClaudeCodeStatus } from './ClaudeCodeStatusFrame'

/** 通知配置选项 */
export interface NoticeOptions {
  /** 通知文本内容 */
  text: string
  /** 是否显示翻译按钮，默认 false */
  showTranslate?: boolean
  /** 显示时长（毫秒），默认 5000 */
  duration?: number
}

/**
 * 多通知管理器
 * @description 管理多个 NoticeNewFrame 实例，支持通知堆叠、自定义时长和移动动画
 */
export default class NoticeManager {
  /** 最大同时显示通知数 */
  private readonly MAX_NOTICES = 5

  /** 每个通知窗口高度（像素） */
  private readonly POPUP_HEIGHT = 60

  /** 通知之间的间距（像素） */
  private readonly GAP = 8

  /** 距屏幕底部间距（像素） */
  private readonly BOTTOM_MARGIN = 60

  /** 当前存活的通知实例列表（索引 0 = 最新，越往后越旧） */
  private notices: NoticeNewFrame[] = []

  /** Claude Code 常驻状态通知实例 */
  private claudeCodeStatusFrame: ClaudeCodeStatusFrame | null = null

  /**
   * 显示一个新通知
   * @param options - 通知配置
   */
  show(options: NoticeOptions): void {
    const { text, showTranslate = false, duration = 5000 } = options

    // 如果已达到上限，销毁最早的（最上面的）通知
    if (this.notices.length >= this.MAX_NOTICES) {
      const oldest = this.notices[this.notices.length - 1]
      oldest.destroy()
      this.notices.pop()
    }

    // 创建新通知实例
    const notice = new NoticeNewFrame()
    notice.onDestroyCallback = () => {
      this.removeNotice(notice)
    }

    // 设置消息和时长（setMsg 会自动检测 URL 并设置 showOpenLink）
    notice.setMsg(text, showTranslate)
    notice.setDuration(duration)

    // 插入到列表头部（最新）
    this.notices.unshift(notice)

    // 重新排列所有通知位置
    this.repositionAll()

    // 显示新通知（在底部位置）
    notice.showAtBottomCenter().catch(() => {
      // Window creation failed, notice will be cleaned up by onDestroyCallback
    })
  }

  /**
   * 重新计算所有通知位置并平滑移动
   */
  private repositionAll(): void {
    for (let i = 0; i < this.notices.length; i++) {
      const notice = this.notices[i]
      const targetY = this.calcY(i)
      notice.moveTo(targetY, true)
    }
  }

  /**
   * 计算第 index 个通知的 Y 坐标
   * @param index - 从底部开始的索引（0 = 最底部，最新）
   * @returns Y 坐标
   */
  private calcY(index: number): number {
    const display = screen.getPrimaryDisplay()
    const { workArea } = display
    return Math.round(
      workArea.y + workArea.height - this.BOTTOM_MARGIN - this.POPUP_HEIGHT - (this.POPUP_HEIGHT + this.GAP) * index
    )
  }

  /**
   * 移除指定通知并重新排列
   * @param notice - 要移除的通知实例
   */
  private removeNotice(notice: NoticeNewFrame): void {
    const index = this.notices.indexOf(notice)
    if (index !== -1) {
      this.notices.splice(index, 1)
      // 重新排列剩余通知
      this.repositionAll()
    }
  }

  /**
   * 销毁所有通知
   */
  destroyAll(): void {
    for (const notice of this.notices) {
      notice.onDestroyCallback = null
      notice.destroy()
    }
    this.notices = []
  }

  /**
   * 获取当前通知数量
   */
  getCount(): number {
    return this.notices.length
  }

  // ========== Claude Code 状态通知管理 ==========

  /**
   * 显示 Claude Code 状态通知
   * @param status - 状态类型
   * @param customText - 自定义状态文本（可选）
   */
  showClaudeCodeStatus(status: ClaudeCodeStatus, customText?: string): void {
    if (!this.claudeCodeStatusFrame) {
      this.claudeCodeStatusFrame = new ClaudeCodeStatusFrame()
      this.claudeCodeStatusFrame.onDestroyCallback = () => {
        this.claudeCodeStatusFrame = null
      }
    }

    this.claudeCodeStatusFrame.updateStatus(status, customText)
    this.claudeCodeStatusFrame.show()
  }

  /**
   * 隐藏 Claude Code 状态通知（带淡出动画）
   * @param delay - 延迟隐藏时间（毫秒），默认 0
   */
  hideClaudeCodeStatus(delay = 0): void {
    if (this.claudeCodeStatusFrame) {
      this.claudeCodeStatusFrame.hideWithAnimation(delay)
    }
  }

  /**
   * 更新 Claude Code 状态（如果窗口未显示则不显示）
   * @param status - 状态类型
   * @param customText - 自定义状态文本（可选）
   */
  updateClaudeCodeStatus(status: ClaudeCodeStatus, customText?: string): void {
    if (this.claudeCodeStatusFrame) {
      this.claudeCodeStatusFrame.updateStatus(status, customText)
    }
  }

  /**
   * 销毁 Claude Code 状态通知
   */
  destroyClaudeCodeStatus(): void {
    if (this.claudeCodeStatusFrame) {
      this.claudeCodeStatusFrame.onDestroyCallback = null
      this.claudeCodeStatusFrame.destroy()
      this.claudeCodeStatusFrame = null
    }
  }
}
