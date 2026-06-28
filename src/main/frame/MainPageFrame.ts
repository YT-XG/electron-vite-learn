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
   * 重写创建方法
   */
  create(): BrowserWindow {
    const window = super.create()
    window.hide()
    return window
  }

  /**
   * 在屏幕正中心显示/隐藏窗口（toggle）
   * @description 首次调用创建并居中显示，后续调用切换可见性
   *
   * 注意：每次显示时都会确保 alwaysOnTop 为 true，
   * 因为 minimizeForPaste() 可能在粘贴过程中临时移除了 alwaysOnTop
   */
  showCentered(): void {
    if (!this.isAlive()) {
      // 窗口不存在 → 创建并居中，opacity: 0 → show → opacity: 1
      this.create()
      this.#centerOnScreen()
      this.window!.setOpacity(0)
      this.window!.show()

      // 渲染进程加载完成后淡入
      this.window!.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          this.window?.setOpacity(1)
        }, 30)
      })
    } else if (this.window!.isVisible()) {
      // 窗口已显示 → 通知渲染进程播放退场动画，动画完成后通知主进程隐藏
      this.window!.webContents.send('main-page:start-hide')
    } else {
      // 窗口已存在但隐藏 → 确保 alwaysOnTop，居中，opacity: 0 → show → opacity: 1
      this.window!.setAlwaysOnTop(true)
      this.#centerOnScreen()
      this.window!.setOpacity(0)
      this.window!.show()
      setTimeout(() => {
        this.window?.setOpacity(1)
        this.window!.webContents.send('main-page:re-show')
      }, 30)
    }
  }

  /**
   * 最小化窗口让 Windows 自然恢复焦点（用于粘贴场景）
   *
   * 原理：`minimize()` 比 `hide()` 更能可靠地触发焦点转移。
   * Windows 最小化一个窗口时，一定会把焦点交给下一个窗口（而非丢到桌面）。
   * 因为 MainPage 有 skipTaskbar: true，最小化是无动画不可见的。
   *
   * 先移除 alwaysOnTop，这样 minimize 时 Windows 从"普通窗口"栈里选焦点窗口，
   * 焦点会回到用户打开剪贴板之前用的那个窗口。
   *
   * 下次 showCentered() 会自动恢复 alwaysOnTop。
   */
  minimizeForPaste(): void {
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.window.setAlwaysOnTop(false)
      this.window.minimize()
    }
  }

  /**
   * 将窗口定位到屏幕正中心
   */
  #centerOnScreen(): void {
    if (!this.window || this.window.isDestroyed()) return

    const display = screen.getPrimaryDisplay()
    const { workArea } = display

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

    // 退场动画播放完毕，隐藏窗口
    this.registerIPCOn('main-page:hide-after-animation', () => {
      if (this.isAlive()) {
        this.window!.hide()
      }
    })
  }
}
