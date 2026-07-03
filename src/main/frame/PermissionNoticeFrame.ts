/**
 * 权限确认弹窗
 * @description 底部居中弹出的权限确认窗口，用于 Claude Code 权限请求交互
 *              显示工具名称、命令内容，提供拒绝/同意/全部同意三个按钮
 */
import { BrowserWindowConstructorOptions, screen } from 'electron'
import BaseFrame from './BaseFrame'
import type { PermissionRequestInfo } from '../service/claudeCodeService'
import { claudeCodeService } from '../service/claudeCodeService'
import { getBottomMargin } from '../utils/platform'

export default class PermissionNoticeFrame extends BaseFrame {
  /** 弹窗高度（包含工具信息和按钮） */
  private static readonly POPUP_HEIGHT = 140

  /** 窗口宽度 */
  private static readonly POPUP_WIDTH = 520

  /** 窗口底部距屏幕边缘的间距（像素） */
  private static readonly BOTTOM_MARGIN = 60

  /** 待发送的权限请求信息 */
  #permissionInfo: PermissionRequestInfo | null = null

  /** 消息是否已发送给渲染进程 */
  #msgSent = false

  /** 隐藏动画定时器 */
  #hideTimer: ReturnType<typeof setTimeout> | null = null

  /** 窗口配置 - 透明无边框气泡 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: PermissionNoticeFrame.POPUP_WIDTH,
    height: PermissionNoticeFrame.POPUP_HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false
  }

  /** 路由路径 */
  protected readonly routePath = '/permissionNotice'

  /**
   * 设置权限请求信息
   * @param info - 权限请求信息
   */
  setPermissionInfo(info: PermissionRequestInfo): void {
    this.#permissionInfo = info
  }

  /**
   * 注册 IPC 监听器
   * @description 监听渲染进程就绪事件和按钮点击事件
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 渲染进程已就绪，发送缓存的权限请求信息并显示窗口
    this.recvOne('to-main-PermissionNoticeFrame:ready', async () => {
      if (!this.#msgSent && this.#permissionInfo) {
        this.sendOne('to-renderer-PermissionNoticeFrame:show', this.#permissionInfo)
      }
      await this.showAtBottomCenter()
    })

    // 鼠标进入通知卡片区域：关闭鼠标穿透
    this.recvOne('to-main-PermissionNoticeFrame:mouse-enter-card', () => {
      if (this.isAlive()) {
        this.window!.setIgnoreMouseEvents(false)
      }
    })

    // 鼠标离开通知卡片区域：恢复鼠标穿透
    this.recvOne('to-main-PermissionNoticeFrame:mouse-leave-card', () => {
      if (this.isAlive()) {
        this.window!.setIgnoreMouseEvents(true, { forward: true })
      }
    })

    // 用户点击权限决策按钮
    this.recvOne(
      'to-main-PermissionNoticeFrame:resolve',
      (_event, sessionId: string, decision: 'allow' | 'always' | 'deny') => {
        // 调用 claudeCodeService 解决权限请求
        claudeCodeService.resolvePermission(sessionId, decision)
        // 关闭窗口
        this.destroy()
      }
    )

    // 渲染进程请求销毁窗口（隐藏动画完成后）
    this.recvOne('to-main-PermissionNoticeFrame:destroy', () => {
      this.destroy()
    })
  }

  /**
   * 计算屏幕底部居中位置
   * @returns 窗口左上角坐标
   */
  #calcBottomCenterPosition(): { x: number; y: number } {
    const display = screen.getPrimaryDisplay()
    const { workArea } = display

    // 水平居中
    const x = Math.round(workArea.x + (workArea.width - PermissionNoticeFrame.POPUP_WIDTH) / 2)
    // 距底部 60px（macOS 会额外加上 Dock 高度）
    const bottomMargin = getBottomMargin(PermissionNoticeFrame.BOTTOM_MARGIN)
    const y = Math.round(workArea.y + workArea.height - PermissionNoticeFrame.POPUP_HEIGHT - bottomMargin)

    return { x, y }
  }

  /**
   * 显示权限确认窗口
   * @param info - 权限请求信息
   */
  showPermissionNotice(info: PermissionRequestInfo): void {
    this.setPermissionInfo(info)
    this.showAtBottomCenter()
  }

  /**
   * 在屏幕底部居中显示权限确认窗口
   */
  async showAtBottomCenter(): Promise<void> {
    const pos = this.#calcBottomCenterPosition()

    if (!this.isAlive()) {
      // 窗口不存在 → 创建新窗口
      this.#msgSent = false
      this.create()
      // 设置鼠标穿透
      this.window!.setIgnoreMouseEvents(true, { forward: true })
    } else {
      // 窗口已存在 → 直接发送消息
      if (this.#permissionInfo) {
        this.sendOne('to-renderer-PermissionNoticeFrame:show', this.#permissionInfo)
        this.#msgSent = true
      }
    }

    // 定位
    this.window!.setBounds({
      x: pos.x,
      y: pos.y,
      width: PermissionNoticeFrame.POPUP_WIDTH,
      height: PermissionNoticeFrame.POPUP_HEIGHT
    })

    // 显示窗口（不抢占焦点，避免影响搜索框等前台窗口）
    this.window!.showInactive()
  }

  /**
   * 平滑移动窗口到目标 Y 坐标
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

      // easeOutCubic 缓动函数：先快后慢，自然停止
      const easeOutCubic = 1 - Math.pow(1 - progress, 3)
      const currentY = Math.round(startY + (targetY - startY) * easeOutCubic)

      this.window!.setPosition(x, currentY)

      if (progress < 1) {
        setTimeout(animate, 8)
      }
    }

    animate()
  }

  /**
   * 获取窗口当前 Y 坐标
   * @returns Y 坐标，窗口不存在时返回 0
   */
  getY(): number {
    if (!this.isAlive()) return 0
    const [, y] = this.window!.getPosition()
    return y
  }

  /**
   * 隐藏权限确认窗口（带淡出动画）
   * @description 供 claudeCodeService 调用，当权限被解决或超时后隐藏窗口
   */
  hideWithAnimation(): void {
    if (this.#hideTimer) {
      clearTimeout(this.#hideTimer)
    }

    if (!this.isAlive()) return

    // 通知渲染进程播放淡出动画
    this.sendOne('to-renderer-PermissionNoticeFrame:hide')
  }

  /**
   * 销毁窗口
   */
  destroy(): void {
    if (this.#hideTimer) {
      clearTimeout(this.#hideTimer)
      this.#hideTimer = null
    }
    this.#msgSent = false
    this.#permissionInfo = null
    super.destroy()
  }
}
