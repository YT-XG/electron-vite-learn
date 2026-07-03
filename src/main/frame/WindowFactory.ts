import NoticeManager from './NoticeManager'
import UpdateNewFrame from './UpdateNewFrame'
import MainPageFrame from './MainPageFrame'
import PermissionNoticeFrame from './PermissionNoticeFrame'
import SearchBoxFrame from './SearchBoxFrame'
import MarkdownPreviewFrame from './MarkdownPreviewFrame'
import ContextMenuFrame from './ContextMenuFrame'

/**
 * 窗口工厂
 * @description 统一管理所有窗口的创建和生命周期
 */
export default class WindowFactory {
  /** 多通知管理器 */
  #noticeManager: NoticeManager | null = null

  /** 新版更新窗口实例 */
  #updateNewFrame: UpdateNewFrame | null = null

  /** 主页面窗口 */
  #mainPageFrame: MainPageFrame | null = null

  /** 权限确认窗口 */
  #permissionNoticeFrame: PermissionNoticeFrame | null = null

  /** 搜索框窗口 */
  #searchBoxFrame: SearchBoxFrame | null = null

  /** Markdown 预览窗口 */
  #markdownPreviewFrame: MarkdownPreviewFrame | null = null

  /** 右键菜单窗口 */
  #contextMenuFrame: ContextMenuFrame | null = null

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
   * 获取搜索框窗口
   * @returns SearchBoxFrame 实例
   */
  getSearchBoxFrame(): SearchBoxFrame {
    if (!this.#searchBoxFrame) {
      this.#searchBoxFrame = new SearchBoxFrame()
      this.#searchBoxFrame.onDestroyCallback = () => {
        this.#searchBoxFrame = null
      }
    }
    return this.#searchBoxFrame
  }

  /**
   * 创建搜索框窗口
   * @returns SearchBoxFrame 实例
   */
  createSearchBoxFrame(): SearchBoxFrame {
    const frame = this.getSearchBoxFrame()
    frame.create()
    return frame
  }

  /**
   * 获取 Markdown 预览窗口
   * @returns MarkdownPreviewFrame 实例
   */
  getMarkdownPreviewFrame(): MarkdownPreviewFrame {
    if (!this.#markdownPreviewFrame) {
      this.#markdownPreviewFrame = new MarkdownPreviewFrame()
      this.#markdownPreviewFrame.onDestroyCallback = () => {
        this.#markdownPreviewFrame = null
      }
    }
    return this.#markdownPreviewFrame
  }

  /**
   * 创建 Markdown 预览窗口
   * @returns MarkdownPreviewFrame 实例
   */
  createMarkdownPreviewFrame(): MarkdownPreviewFrame {
    const frame = this.getMarkdownPreviewFrame()
    frame.create()
    return frame
  }

  /**
   * 获取右键菜单窗口
   * @returns ContextMenuFrame 实例
   */
  getContextMenuFrame(): ContextMenuFrame {
    if (!this.#contextMenuFrame) {
      this.#contextMenuFrame = new ContextMenuFrame()
      this.#contextMenuFrame.onDestroyCallback = () => {
        this.#contextMenuFrame = null
      }
    }
    return this.#contextMenuFrame
  }

  /**
   * 显示右键菜单
   * @param x - 鼠标 X 坐标
   * @param y - 鼠标 Y 坐标
   * @param items - 菜单项列表
   */
  showContextMenu(
    x: number,
    y: number,
    items: Array<{
      icon: string
      label: string
      shortcut?: string
      separator?: boolean
      action?: string
    }>
  ): void {
    const frame = this.getContextMenuFrame()
    if (!frame.isAlive()) {
      frame.create()
    }
    frame.showMenu(x, y, items)
  }

  /**
   * 销毁所有窗口
   */
  destroyAll(): void {
    this.#noticeManager?.destroyAll()
    this.#updateNewFrame?.destroy()
    this.#mainPageFrame?.destroy()
    this.#permissionNoticeFrame?.destroy()
    this.#searchBoxFrame?.destroy()
    this.#markdownPreviewFrame?.destroy()
    this.#contextMenuFrame?.destroy()
  }

  /**
   * 关闭所有窗口（隐藏）
   */
  closeAll(): void {
    this.#noticeManager?.destroyAll()
    this.#updateNewFrame?.hide()
    this.#mainPageFrame?.close()
    this.#permissionNoticeFrame?.destroy()
    this.#searchBoxFrame?.hide()
    this.#markdownPreviewFrame?.destroy()
    this.#contextMenuFrame?.hideMenu()
  }
}

// 导出单例
export const windowFactory = new WindowFactory()
