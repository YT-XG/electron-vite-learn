import { app, Menu, Tray, nativeImage } from 'electron'
import icon from '../../resources/icon.png?asset'
import { windowFactory } from './frame'

/**
 * 系统托盘服务
 * @description 管理系统托盘图标、菜单和事件
 */
export class TrayService {
  /** 托盘实例 */
  private tray: Tray | null = null

  /** 托盘图标路径 */
  private readonly iconPath: string = icon

  /**
   * 构造函数
   */
  constructor() {
    this.createTray()
  }

  /**
   * 创建系统托盘
   */
  private createTray(): void {
    // 创建托盘图标
    const trayIcon = nativeImage.createFromPath(this.iconPath)
    this.tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))

    // 设置托盘提示文字
    this.tray.setToolTip('妙妙屋')

    // 创建右键菜单
    this.buildContextMenu()

    // 监听托盘事件
    this.setupEventListeners()
  }

  /**
   * 构建右键菜单
   */
  private buildContextMenu(): void {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '检查更新',
        click: () => {
          this.checkForUpdates()
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          this.quitApp()
        }
      }
    ])

    this.tray?.setContextMenu(contextMenu)
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {}

  /**
   * 检查更新
   * @description 显示更新弹窗并触发检查
   */
  private checkForUpdates(): void {
    windowFactory
      .getUpdateNewFrame()
      .checkForUpdates()
      .then((res) => {
        const noticeNewFrame = windowFactory.getNoticeNewFrame()
        noticeNewFrame.setMsg(res?.msg || '')
        noticeNewFrame.showAtBottomCenter()
      })
  }

  /**
   * 退出应用
   */
  private quitApp(): void {
    // 设置退出标志
    ;(app as any).isQuitting = true

    // 销毁托盘
    this.destroy()

    // 退出应用
    app.quit()
  }

  /**
   * 销毁托盘
   */
  destroy(): void {
    if (this.tray && !this.tray.isDestroyed()) {
      this.tray.destroy()
    }
    this.tray = null
  }

  /**
   * 获取托盘实例
   */
  getTray(): Tray | null {
    return this.tray
  }
}

export default TrayService
