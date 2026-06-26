import { BrowserWindowConstructorOptions } from 'electron'
import BaseFrame from './BaseFrame'

/**
 * 更新窗口
 * @description 显示软件更新对话框
 */
export default class UpdateFrame extends BaseFrame {
  /** 窗口配置 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: 420,
    height: 320,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false
  }

  /** 路由路径 */
  protected readonly routePath = '/update'

  /**
   * 显示更新窗口
   * @param data - 更新信息
   */
  showUpdate(data: {
    version: string
    releaseNotes?: string
    releaseName?: string
  }): void {
    if (!this.isAlive()) {
      this.create()
    }

    // 发送更新信息到渲染进程
    this.send('update-available', data)

    // 居中显示
    this.window?.center()
    this.window?.show()
  }

  /**
   * 发送下载进度
   * @param progress - 下载进度
   */
  sendProgress(progress: {
    percent: number
    transferred: number
    total: number
    bytesPerSecond: number
  }): void {
    this.send('update-progress', progress)
  }

  /**
   * 发送下载完成通知
   */
  sendDownloadComplete(): void {
    this.send('update-downloaded')
  }

  /**
   * 发送错误通知
   * @param error - 错误信息
   */
  sendError(error: { message: string; code?: string }): void {
    this.send('update-error', error)
  }
}
