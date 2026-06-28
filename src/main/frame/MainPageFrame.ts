import { BrowserWindow, BrowserWindowConstructorOptions, screen } from 'electron'
import BaseFrame from './BaseFrame'

/**
 * 主页面窗口
 * @description 无边框主窗口，左键点击托盘图标打开，初始位置屏幕正中心
 */
export default class MainPageFrame extends BaseFrame {
  /** 窗口宽度 */
  static readonly WIDTH = 800

  /** 窗口高度 */
  static readonly HEIGHT = 600

  /** 最小宽度 */
  static readonly MIN_WIDTH = 600

  /** 最小高度 */
  static readonly MIN_HEIGHT = 450

  /** 窗口配置 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: MainPageFrame.WIDTH,
    height: MainPageFrame.HEIGHT,
    minWidth: MainPageFrame.MIN_WIDTH,
    minHeight: MainPageFrame.MIN_HEIGHT,
    transparent: true,
    frame: false,
    show: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true
  }

  /** 路由路径 */
  protected readonly routePath: string = '/mainPage'

  /**
   * 重写创建方法：阻止 ready-to-show 自动显示窗口
   * @description 窗口显示由 showCentered() 控制
   */
  create(): BrowserWindow {
    const window = super.create()
    // 立即隐藏，防止 BaseFrame 的 ready-to-show 监听器自动显示
    window.hide()
    // 移除自动显示监听器
    window.removeAllListeners('ready-to-show')
    return window
  }

  /**
   * 在屏幕正中心显示/隐藏窗口（toggle）
   * @description 首次调用创建并居中显示，后续调用切换可见性
   */
  showCentered(): void {
    if (!this.isAlive()) {
      // 窗口不存在 → 创建并居中显示
      this.create()
      this.#centerOnScreen()

      // 监听页面加载完成后显示窗口
      this.window!.webContents.once('did-finish-load', () => {
        this.window?.show()
        this.window?.focus()
      })

      // 如果页面已经加载完成（如缓存），直接显示
      if (this.window!.webContents.isLoading()) {
        // 还在加载中，等待 did-finish-load
      } else {
        this.window!.show()
        this.window!.focus()
      }
    } else if (this.window!.isVisible()) {
      // 窗口已显示 → 隐藏
      this.window!.hide()
    } else {
      // 窗口已存在但隐藏 → 重新居中并显示
      this.#centerOnScreen()
      this.window!.show()
      this.window!.focus()
    }
  }

  /**
   * 将窗口定位到屏幕正中心
   */
  #centerOnScreen(): void {
    if (!this.window || this.window.isDestroyed()) return

    const display = screen.getPrimaryDisplay()
    const { workArea } = display

    // 获取窗口当前实际尺寸（支持缩放后使用实际尺寸）
    const [width] = this.window.getSize()
    const height = this.window.getSize()[1]

    const x = Math.round(workArea.x + (workArea.width - width) / 2)
    const y = Math.round(workArea.y + (workArea.height - height) / 2)

    this.window.setPosition(x, y)
  }

  /**
   * 注册 IPC 监听器
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 最小化窗口
    this.registerIPCOn('main-page:minimize', () => {
      if (this.isAlive()) {
        this.window!.minimize()
      }
    })
  }
}
