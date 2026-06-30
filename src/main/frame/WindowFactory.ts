import BallFrame from './BallFrame'
import NoticeManager from './NoticeManager'
import UpdateNewFrame from './UpdateNewFrame'
import TestFrame from './TestFrame'
import OpenDialogFrame from './OpenDialogFrame'
import MainPageFrame from './MainPageFrame'
import PermissionNoticeFrame from './PermissionNoticeFrame'

/**
 * 窗口工厂
 * @description 统一管理所有窗口的创建和生命周期
 */
export default class WindowFactory {
  /** 悬浮球实例 */
  #ballFrame: BallFrame | null = null

  /** 多通知管理器 */
  #noticeManager: NoticeManager | null = null

  /** 新版更新窗口实例 */
  #updateNewFrame: UpdateNewFrame | null = null

  /** 测试窗口 */
  #testFrame: TestFrame | null = null

  /** OpenDialog 窗口 */
  #openDialogFrame: OpenDialogFrame | null = null

  /** 主页面窗口 */
  #mainPageFrame: MainPageFrame | null = null

  /** 权限确认窗口 */
  #permissionNoticeFrame: PermissionNoticeFrame | null = null

  /**
   * 获取主窗口（悬浮球时钟）
   * @returns BallFrame 实例
   */
  getBallFrame(): BallFrame {
    if (!this.#ballFrame) {
      this.#ballFrame = new BallFrame()
    }
    return this.#ballFrame
  }

  /**
   * 获取多通知管理器
   * @returns NoticeManager 实例
   */
  getNoticeManager(): NoticeManager {
    if (!this.#noticeManager) {
      this.#noticeManager = new NoticeManager()
    }
    return this.#noticeManager
  }

  /**
   * 显示通知（便捷方法）
   * @param options - 通知配置
   */
  showNoticeNew(options: import('./NoticeManager').NoticeOptions): void {
    this.getNoticeManager().show(options)
  }

  /**
   * 获取新版更新窗口
   * @returns UpdateNewFrame 实例
   */
  getUpdateNewFrame(): UpdateNewFrame {
    if (!this.#updateNewFrame) {
      this.#updateNewFrame = new UpdateNewFrame()
      this.#updateNewFrame.onDestroyCallback = () => {
        this.#updateNewFrame = null
      }
    }
    return this.#updateNewFrame
  }
  /**
   * 获取测试窗口
   * @returns TestFrame 实例
   */
  getTestFrame(): TestFrame {
    if (!this.#testFrame) {
      this.#testFrame = new TestFrame()
    }
    return this.#testFrame
  }

  /**
   * 获取 OpenDialog 窗口
   * @returns OpenDialogFrame 实例
   */
  getOpenDialogFrame(): OpenDialogFrame {
    if (!this.#openDialogFrame) {
      this.#openDialogFrame = new OpenDialogFrame()
    }
    return this.#openDialogFrame
  }

  /**
   * 获取主页面窗口
   * @returns MainPageFrame 实例
   */
  getMainPageFrame(): MainPageFrame {
    if (!this.#mainPageFrame) {
      this.#mainPageFrame = new MainPageFrame()
    }
    return this.#mainPageFrame
  }

  /**
   * 获取权限确认窗口
   * @returns PermissionNoticeFrame 实例
   */
  getPermissionNoticeFrame(): PermissionNoticeFrame {
    if (!this.#permissionNoticeFrame) {
      this.#permissionNoticeFrame = new PermissionNoticeFrame()
      this.#permissionNoticeFrame.onDestroyCallback = () => {
        this.#permissionNoticeFrame = null
      }
    }
    return this.#permissionNoticeFrame
  }

  /**
   * 创建悬浮球窗口
   * @returns 主窗口实例
   */
  createBallFrame(): BallFrame {
    const frame = this.getBallFrame()
    frame.create()
    return frame
  }

  /**
   * 销毁所有窗口
   */
  destroyAll(): void {
    this.#ballFrame?.destroy()
    this.#noticeManager?.destroyAll()
    this.#updateNewFrame?.destroy()
    this.#testFrame?.destroy()
    this.#openDialogFrame?.destroy()
    this.#mainPageFrame?.destroy()
    this.#permissionNoticeFrame?.destroy()
  }

  /**
   * 关闭所有窗口（隐藏）
   */
  closeAll(): void {
    this.#ballFrame?.close()
    this.#noticeManager?.destroyAll()
    this.#updateNewFrame?.hide()
    this.#openDialogFrame?.hide()
    this.#mainPageFrame?.close()
    this.#permissionNoticeFrame?.destroy()
  }
}

// 导出单例
export const windowFactory = new WindowFactory()
