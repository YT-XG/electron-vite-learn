import { BrowserWindowConstructorOptions } from 'electron'
import BaseFrame from './BaseFrame'

/**
 * 更新窗口
 * @description 显示软件更新对话框
 */
export default class UpdateFrame extends BaseFrame {
  /** 窗口配置 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: 400,
    height: 300,
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
   * @param version - 新版本号
   * @param releaseNotes - 更新说明
   */
  showUpdate(version: string, releaseNotes?: string): void {
    if (!this.isAlive()) {
      this.create()
    }

    // 发送更新信息到渲染进程
    this.send('update-available', { version, releaseNotes })

    // 居中显示
    this.window?.center()
    this.window?.show()
  }
}
