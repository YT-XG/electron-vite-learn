import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import icon from '../../resources/icon.png?asset'

/**
 * 系统托盘服务
 * @description 管理系统托盘图标、菜单和事件
 */
export class TrayService {
  /** 托盘实例 */
  private tray: Tray | null = null

  /** 主窗口引用 */
  private mainWindow: BrowserWindow | null = null

  /** 托盘图标路径 */
  private readonly iconPath: string = icon

  /**
   * 构造函数
   * @param mainWindow - 主窗口实例
   */
  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
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
    this.tray.setToolTip('悬浮球时钟')

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
        label: '显示窗口',
        click: () => {
          this.showWindow()
        }
      },
      {
        label: '隐藏窗口',
        click: () => {
          this.hideWindow()
        }
      },
      { type: 'separator' },
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
  private setupEventListeners(): void {
    // 双击托盘图标显示/隐藏窗口
    this.tray?.on('double-click', () => {
      if (this.mainWindow?.isVisible()) {
        this.hideWindow()
      } else {
        this.showWindow()
      }
    })

    // 窗口关闭时隐藏到托盘（而不是退出）
    this.mainWindow?.on('close', (event) => {
      // 如果用户没有点击退出按钮，只是关闭窗口
      if (!(app as any).isQuitting) {
        event.preventDefault()
        this.hideWindow()
      }
    })
  }

  /**
   * 显示窗口
   */
  private showWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }

  /**
   * 隐藏窗口
   */
  private hideWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.hide()
    }
  }

  /**
   * 检查更新
   */
  private checkForUpdates(): void {
    // 发送事件到主窗口，触发更新检查
    this.mainWindow?.webContents.send('check-for-updates')
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
