import { BrowserWindow, BrowserWindowConstructorOptions, screen } from 'electron'
import BaseFrame from './BaseFrame'
import { windowFactory } from './WindowFactory'

/**
 * 通知弹窗
 * @description 底部居中弹出的通知提示窗口，契合悬浮球主题，5 秒后自动销毁
 *              入场缩放到大动画由渲染进程 CSS 实现，收起向下滑出由主进程控制
 */
export default class NoticeNewFrame extends BaseFrame {
  /** 弹窗宽度 */
  private static readonly POPUP_WIDTH = 360

  /** 弹窗高度（单行文字） */
  private static readonly POPUP_HEIGHT = 60

  /** 窗口底部距屏幕边缘的间距（像素） */
  private static readonly BOTTOM_MARGIN = 60

  /** 自动销毁延迟时间（毫秒） */
  private static readonly AUTO_DESTROY_DELAY = 5000

  /** 待发送的消息 */
  #msg = ''

  /** 自动销毁定时器 */
  #destroyTimer: ReturnType<typeof setTimeout> | null = null

  /** 动画帧 ID（仅用于收起动画） */
  #animationFrameId: ReturnType<typeof setTimeout> | null = null

  /** 消息是否已发送给渲染进程（避免窗口未加载时 send 丢失） */
  #msgSent = false

  /** 窗口配置 - 透明无边框轻量气泡 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: NoticeNewFrame.POPUP_WIDTH,
    height: NoticeNewFrame.POPUP_HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false
  }

  /** 路由路径 */
  protected readonly routePath = '/noticeNew'

  /**
   * 设置待发送的消息
   * @param data - 通知文本内容
   */
  setMsg(data: string) {
    this.#msg = data
    return this
  }

  /**
   * 创建窗口
   * @param autoShow - 是否自动显示，默认 false
   * @returns 窗口实例
   */
  create(autoShow = false): BrowserWindow {
    return super.create(autoShow)
  }

  /**
   * 注册 IPC 监听器
   * @description 监听渲染进程就绪事件，页面加载完成后发送缓存的消息并显示窗口
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 渲染进程已就绪，发送缓存的消息并显示弹窗
    this.recvOne('to-main-NoticeNewFrame:ready', async () => {
      // 如果消息还没发过（窗口创建时 send 丢失的情况），现在补发
      if (!this.#msgSent) {
        this.sendOne('to-renderer-NoticeNewFrame:sendMsg', this.#msg)
      }
      await this.showAtBottomCenter()
    })

    // 翻译按钮点击：打开主页面并切换到翻译页面
    this.recvOne('to-main-NoticeNewFrame:translate', (_event, text: string) => {
      // 打开主页面
      const mainPageFrame = windowFactory.getMainPageFrame()
      mainPageFrame.showCentered()

      // 发送 openTranslate 事件，让 MainPageFrame 处理页面切换和文本填充
      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed() && w.isVisible()) {
          w.webContents.send('to-main-MainPage:openTranslate', text)
        }
      })
    })
  }

  /**
   * 计算屏幕底部居中位置
   * @returns 窗口左上角坐标 { x, y }
   */
  #calcBottomCenterPosition(): { x: number; y: number } {
    const display = screen.getPrimaryDisplay()
    const { workArea } = display

    const popupW = NoticeNewFrame.POPUP_WIDTH
    const popupH = NoticeNewFrame.POPUP_HEIGHT

    // 水平居中
    const x = workArea.x + (workArea.width - popupW) / 2
    // 距底部 80px
    const y = workArea.y + workArea.height - popupH - NoticeNewFrame.BOTTOM_MARGIN

    return { x: Math.round(x), y: Math.round(y) }
  }

  /**
   * 执行窗口收起动画（向下滑出）
   * @description 窗口向下滑出屏幕
   * @param duration - 动画时长（毫秒）
   * @returns Promise 动画完成后 resolve
   */
  #animateSlideDown(duration: number = 250): Promise<void> {
    return new Promise((resolve) => {
      if (this.#animationFrameId) {
        clearTimeout(this.#animationFrameId)
      }

      const startTime = Date.now()
      const [x, startY] = this.window!.getPosition()

      // 目标位置：屏幕底部外
      const display = screen.getPrimaryDisplay()
      const screenHeight = display.workArea.height + display.workArea.y
      const targetY = screenHeight + 10

      const animate = (): void => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)

        // 缓动函数：easeInCubic - 先慢后快，自然离开
        const easeInCubic = progress * progress * progress
        const currentY = Math.round(startY + (targetY - startY) * easeInCubic)

        this.window!.setPosition(x, currentY)

        if (progress < 1) {
          this.#animationFrameId = setTimeout(animate, 8)
        } else {
          this.#animationFrameId = null
          resolve()
        }
      }

      animate()
    })
  }

  /**
   * 在屏幕底部居中显示通知弹窗
   * @description 定位 → 发送消息 → 显示窗口（CSS 处理入场放大动画） → 5 秒后自动销毁
   *              支持重复调用：窗口销毁后会自动重建
   */
  async showAtBottomCenter(): Promise<void> {
    // 清除之前的自动销毁定时器
    this.#clearDestroyTimer()

    const pos = this.#calcBottomCenterPosition()

    if (!this.isAlive()) {
      // 窗口不存在 → 创建新窗口（IPC handler 会在页面加载后补发消息）
      this.#msgSent = false
      this.create()
    } else {
      // 窗口已存在 → 直接发送消息
      this.sendOne('to-renderer-NoticeNewFrame:sendMsg', this.#msg)
      this.#msgSent = true
    }

    // 定位到屏幕底部居中（全尺寸）
    this.window!.setBounds({
      x: pos.x,
      y: pos.y,
      width: NoticeNewFrame.POPUP_WIDTH,
      height: NoticeNewFrame.POPUP_HEIGHT
    })

    // 显示窗口
    this.window!.show()

    // 启动 5 秒自动销毁定时器
    this.#destroyTimer = setTimeout(() => {
      this.destroy()
    }, NoticeNewFrame.AUTO_DESTROY_DELAY)
  }

  /**
   * 清除自动销毁定时器
   */
  #clearDestroyTimer(): void {
    if (this.#destroyTimer) {
      clearTimeout(this.#destroyTimer)
      this.#destroyTimer = null
    }
  }

  /**
   * 销毁窗口（附带收起动画和清理定时器）
   * @description 向下滑出后销毁窗口
   */
  async destroy(): Promise<void> {
    this.#clearDestroyTimer()

    if (this.isAlive()) {
      // 播放向下滑出动画
      await this.#animateSlideDown(250)
    }

    // 清理动画帧
    if (this.#animationFrameId) {
      clearTimeout(this.#animationFrameId)
      this.#animationFrameId = null
    }

    // 重置消息发送状态，下次 showAtBottomCenter 时重新创建窗口并发送消息
    this.#msgSent = false

    super.destroy()
  }
}
