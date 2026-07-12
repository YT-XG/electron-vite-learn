import { BrowserWindowConstructorOptions, dialog } from 'electron'
import BaseFrame from './BaseFrame'
import { windowFactory } from './WindowFactory'

/**
 * Markdown 预览窗口
 * @description 多标签页实时分屏预览，支持拖入文件
 *              透明背景，右键菜单通过独立窗口显示
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

  /** 窗口配置 - 透明无边框，与渲染进程大小一致 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: MarkdownPreviewFrame.WIDTH,
    height: MarkdownPreviewFrame.HEIGHT,
    minWidth: MarkdownPreviewFrame.MIN_WIDTH,
    minHeight: MarkdownPreviewFrame.MIN_HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    show: false,
    resizable: true
  }

  /** 路由路径 */
  protected readonly routePath: string = '/markdownPreview'

  /** 文件路径到内容的映射 */
  #fileContents: Map<string, string> = new Map()

  /**
   * 创建窗口，同时预加载右键菜单窗口
   */
  create(autoShow = false): import('electron').BrowserWindow {
    const win = super.create(autoShow)

    // 预加载右键菜单窗口，避免右键时等待
    const contextMenuFrame = windowFactory.getContextMenuFrame()
    if (!contextMenuFrame.isAlive()) {
      contextMenuFrame.create()
    }

    return win
  }

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
      this.close()
    })

    // 显示右键菜单（通过主进程菜单窗口显示）
    this.recvOne(
      'to-main-MarkdownPreview:showContextMenu',
      (_event, x: number, y: number, items: Array<{
        icon: string
        label: string
        shortcut?: string
        separator?: boolean
        action?: string
      }>) => {
        windowFactory.showContextMenu(x, y, items)
      }
    )

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

    // 保存文件（直接保存到已有路径）
    this.recvTwo('to-main-MarkdownPreview:saveFile', async (_event, filePath: string, content: string) => {
      try {
        const fs = require('fs/promises')
        await fs.writeFile(filePath, content, 'utf-8')
        this.#fileContents.set(filePath, content)
        return { success: true, filePath }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })

    // 另存为（弹出文件选择对话框）
    this.recvTwo('to-main-MarkdownPreview:saveFileAs', async (_event, content: string, defaultName?: string) => {
      try {
        const result = await dialog.showSaveDialog(this.window!, {
          title: '保存 Markdown 文件',
          defaultPath: defaultName || '未命名.md',
          filters: [
            { name: 'Markdown 文件', extensions: ['md', 'markdown'] },
            { name: '所有文件', extensions: ['*'] }
          ]
        })

        if (result.canceled || !result.filePath) {
          return { success: false, canceled: true }
        }

        const fs = require('fs/promises')
        await fs.writeFile(result.filePath, content, 'utf-8')
        this.#fileContents.set(result.filePath, content)
        return { success: true, filePath: result.filePath }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })
  }
}
