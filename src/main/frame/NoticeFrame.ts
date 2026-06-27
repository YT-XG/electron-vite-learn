import { BrowserWindowConstructorOptions } from 'electron'
import BaseFrame from './BaseFrame'

/**
 * 通知窗口
 * @description 显示剪贴板通知，从右下角弹出
 */
export default class NoticeFrame extends BaseFrame {
  /** 窗口配置 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: 300,
    height: 110,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false
  }

  /** 路由路径 */
  protected readonly routePath = '/notice'

  /**
   * 显示通知窗口（从右下角弹出）
   * @param text - 通知文本
   */
  showNotice(text: string): void {
    if (!this.isAlive()) {
      this.create()
    }

    // 发送通知文本到渲染进程
    this.send('show-notice', text)

    // 获取屏幕尺寸，定位到右下角
    const { screen } = require('electron')
    const display = screen.getPrimaryDisplay()
    const { width, height } = display.workAreaSize

    const windowWidth = this.options.width || 300
    const windowHeight = this.options.height || 200

    const x = width - windowWidth - 20
    const y = height - windowHeight - 20

    this.window?.setPosition(x, y)
    this.window?.show()
  }
}
