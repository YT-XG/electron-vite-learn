import { BrowserWindow, BrowserWindowConstructorOptions, dialog } from 'electron'
import BaseFrame from './BaseFrame'

/**
 * JSON 工具窗口
 * @description JSON 格式化、压缩、转义、反转义、校验，以及文件打开/保存
 */
export default class JsonToolFrame extends BaseFrame {
  /** 窗口宽度 */
  static readonly WIDTH = 800

  /** 窗口高度 */
  static readonly HEIGHT = 600

  /** 最小宽度 */
  static readonly MIN_WIDTH = 600

  /** 最小高度 */
  static readonly MIN_HEIGHT = 400

  /** 窗口配置 - 透明无边框 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: JsonToolFrame.WIDTH,
    height: JsonToolFrame.HEIGHT,
    minWidth: JsonToolFrame.MIN_WIDTH,
    minHeight: JsonToolFrame.MIN_HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    show: false,
    resizable: true
  }

  /** 路由路径 */
  protected readonly routePath: string = '/jsonTool'

  /**
   * 注册 IPC 监听器
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 最小化窗口
    this.recvOne('to-main-JsonTool:minimize', (event) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender)
      if (senderWindow && !senderWindow.isDestroyed()) {
        senderWindow.minimize()
      }
    })

    // 最大化/还原窗口
    this.recvOne('to-main-JsonTool:toggleMaximize', (event) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender)
      if (senderWindow && !senderWindow.isDestroyed()) {
        if (senderWindow.isMaximized()) {
          senderWindow.unmaximize()
        } else {
          senderWindow.maximize()
        }
      }
    })

    // 打开文件 - 弹出文件选择对话框，读取选中的 JSON 文件
    this.recvTwo('to-main-JsonTool:openFile', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      const fs = require('fs')
      return fs.readFileSync(result.filePaths[0], 'utf-8')
    })

    // 保存文件 - 弹出保存对话框，将内容写入选定路径
    this.recvTwo('to-main-JsonTool:saveFile', async (_event, content: string) => {
      const result = await dialog.showSaveDialog({
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (result.canceled || !result.filePath) {
        return false
      }
      const fs = require('fs')
      fs.writeFileSync(result.filePath, content, 'utf-8')
      return true
    })
  }
}
