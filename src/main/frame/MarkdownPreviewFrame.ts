import { BrowserWindowConstructorOptions } from 'electron'
import BaseFrame from './BaseFrame'

/**
 * Markdown 预览窗口
 * @description 多标签页实时分屏预览，支持拖入文件
 */
export default class MarkdownPreviewFrame extends BaseFrame {
  /** 窗口宽度 */
  static readonly WIDTH = 900

  /** 窗口高度 */
  static readonly HEIGHT = 600

  /** 最小宽度 */
  static readonly MIN_WIDTH = 600

  /** 最小高度 */
  static readonly MIN_HEIGHT = 400

  /** 窗口配置 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: MarkdownPreviewFrame.WIDTH,
    height: MarkdownPreviewFrame.HEIGHT,
    minWidth: MarkdownPreviewFrame.MIN_WIDTH,
    minHeight: MarkdownPreviewFrame.MIN_HEIGHT,
    backgroundColor: '#1e1e1e',
    frame: false,
    show: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  }

  /** 路由路径 */
  protected readonly routePath: string = '/markdownPreview'

  /** 文件路径到内容的映射 */
  #fileContents: Map<string, string> = new Map()

  /**
   * 注册 IPC 监听器
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 最小化窗口
    this.recvOne('to-main-MarkdownPreview:minimize', () => {
      if (this.isAlive()) {
        this.window!.minimize()
      }
    })

    // 最大化/还原窗口
    this.recvOne('to-main-MarkdownPreview:toggleMaximize', () => {
      if (this.isAlive()) {
        if (this.window!.isMaximized()) {
          this.window!.unmaximize()
        } else {
          this.window!.maximize()
        }
      }
    })

    // 关闭窗口
    this.recvOne('to-main-MarkdownPreview:close', () => {
      this.destroy()
    })

    // 读取文件
    this.recvTwo('to-main-MarkdownPreview:readFile', async (_event, filePath: string) => {
      try {
        const fs = require('fs/promises')
        const content = await fs.readFile(filePath, 'utf-8')
        this.#fileContents.set(filePath, content)
        return { success: true, content }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })

    // 保存文件
    this.recvTwo('to-main-MarkdownPreview:saveFile', async (_event, filePath: string, content: string) => {
      try {
        const fs = require('fs/promises')
        await fs.writeFile(filePath, content, 'utf-8')
        this.#fileContents.set(filePath, content)
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })
  }
}
