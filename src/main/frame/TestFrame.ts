import BaseFrame from './BaseFrame'
import { BrowserWindow, BrowserWindowConstructorOptions, ipcMain, screen } from 'electron'
import { windowFactory } from './index'

/** 弹窗状态 */
export type PopupState = 'checking' | 'available' | 'latest'

/** 弹窗数据 */
export interface PopupData {
  version?: string
  direction?: string
  state: PopupState
}

/**
 * 更新通知弹窗
 * @description 从悬浮球上方/下方冒出的小气泡，显示版本更新信息
 */
export default class TestFrame extends BaseFrame {
  /** 弹窗宽度 */
  private static readonly POPUP_WIDTH = 280

  /** 弹窗高度 */
  private static readonly POPUP_HEIGHT = 38

  /** 悬浮球宽度 */
  private static readonly BALL_SIZE = 90

  /** 自动关闭定时器 */
  #autoCloseTimer: ReturnType<typeof setTimeout> | null = null

  /** 待显示的数据（窗口创建后由渲染进程请求） */
  #pendingData: PopupData | null = null

  /** 窗口配置 - 小尺寸透明气泡 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: TestFrame.POPUP_WIDTH,
    height: TestFrame.POPUP_HEIGHT,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false
  }

  /** 路由路径 */
  protected readonly routePath: string = '/test'

  /**
   * 重写创建方法：阻止 ready-to-show 自动显示窗口
   * @description 弹窗的位置由 showPopup() 控制，不能在页面加载时自动 show
   */
  create(): BrowserWindow {
    const window = super.create()
    window.removeAllListeners('ready-to-show')
    return window
  }

  /**
   * 注册 IPC 监听器
   * @description 处理弹窗显示、定位、数据请求等
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 渲染进程请求更新数据（组件挂载后调用，解决窗口创建时序问题）
    ipcMain.handle('get-update-data', () => {
      const data = this.#pendingData
      this.#pendingData = null
      return data
    })

    // 重新定位弹窗（拖拽悬浮球时跟随移动）
    ipcMain.on('update-popup:reposition', () => {
      if (this.isAlive()) {
        this.positionAboveBall()
      }
    })
  }

  /**
   * 显示更新弹窗
   * @param data - 弹窗数据（状态、版本号等）
   */
  showPopup(data: PopupData): void {
    // 计算方向
    const pos = this.#calcPosition()
    const direction = pos.above ? 'above' : 'below'
    const payload = { ...data, direction }

    if (!this.isAlive()) {
      // 窗口不存在 → 创建（不自动显示），缓存数据，定位后手动显示
      this.#pendingData = payload
      this.create()
      this.window!.setPosition(pos.x, pos.y)
      this.window!.once('ready-to-show', () => {
        this.window?.show()
      })
    } else {
      // 窗口已存在（隐藏状态）→ 定位 + 发送数据 + 显示
      this.window!.setPosition(pos.x, pos.y)
      this.send('show-update-popup', payload)
      this.window!.show()
    }

    // 根据状态设置不同的自动关闭时间
    this.#startAutoCloseTimer(data.state)
  }

  /**
   * 更新弹窗状态（不重新创建窗口）
   * @param data - 弹窗数据
   */
  updatePopup(data: PopupData): void {
    if (!this.isAlive()) return

    const pos = this.#calcPosition()
    const direction = pos.above ? 'above' : 'below'
    this.send('show-update-popup', { ...data, direction })

    // 重置自动关闭定时器
    this.#startAutoCloseTimer(data.state)
  }

  /**
   * 定位弹窗到悬浮球正上方/下方
   */
  positionAboveBall(): void {
    if (!this.isAlive()) return
    const pos = this.#calcPosition()
    this.window!.setPosition(pos.x, pos.y)
  }

  /**
   * 计算弹窗应定位到的位置
   */
  #calcPosition(): { x: number; y: number; above: boolean } {
    const mainFrame = windowFactory.getMainFrame()
    const mainWindow = mainFrame.getWindow()
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { x: 0, y: 0, above: true }
    }

    const [ballX, ballY] = mainWindow.getPosition()
    const display = screen.getDisplayNearestPoint({ x: ballX, y: ballY })
    const { workArea } = display

    const popupW = TestFrame.POPUP_WIDTH
    const popupH = TestFrame.POPUP_HEIGHT
    const ballW = TestFrame.BALL_SIZE
    const ballH = TestFrame.BALL_SIZE
    const gap = 6

    let popupX = ballX + (ballW - popupW) / 2

    let popupY: number
    const spaceAbove = ballY - workArea.y
    const above = spaceAbove >= popupH + gap

    if (above) {
      popupY = ballY - popupH - gap
    } else {
      popupY = ballY + ballH + gap
    }

    popupX = Math.max(workArea.x, Math.min(popupX, workArea.x + workArea.width - popupW))
    popupY = Math.max(workArea.y, Math.min(popupY, workArea.y + workArea.height - popupH))

    return { x: Math.round(popupX), y: Math.round(popupY), above }
  }

  /**
   * 启动自动关闭定时器
   * @param state - 弹窗状态，决定自动关闭时间
   */
  #startAutoCloseTimer(state: PopupState): void {
    this.#clearAutoCloseTimer()
    // 检查中：不自动关闭；已是最新版：3秒；有新版本：10秒
    const delay = state === 'latest' ? 3000 : state === 'available' ? 10000 : 0
    if (delay > 0) {
      this.#autoCloseTimer = setTimeout(() => {
        this.close()
      }, delay)
    }
  }

  #clearAutoCloseTimer(): void {
    if (this.#autoCloseTimer) {
      clearTimeout(this.#autoCloseTimer)
      this.#autoCloseTimer = null
    }
  }

  close(): void {
    this.#clearAutoCloseTimer()
    super.close()
  }

  destroy(): void {
    this.#clearAutoCloseTimer()
    super.destroy()
  }
}
