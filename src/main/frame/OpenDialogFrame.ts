import BaseFrame from './BaseFrame'
import { BrowserWindow, BrowserWindowConstructorOptions, screen } from 'electron'
import { windowFactory } from './index'

/**
 * OpenDialog 窗口
 * @description 悬浮球悬停时向左/右侧展开的对话框窗口
 */
export default class OpenDialogFrame extends BaseFrame {
  /** 弹窗宽度 */
  static readonly POPUP_WIDTH = 400

  /** 弹窗高度 */
  static readonly POPUP_HEIGHT = 300

  /** 悬浮球宽度 */
  private static readonly BALL_SIZE = 90

  /** 延迟隐藏时间（毫秒）— 鼠标离开悬浮球和弹窗后等待 3 秒再收起 */
  private static readonly HIDE_DELAY = 3000

  /** 是否正在显示 */
  #isShowing = false

  /** 鼠标是否在弹窗内 */
  #isMouseInPopup = false

  /** 鼠标是否在悬浮球上 */
  #isMouseOnBall = false

  /** 延迟隐藏定时器 */
  #hideTimer: ReturnType<typeof setTimeout> | null = null

  /** 窗口配置 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: OpenDialogFrame.POPUP_WIDTH,
    height: OpenDialogFrame.POPUP_HEIGHT,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false
  }

  /** 路由路径 */
  protected readonly routePath: string = '/openDialog'

  /**
   * 重写创建方法：阻止 ready-to-show 自动显示窗口
   * @description 弹窗的位置由 showPopup() 控制，不能在页面加载时自动 show
   */
  create(): BrowserWindow {
    const window = super.create()
    // 立即隐藏窗口，防止 BaseFrame 的 ready-to-show 监听器自动显示
    window.hide()
    // 移除 ready-to-show 监听器，后续由 showPopup() 控制显示
    window.removeAllListeners('ready-to-show')
    return window
  }

  /**
   * 注册 IPC 监听器
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 鼠标进入弹窗区域 — 标记状态 + 取消隐藏
    this.recvOne('to-main-OpenDialogFrame:mouseEnter', () => {
      this.#isMouseInPopup = true
      this.#clearHideTimer()
    })

    // 鼠标离开弹窗区域 — 标记状态 + 启动延迟隐藏
    this.recvOne('to-main-OpenDialogFrame:mouseLeave', () => {
      this.#isMouseInPopup = false
      this.#startHideTimer()
    })
  }

  /**
   * 设置鼠标在悬浮球上的状态（由 BallFrame 的 IPC 处理器调用）
   * @param onBall - 鼠标是否在悬浮球上
   */
  setMouseOnBall(onBall: boolean): void {
    this.#isMouseOnBall = onBall
    if (onBall) {
      // 鼠标回到悬浮球 → 取消隐藏定时器
      this.#clearHideTimer()
    } else {
      // 鼠标离开悬浮球 → 启动延迟隐藏
      this.#startHideTimer()
    }
  }

  /**
   * 显示弹窗
   * @description 从悬浮球左侧或右侧展开，根据屏幕空间决定方向
   */
  showPopup(): void {
    // 清除隐藏定时器
    this.#clearHideTimer()

    // 如果窗口已经显示，不重复触发动画
    if (this.isAlive() && this.#isShowing) {
      return
    }

    const pos = this.#calcPosition()

    if (!this.isAlive()) {
      // 窗口不存在 → 创建（不自动显示），定位后显示
      this.create()
      this.window!.setPosition(pos.x, pos.y)
      // 使用 ready-to-show 确保页面加载完成后再显示
      this.window!.once('ready-to-show', () => {
        this.window?.show()
        this.#isShowing = true
        // 通知渲染进程播放展开动画
        this.sendOne('to-renderer-OpenDialogFrame:animate', { direction: pos.direction })
      })
    } else {
      // 窗口已存在（隐藏状态）→ 定位 + 显示
      this.window!.setPosition(pos.x, pos.y)
      this.window!.show()
      this.#isShowing = true
      // 通知渲染进程播放展开动画
      this.sendOne('open-dialog:animate', { direction: pos.direction })
    }
  }

  /**
   * 延迟隐藏弹窗
   * @description 当鼠标离开悬浮球时调用，如果鼠标在弹窗内则不隐藏
   */
  #startHideTimer(): void {
    this.#clearHideTimer()
    this.#hideTimer = setTimeout(() => {
      // 只有鼠标不在弹窗内且不在悬浮球上时才隐藏
      if (!this.#isMouseInPopup && !this.#isMouseOnBall) {
        this.hide()
      }
    }, OpenDialogFrame.HIDE_DELAY)
  }

  /**
   * 清除隐藏定时器
   */
  #clearHideTimer(): void {
    if (this.#hideTimer) {
      clearTimeout(this.#hideTimer)
      this.#hideTimer = null
    }
  }

  /**
   * 隐藏弹窗
   */
  hide(): void {
    this.#clearHideTimer()
    if (this.isAlive() && this.#isShowing) {
      this.#isShowing = false
      this.sendOne('to-renderer-OpenDialogFrame:close')
      // 延迟隐藏，让关闭动画播放
      setTimeout(() => {
        if (!this.#isShowing) {
          this.window?.hide()
        }
      }, 300)
    }
  }

  /**
   * 延迟隐藏弹窗
   * @description 当鼠标离开悬浮球时调用，如果鼠标在弹窗内则不隐藏
   */
  hideWithDelay(): void {
    this.#startHideTimer()
  }

  /**
   * 定位弹窗到悬浮球左侧或右侧
   * @description 拖拽悬浮球时跟随移动
   */
  positionAboveBall(): void {
    if (!this.isAlive()) return
    const pos = this.#calcPosition()
    this.window!.setPosition(pos.x, pos.y)
  }

  /**
   * 检查是否正在显示
   */
  isShowing(): boolean {
    return this.#isShowing
  }

  /**
   * 计算弹窗应定位到的位置
   * @description 根据悬浮球位置和屏幕空间，决定向左还是向右展开
   */
  #calcPosition(): { x: number; y: number; direction: 'left' | 'right' } {
    const mainFrame = windowFactory.getBallFrame()
    const mainWindow = mainFrame.getWindow()
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { x: 0, y: 0, direction: 'right' }
    }

    const [ballX, ballY] = mainWindow.getPosition()
    const display = screen.getDisplayNearestPoint({ x: ballX, y: ballY })
    const { workArea } = display

    const popupW = OpenDialogFrame.POPUP_WIDTH
    const popupH = OpenDialogFrame.POPUP_HEIGHT
    const ballW = OpenDialogFrame.BALL_SIZE
    const ballH = OpenDialogFrame.BALL_SIZE
    const gap = 10

    // 计算右侧空间
    const spaceRight = workArea.x + workArea.width - (ballX + ballW) - gap
    // 计算左侧空间
    const spaceLeft = ballX - workArea.x - gap

    let popupX: number
    let direction: 'left' | 'right'

    // 优先向右展开，空间不足则向左
    if (spaceRight >= popupW) {
      popupX = ballX + ballW + gap
      direction = 'right'
    } else if (spaceLeft >= popupW) {
      popupX = ballX - popupW - gap
      direction = 'left'
    } else {
      // 两边都不够，选择空间较大的一侧
      if (spaceRight >= spaceLeft) {
        popupX = ballX + ballW + gap
        direction = 'right'
      } else {
        popupX = ballX - popupW - gap
        direction = 'left'
      }
    }

    // 垂直居中对齐悬浮球
    let popupY = ballY + (ballH - popupH) / 2

    // 限制在屏幕工作区域内
    popupX = Math.max(workArea.x, Math.min(popupX, workArea.x + workArea.width - popupW))
    popupY = Math.max(workArea.y, Math.min(popupY, workArea.y + workArea.height - popupH))

    return { x: Math.round(popupX), y: Math.round(popupY), direction }
  }
}
