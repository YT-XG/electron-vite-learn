import BallFrame from './BallFrame'
import NoticeNewFrame from './NoticeNewFrame'
import UpdateNewFrame from './UpdateNewFrame'
import TestFrame from './TestFrame'
import OpenDialogFrame from './OpenDialogFrame'

/**
 * 窗口工厂
 * @description 统一管理所有窗口的创建和生命周期
 */
export default class WindowFactory {
  /** 悬浮球实例 */
  #ballFrame: BallFrame | null = null

  /** 新版通知窗口实例 */
  #noticeNewFrame: NoticeNewFrame | null = null

  /** 新版更新窗口实例 */
  #updateNewFrame: UpdateNewFrame | null = null

  /** 测试窗口 */
  #testFrame: TestFrame | null = null

  /** OpenDialog 窗口 */
  #openDialogFrame: OpenDialogFrame | null = null

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
   * 获取新版通知窗口
   * @returns NoticeNewFrame 实例
   */
  getNoticeNewFrame(): NoticeNewFrame {
    if (!this.#noticeNewFrame) {
      this.#noticeNewFrame = new NoticeNewFrame()
      this.#noticeNewFrame.onDestroyCallback = () => {
        this.#noticeNewFrame = null
      }
    }
    return this.#noticeNewFrame
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
    this.#noticeNewFrame?.destroy()
    this.#updateNewFrame?.destroy()
    this.#testFrame?.destroy()
    this.#openDialogFrame?.destroy()
  }

  /**
   * 关闭所有窗口（隐藏）
   */
  closeAll(): void {
    this.#ballFrame?.close()
    this.#noticeNewFrame?.destroy()
    this.#updateNewFrame?.hide()
    this.#openDialogFrame?.hide()
  }
}

// 导出单例
export const windowFactory = new WindowFactory()
