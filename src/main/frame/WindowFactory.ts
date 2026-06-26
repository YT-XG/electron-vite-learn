import MainFrame from './MainFrame'
import NoticeFrame from './NoticeFrame'
import UpdateFrame from './UpdateFrame'
import MusicFrame from './MusicFrame'
import TestFrame from './TestFrame'

/**
 * 窗口工厂
 * @description 统一管理所有窗口的创建和生命周期
 */
export default class WindowFactory {
  /** 主窗口实例 */
  #mainFrame: MainFrame | null = null

  /** 通知窗口实例 */
  #noticeFrame: NoticeFrame | null = null

  /** 更新窗口实例 */
  #updateFrame: UpdateFrame | null = null

  /** 音乐窗口实例 */
  #musicFrame: MusicFrame | null = null

  /** 测试窗口 */
  #testFrame: TestFrame | null = null

  /**
   * 获取主窗口（悬浮球时钟）
   * @returns MainFrame 实例
   */
  getMainFrame(): MainFrame {
    if (!this.#mainFrame) {
      this.#mainFrame = new MainFrame()
    }
    return this.#mainFrame
  }

  /**
   * 获取通知窗口
   * @returns NoticeFrame 实例
   */
  getNoticeFrame(): NoticeFrame {
    if (!this.#noticeFrame) {
      this.#noticeFrame = new NoticeFrame()
    }
    return this.#noticeFrame
  }

  /**
   * 获取更新窗口
   * @returns UpdateFrame 实例
   */
  getUpdateFrame(): UpdateFrame {
    if (!this.#updateFrame) {
      this.#updateFrame = new UpdateFrame()
    }
    return this.#updateFrame
  }

  /**
   * 获取音乐窗口
   * @returns MusicFrame 实例
   */
  getMusicFrame(): MusicFrame {
    if (!this.#musicFrame) {
      this.#musicFrame = new MusicFrame()
    }
    return this.#musicFrame
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
   * 创建主窗口
   * @returns 主窗口实例
   */
  createMainFrame(): MainFrame {
    const frame = this.getMainFrame()
    frame.create()
    return frame
  }

  /**
   * 显示通知
   * @param text - 通知文本
   */
  showNotice(text: string): void {
    const frame = this.getNoticeFrame()
    frame.showNotice(text)
  }

  /**
   * 显示更新窗口
   * @param data - 更新信息
   */
  showUpdate(data: { version: string; releaseNotes?: string; releaseName?: string }): void {
    const frame = this.getUpdateFrame()
    frame.showUpdate(data)
  }

  /**
   * 显示音乐窗口
   */
  showMusic(): void {
    const frame = this.getMusicFrame()
    frame.showMusic()
  }

  /**
   * 销毁所有窗口
   */
  destroyAll(): void {
    this.#mainFrame?.destroy()
    this.#noticeFrame?.destroy()
    this.#updateFrame?.destroy()
    this.#musicFrame?.destroy()

    this.#mainFrame = null
    this.#noticeFrame = null
    this.#updateFrame = null
    this.#musicFrame = null
  }

  /**
   * 关闭所有窗口
   */
  closeAll(): void {
    this.#mainFrame?.close()
    this.#noticeFrame?.close()
    this.#updateFrame?.close()
    this.#musicFrame?.close()
  }
}

// 导出单例
export const windowFactory = new WindowFactory()
