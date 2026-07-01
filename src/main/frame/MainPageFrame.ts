import { app, BrowserWindow, BrowserWindowConstructorOptions, screen } from 'electron'
import BaseFrame from './BaseFrame'

/**
 * 主页面窗口
 * @description 无边框主窗口，左键点击托盘图标打开，初始位置屏幕正中心
 */
export default class MainPageFrame extends BaseFrame {
  /** 窗口宽度 */
  static readonly WIDTH = 600

  /** 窗口高度 */
  static readonly HEIGHT = 450

  /** 最小宽度 */
  static readonly MIN_WIDTH = 600

  /** 最小高度 */
  static readonly MIN_HEIGHT = 450

  /** showCentered 防抖锁，防止快速多次触发导致状态冲突 */
  #showLock = false

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
   *
   * 防抖机制：快速多次触发（如按住快捷键）时，只有首次生效
   */
  showCentered(): void {
    // 防抖锁：防止快速多次触发导致状态竞争
    if (this.#showLock) {
      return
    }
    this.#showLock = true
    setTimeout(() => {
      this.#showLock = false
    }, 100)

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
      this.sendOne('to-renderer-MainPage:startHide')
    } else {
      // 窗口已存在但隐藏 → 确保 alwaysOnTop，居中，opacity: 0 → show → opacity: 1
      this.window!.setAlwaysOnTop(true)
      this.#centerOnScreen()
      this.window!.setOpacity(0)
      this.window!.show()
      setTimeout(() => {
        this.window?.setOpacity(1)
        this.sendOne('to-renderer-MainPage:reShow')
      }, 30)
    }
  }

  /**
   * 显示窗口并跳转到翻译页面
   * @param text - 要填充的文本内容
   * @description 与 showCentered() 不同，此方法不会 toggle 窗口可见性，
   *              窗口已显示时保持显示，未显示时创建并显示
   */
  showAndTranslate(text: string): void {
    if (!this.isAlive()) {
      // 窗口不存在 → 创建并显示，等待渲染进程准备好后切换页面
      this.create()
      this.#centerOnScreen()
      this.window!.setOpacity(0)
      this.window!.show()

      // 渲染进程加载完成后淡入并切换页面
      this.window!.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          this.window?.setOpacity(1)
          // 等待动画播放完毕后再切换页面
          setTimeout(() => {
            this.openTranslate(text)
          }, 400)
        }, 30)
      })
    } else {
      // 窗口已存在（无论是否可见）→ 确保显示并切换页面
      if (!this.window!.isVisible()) {
        this.window!.setAlwaysOnTop(true)
        this.#centerOnScreen()
        this.window!.setOpacity(0)
        this.window!.show()
        setTimeout(() => {
          this.window?.setOpacity(1)
          this.sendOne('to-renderer-MainPage:reShow')
          // 等待动画播放完毕后再切换页面
          setTimeout(() => {
            this.openTranslate(text)
          }, 400)
        }, 30)
      } else {
        // 窗口已显示 → 直接切换页面，不触发退场动画
        this.openTranslate(text)
      }
    }
  }

  /**
   * 最小化窗口让系统恢复焦点（用于粘贴场景）
   *
   * Windows:
   *   `minimize()` 比 `hide()` 更能可靠地触发焦点转移。
   *   Windows 最小化一个窗口时，一定会把焦点交给下一个窗口（而非丢到桌面）。
   *   因为 MainPage 有 skipTaskbar: true，最小化是无动画不可见的。
   *
   * macOS:
   *   使用 `hide()` + `app.hide()` 来隐藏应用，让系统焦点回到上一个应用。
   *   macOS 上 minimize 不会自动恢复焦点，需要隐藏整个应用。
   *
   * 先移除 alwaysOnTop，下次 showCentered() 会自动恢复。
   */
  minimizeForPaste(): void {
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.window.setAlwaysOnTop(false)

      if (process.platform === 'darwin') {
        // macOS: 隐藏当前窗口 + 隐藏整个应用，让系统恢复焦点
        this.window.hide()
        // app.hide() 会隐藏所有窗口，让焦点回到上一个应用
        app.hide()
        // 延迟恢复 app 状态，让焦点有时间转移
        setTimeout(() => {
          // app.unhide() 但不显示窗口，这样下次 showCentered() 时才显示
          // 注意：unhide() 是 macOS 特有 API，TypeScript 类型定义可能不包含
          ;(app as any).unhide()
        }, 200)
      } else {
        // Windows: 使用 minimize，Windows 会自动恢复焦点
        this.window.minimize()
      }
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
   * 打开翻译页面并填充文本
   * @param text - 要填充的文本内容
   */
  openTranslate(text: string): void {
    // 切换到翻译页面
    this.sendOne('to-renderer-MainPage:setPage', 'translate')

    // 发送文本到翻译页面
    setTimeout(() => {
      this.sendOne('to-renderer-Translate:fillText', text)
    }, 100)
  }

  /**
   * 注册 IPC 监听器
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 最小化窗口
    this.recvOne('to-main-MainPage:minimize', () => {
      if (this.isAlive()) {
        this.window!.minimize()
      }
    })

    // 退场动画播放完毕，隐藏窗口
    this.recvOne('to-main-MainPage:hideAfterAnimation', () => {
      if (this.isAlive()) {
        this.window!.hide()
      }
    })

    this.recvOne('to-main-MainPage:ready', () => {
      // 发送应用版本号到渲染进程
      this.sendOne('to-renderer-MainPage:version', app.getVersion())
    })

    // 从剪贴板历史记录跳转到翻译页面
    this.recvOne('to-main-MainPage:openTranslate', (_event, text: string) => {
      this.showAndTranslate(text)
    })
  }
}
