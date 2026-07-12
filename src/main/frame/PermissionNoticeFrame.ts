/**
 * 权限确认弹窗
 * @description 从右侧滑入的权限确认窗口，位置由 PopupManager 统一管理（槽位式布局，右下角堆叠）
 *              入场/出场动画由渲染进程 CSS 实现（从右侧滑入/滑出）
 *              用于 Claude Code 权限请求交互，显示工具名称、命令内容
 *              提供拒绝/同意/全部同意三个按钮，透明无边框蓝粉渐变胶囊风格
 */
import { BrowserWindowConstructorOptions, BrowserWindow } from 'electron'
import BaseFrame from './BaseFrame'
import type { PermissionRequestInfo } from '../service/claudeCodeService'
import { claudeCodeService } from '../service/claudeCodeService'

export default class PermissionNoticeFrame extends BaseFrame {
  /** 弹窗高度（包含工具信息和按钮） */
  private static readonly POPUP_HEIGHT = 140

  /** 窗口宽度 */
  private static readonly POPUP_WIDTH = 520

  /** 待发送的权限请求信息 */
  #permissionInfo: PermissionRequestInfo | null = null

  /** 消息是否已发送给渲染进程 */
  #msgSent = false

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

    // 渲染进程已就绪，发送缓存的权限请求信息（由 PopupManager 管理位置和动画）
    this.recvOne('to-main-PermissionNoticeFrame:ready', async () => {
      if (!this.#msgSent && this.#permissionInfo) {
        this.sendOne('to-renderer-PermissionNoticeFrame:show', this.#permissionInfo)
        this.#msgSent = true
      }
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
        // 播放退场动画后再销毁
        this.sendOne('to-renderer-PermissionNoticeFrame:animate', { action: 'exit' })
        setTimeout(() => this.destroy(), 350)
      }
    )

    // 渲染进程请求销毁窗口（隐藏动画完成后）
    this.recvOne('to-main-PermissionNoticeFrame:destroy', () => {
      this.destroy()
    })
  }

  /**
   * 设置权限请求信息（由 PopupManager 调用，不负责窗口定位和显示）
   * @param info - 权限请求信息
   */
  showPermissionNotice(info: PermissionRequestInfo): void {
    this.#permissionInfo = info
    this.#msgSent = false
  }

  /**
   * 创建窗口
   * @description 由 PopupManager 调用，创建后不自动显示（由 PopupManager 控制显示时机）
   * @returns 窗口实例
   */
  create(): BrowserWindow {
    const win = super.create()
    // 设置鼠标穿透，透明区域可点击穿透
    win.setIgnoreMouseEvents(true, { forward: true })
    return win
  }

  /**
   * 销毁窗口
   */
  destroy(): void {
    this.#msgSent = false
    this.#permissionInfo = null
    super.destroy()
  }
}
