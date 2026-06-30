import { app, Menu, Tray, nativeImage } from 'electron'
import icon from '../../../resources/icon.png?asset'
import { windowFactory } from '../frame'

/**
 * 系统托盘服务
 * @description 管理系统托盘图标、菜单和事件
 */
export class TrayService {
  /** 托盘实例 */
  private tray: Tray | null = null

  /** 托盘图标路径 */
  private readonly iconPath: string = icon

  /** 右键上下文菜单 */
  private contextMenu: Electron.Menu | null = null

  /** 是否正在检查更新（防抖） */
  #isChecking = false

  /** 是否为 macOS 平台 */
  private readonly isMacOS = process.platform === 'darwin'

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
   * @description 不直接设置到托盘，由 right-click 事件手动弹出
   */
  private buildContextMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = []

    // macOS: 添加"显示主窗口"选项（因为左键是弹菜单，需要手动触发显示）
    if (this.isMacOS) {
      template.push({
        label: '显示主窗口',
        click: () => {
          windowFactory.getMainPageFrame().showCentered()
        }
      })
      template.push({ type: 'separator' })
    }

    template.push(
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
    )

    this.contextMenu = Menu.buildFromTemplate(template)
  }

  /**
   * 设置事件监听器
   * @description macOS 左键弹出菜单，Windows 左键切换主页面，右键显示菜单
   */
  private setupEventListeners(): void {
    if (this.isMacOS) {
      // macOS: 左键单击弹出上下文菜单（macOS 菜单栏托盘行为）
      this.tray?.on('click', () => {
        if (this.contextMenu) {
          this.tray?.popUpContextMenu(this.contextMenu)
        }
      })
    } else {
      // Windows: 左键单击切换主页面显示/隐藏
      this.tray?.on('click', () => {
        windowFactory.getMainPageFrame().showCentered()
      })
    }

    // 右键单击显示上下文菜单（两个平台都需要）
    this.tray?.on('right-click', () => {
      if (this.contextMenu) {
        this.tray?.popUpContextMenu(this.contextMenu)
      }
    })
  }

  /**
   * 检查更新
   * @description 显示更新弹窗并触发检查，防抖避免重复点击
   */
  private checkForUpdates(): void {
    // 防抖：正在检查时忽略重复点击
    if (this.#isChecking) {
      return
    }

    this.#isChecking = true

    windowFactory.getNoticeManager().show({
      text: '正在检查更新...',
      duration: 3000
    })

    windowFactory
      .getUpdateNewFrame()
      .checkForUpdates()
      .then((res) => {
        windowFactory.getNoticeManager().show({
          text: res?.msg || '',
          duration: 5000
        })
      })
      .finally(() => {
        this.#isChecking = false
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
