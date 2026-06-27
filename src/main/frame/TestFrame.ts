import BaseFrame from './BaseFrame'
import * as Electron from 'electron'
import { join } from 'path'

export default class TestFrame extends BaseFrame {
  protected options: Electron.BrowserWindowConstructorOptions = {
    width: 320,
    height: 200,
    transparent: true,
    frame: false,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  }
  protected routePath: string = '/test'

  /**
   * 创建窗口并定位到屏幕右下角
   */
  create(): Electron.BrowserWindow {
    const window = super.create()
    // 定位到屏幕右下角，留 20px 边距
    const { screen } = Electron
    const { workArea } = screen.getPrimaryDisplay()
    const x = workArea.x + workArea.width - 320 - 20
    const y = workArea.y + workArea.height - 200 - 20
    window.setPosition(x, y)
    return window
  }
}
