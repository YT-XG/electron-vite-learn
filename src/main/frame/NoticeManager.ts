// src/main/frame/NoticeManager.ts
import { screen } from 'electron'
import NoticeNewFrame from './NoticeNewFrame'
import { getBottomMargin } from '../utils/platform'
import { windowFactory } from './WindowFactory'

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
 * 多通知管理器
 * @description 管理多个 NoticeNewFrame 实例，支持通知堆叠、自定义时长和移动动画
 *              Claude Code 状态通知作为堆叠的一部分参与位置计算，避免与普通通知重叠
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

  /** 持久通知实例（Claude Code 状态通知） */
  private persistentNotice: NoticeNewFrame | null = null

  /** 持久通知是否正在显示 */
  private persistentNoticeVisible = false

  /**
   * 显示一个新通知
   * @param options - 通知配置
   * @param isPersistent - 是否为持久通知，默认 false
   */
  show(options: NoticeOptions, isPersistent = false): void {
    const { text, showTranslate = false, duration = 5000, type = 'default' } = options

    // 持久通知：如果已存在，只更新内容
    if (isPersistent && this.persistentNotice) {
      this.persistentNotice.setMsg(text, false, type, true)
      this.persistentNotice.showAtBottomCenter()
      // 通知更新弹窗重新定位（避免覆盖）
      this.notifyUpdateFrameReposition()
      return
    }

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

    // 设置消息和时长
    notice.setMsg(text, showTranslate, type, isPersistent)
    notice.setDuration(duration)

    if (isPersistent) {
      // 持久通知单独管理
      this.persistentNotice = notice
      this.persistentNoticeVisible = true
    } else {
      // 普通通知插入到列表头部
      this.notices.unshift(notice)
    }

    // 重新排列所有通知位置
    this.repositionAll()

    // 显示通知
    notice.showAtBottomCenter().catch(() => {})

    // 通知更新弹窗重新定位（避免覆盖）
    this.notifyUpdateFrameReposition()
  }

  /**
   * 重新计算所有通知位置并平滑移动
   * @description 持久通知始终在最顶部，普通通知从底部开始堆叠
   */
  private repositionAll(): void {
    // 持久通知始终在最顶部（索引 = notices.length）
    if (this.persistentNoticeVisible && this.persistentNotice) {
      const statusY = this.calcY(this.notices.length)
      this.persistentNotice.moveTo(statusY, true)
    }

    // 普通通知从底部开始堆叠
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
    // macOS 需要额外加上 Dock 高度
    const bottomMargin = getBottomMargin(this.BOTTOM_MARGIN)
    return Math.round(
      workArea.y + workArea.height - bottomMargin - this.POPUP_HEIGHT - (this.POPUP_HEIGHT + this.GAP) * index
    )
  }

  /**
   * 移除指定通知并重新排列
   * @param notice - 要移除的通知实例
   */
  private removeNotice(notice: NoticeNewFrame): void {
    // 如果是持久通知，清空引用
    if (notice === this.persistentNotice) {
      this.persistentNotice = null
      this.persistentNoticeVisible = false
    }

    const index = this.notices.indexOf(notice)
    if (index !== -1) {
      this.notices.splice(index, 1)
    }

    // 重新排列所有通知
    this.repositionAll()

    // 通知更新弹窗重新定位（避免覆盖）
    this.notifyUpdateFrameReposition()
  }

  /**
   * 通知更新弹窗重新定位
   * @description 当通知数量变化时，更新弹窗需要调整位置
   */
  private notifyUpdateFrameReposition(): void {
    // 延迟通知，等待动画完成
    setTimeout(() => {
      try {
        const updateFrame = windowFactory.getUpdateNewFrame()
        if (updateFrame && typeof updateFrame.reposition === 'function') {
          updateFrame.reposition()
        }
      } catch {
        // 更新窗口可能不存在，忽略错误
      }
    }, 350) // 等待通知移动动画完成
  }

  /**
   * 销毁所有通知
   */
  destroyAll(): void {
    // 销毁普通通知
    for (const notice of this.notices) {
      notice.onDestroyCallback = null
      notice.destroy()
    }
    this.notices = []

    // 销毁持久通知（Claude Code 状态通知）
    if (this.persistentNotice) {
      this.persistentNotice.onDestroyCallback = null
      this.persistentNotice.destroy()
      this.persistentNotice = null
      this.persistentNoticeVisible = false
    }
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
   * @description 状态通知作为持久通知，始终在最顶部，不自动销毁
   * @param status - 状态类型
   * @param customText - 自定义状态文本（可选）
   */
  showClaudeCodeStatus(status: ClaudeCodeStatus, customText?: string): void {
    const config = STATUS_CONFIG[status]
    const text = customText || config.text
    this.show({ text, duration: 0 }, true) // duration=0 表示不自动销毁
  }

  /**
   * 更新 Claude Code 状态（如果窗口未显示则不显示）
   * @param status - 状态类型
   * @param customText - 自定义状态文本（可选）
   */
  updateClaudeCodeStatus(status: ClaudeCodeStatus, customText?: string): void {
    if (this.persistentNotice) {
      const config = STATUS_CONFIG[status]
      const text = customText || config.text
      this.persistentNotice.setMsg(text, false, 'default', true)
      this.persistentNotice.showAtBottomCenter()
    }
  }

  /**
   * 隐藏 Claude Code 状态通知（带淡出动画）
   * @description 隐藏后将下方普通通知向上移动填补空位
   */
  hideClaudeCodeStatus(): void {
    if (this.persistentNotice) {
      this.persistentNotice.destroy()
    }
  }
}
