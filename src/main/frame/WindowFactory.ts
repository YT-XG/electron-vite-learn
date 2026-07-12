import MainPageFrame from './MainPageFrame'
import SearchBoxFrame from './SearchBoxFrame'
import MarkdownPreviewFrame from './MarkdownPreviewFrame'
import ContextMenuFrame from './ContextMenuFrame'
import JsonToolFrame from './JsonToolFrame'
import SnippetPickerFrame from './SnippetPickerFrame'

/**
 * 窗口工厂
 * @description 统一管理所有独立窗口的创建和生命周期
 *              通知弹窗相关由 PopupManager 管理，不在此类
 */
export default class WindowFactory {
  /** 主页面窗口 */
  #mainPageFrame: MainPageFrame | null = null

  /** 搜索框窗口 */
  #searchBoxFrame: SearchBoxFrame | null = null

  /** Markdown 预览窗口 */
  #markdownPreviewFrame: MarkdownPreviewFrame | null = null

  /** 右键菜单窗口 */
  #contextMenuFrame: ContextMenuFrame | null = null

  /** JSON 工具窗口 */
  #jsonToolFrame: JsonToolFrame | null = null

  /** 片段选择窗口 */
  #snippetPickerFrame: SnippetPickerFrame | null = null

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
   * 获取 JSON 工具窗口
   * @returns JsonToolFrame 实例
   */
  getJsonToolFrame(): JsonToolFrame {
    if (!this.#jsonToolFrame) {
      this.#jsonToolFrame = new JsonToolFrame()
      this.#jsonToolFrame.onDestroyCallback = () => {
        this.#jsonToolFrame = null
      }
    }
    return this.#jsonToolFrame
  }

  /**
   * 获取片段选择窗口
   * @returns SnippetPickerFrame 实例
   */
  getSnippetPickerFrame(): SnippetPickerFrame {
    if (!this.#snippetPickerFrame) {
      this.#snippetPickerFrame = new SnippetPickerFrame()
      this.#snippetPickerFrame.onDestroyCallback = () => {
        this.#snippetPickerFrame = null
      }
    }
    return this.#snippetPickerFrame
  }

  /**
   * 创建 JSON 工具窗口
   * @returns JsonToolFrame 实例
   */
  createJsonToolFrame(): JsonToolFrame {
    const frame = this.getJsonToolFrame()
    frame.create()
    return frame
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
   * 关闭所有窗口（销毁）
   * @description 应用退出时调用，统一使用 destroy() 释放资源
   */
  closeAll(): void {
    this.#mainPageFrame?.destroy()
    this.#searchBoxFrame?.destroy()
    this.#markdownPreviewFrame?.destroy()
    this.#contextMenuFrame?.destroy()
    this.#jsonToolFrame?.destroy()
    this.#snippetPickerFrame?.destroy()
  }
}

// 导出单例
export const windowFactory = new WindowFactory()
