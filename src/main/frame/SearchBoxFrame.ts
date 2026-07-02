import { BrowserWindow, BrowserWindowConstructorOptions, screen } from 'electron'
import BaseFrame from './BaseFrame'
import { searchService } from '../service/searchService'

/**
 * 搜索框窗口
 * @description 全局搜索框，快捷键呼出，支持工具搜索、剪贴板搜索
 */
export default class SearchBoxFrame extends BaseFrame {
  /** 窗口宽度 */
  static readonly WIDTH = 600

  /** 窗口高度 */
  static readonly HEIGHT = 400

  /** 窗口配置 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: SearchBoxFrame.WIDTH,
    height: SearchBoxFrame.HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    show: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  }

  /** 路由路径 */
  protected readonly routePath: string = '/searchBox'

  /** 是否正在显示 */
  #isVisible = false

  /**
   * 重写创建方法
   */
  create(): BrowserWindow {
    const window = super.create()
    window.hide()
    return window
  }

  /**
   * 显示/隐藏搜索框（toggle）
   */
  toggle(): void {
    if (this.#isVisible) {
      this.hide()
    } else {
      this.show()
    }
  }

  /**
   * 显示搜索框
   */
  show(): void {
    if (!this.isAlive()) {
      this.create()
      this.#centerOnScreen()
      this.window!.setOpacity(0)
      this.window!.show()

      this.window!.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          this.window?.setOpacity(1)
          this.#isVisible = true
        }, 30)
      })
    } else if (!this.window!.isVisible()) {
      this.#centerOnScreen()
      this.window!.setOpacity(0)
      this.window!.show()
      setTimeout(() => {
        this.window?.setOpacity(1)
        this.#isVisible = true
      }, 30)
    }
  }

  /**
   * 隐藏搜索框
   */
  hide(): void {
    if (this.isAlive() && this.window!.isVisible()) {
      this.window!.setOpacity(0)
      setTimeout(() => {
        this.window?.hide()
        this.#isVisible = false
      }, 150)
    }
  }

  /**
   * 将窗口定位到屏幕正中心
   */
  #centerOnScreen(): void {
    if (!this.window || this.window.isDestroyed()) return

    const display = screen.getPrimaryDisplay()
    const { workArea } = display

    const width = this.window.getSize()[0]
    const height = this.window.getSize()[1]

    const x = Math.round(workArea.x + (workArea.width - width) / 2)
    const y = Math.round(workArea.y + (workArea.height - height) / 2)

    this.window.setPosition(x, y)
  }

  /**
   * 注册 IPC 监听器
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 搜索工具
    this.recvTwo('to-main-SearchBox:searchTools', (_event, query: string) => {
      return searchService.searchTools(query)
    })

    // 搜索剪贴板
    this.recvTwo('to-main-SearchBox:searchClipboard', async (_event, query: string) => {
      return await searchService.searchClipboard(query)
    })

    // 执行工具
    this.recvOne('to-main-SearchBox:executeTool', (_event, toolId: string) => {
      searchService.executeTool(toolId)
      this.hide()
    })

    // 打开文件
    this.recvOne('to-main-SearchBox:openFile', (_event, filePath: string) => {
      searchService.openFile(filePath)
      this.hide()
    })

    // 打开网页
    this.recvOne('to-main-SearchBox:openUrl', (_event, url: string) => {
      searchService.openUrl(url)
      this.hide()
    })

    // 复制剪贴板内容
    this.recvOne('to-main-SearchBox:copyClipboard', (_event, content: string) => {
      const { clipboard } = require('electron')
      clipboard.writeText(content)
      this.hide()
    })

    // 隐藏搜索框
    this.recvOne('to-main-SearchBox:hide', () => {
      this.hide()
    })

    // 失去焦点时隐藏
    this.window?.on('blur', () => {
      this.hide()
    })
  }
}
