import { BrowserWindowConstructorOptions } from 'electron'
import BaseFrame from './BaseFrame'

/**
 * 音乐窗口
 * @description 显示音乐播放对话框
 */
export default class MusicFrame extends BaseFrame {
  /** 窗口配置 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: 400,
    height: 200,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false
  }

  /** 路由路径 */
  protected readonly routePath = '/music'

  /**
   * 显示音乐窗口
   */
  showMusic(): void {
    if (!this.isAlive()) {
      this.create()
    }

    // 居中显示
    this.window?.center()
    this.window?.show()
  }
}
