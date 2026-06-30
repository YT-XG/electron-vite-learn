import { BrowserWindow, BrowserWindowConstructorOptions, screen, shell } from 'electron'
import BaseFrame from './BaseFrame'
import { windowFactory } from './WindowFactory'

/**
 * 通知弹窗
 * @description 底部居中弹出的通知提示窗口，契合悬浮球主题，5 秒后自动销毁
 *              入场缩放到大动画由渲染进程 CSS 实现，收起向下滑出由主进程控制
 */
export default class NoticeNewFrame extends BaseFrame {
  /** 弹窗高度（单行文字） */
  private static readonly POPUP_HEIGHT = 60

  /** 窗口固定宽度（屏幕完整宽度，给渲染进程更多扩展空间，延迟求值避免 app ready 前调用） */
  private static getScreenWidth(): number {
    return screen.getPrimaryDisplay().workArea.width
  }

  /** 窗口底部距屏幕边缘的间距（像素） */
  private static readonly BOTTOM_MARGIN = 60

  /** 显示时长（毫秒），默认 5000 */
  #duration = 5000

  /** 待发送的消息 */
  #msg = ''

  /** 是否显示翻译按钮（仅剪贴板通知显示） */
  #showTranslate = false

  /** 是否显示打开链接按钮（文本包含链接时显示） */
  #showOpenLink = false

  /** 自动销毁定时器 */
  #destroyTimer: ReturnType<typeof setTimeout> | null = null

  /** 动画帧 ID（仅用于收起动画） */
  #animationFrameId: ReturnType<typeof setTimeout> | null = null

  /** 消息是否已发送给渲染进程（避免窗口未加载时 send 丢失） */
  #msgSent = false

  /** 窗口配置 - 透明无边框轻量气泡（宽度固定为屏幕宽度） */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: NoticeNewFrame.getScreenWidth(),
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
   * 检测文本中是否包含链接
   * @param text - 要检测的文本
   * @returns 是否包含链接
   */
  static #containsUrl(text: string): boolean {
    // URL 正则表达式，匹配 http/https/ftp 等协议开头的链接
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
    return urlRegex.test(text)
  }

  /**
   * 从文本中提取第一个链接
   * @param text - 要提取链接的文本
   * @returns 提取到的链接，如果没有则返回空字符串
   */
  static #extractUrl(text: string): string {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
    const match = text.match(urlRegex)
    return match ? match[0] : ''
  }

  /**
   * 设置待发送的消息
   * @param data - 通知文本内容
   * @param showTranslate - 是否显示翻译按钮，默认 false
   */
  setMsg(data: string, showTranslate = false) {
    this.#msg = data
    this.#showTranslate = showTranslate
    // 自动检测链接并设置显示打开链接按钮
    this.#showOpenLink = NoticeNewFrame.#containsUrl(data)
    return this
  }

  /**
   * 设置显示时长
   * @param ms - 显示时长（毫秒）
   */
  setDuration(ms: number): void {
    this.#duration = ms
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
        this.sendOne(
          'to-renderer-NoticeNewFrame:sendMsg',
          this.#msg,
          this.#showTranslate,
          this.#showOpenLink
        )
      }
      await this.showAtBottomCenter()
    })

    // 翻译按钮点击：打开主页面并切换到翻译页面
    this.recvOne('to-main-NoticeNewFrame:translate', (_event, text: string) => {
      // 打开主页面并跳转到翻译页面
      windowFactory.getMainPageFrame().showAndTranslate(text)
    })

    // 打开链接按钮点击：使用系统默认浏览器打开链接
    this.recvOne('to-main-NoticeNewFrame:openLink', (_event, text: string) => {
      // 从文本中提取链接并打开
      const url = NoticeNewFrame.#extractUrl(text)
      if (url) {
        shell.openExternal(url)
      }
    })

  }

  /**
   * 计算屏幕底部居中位置
   * @returns 窗口左上角坐标 { x, y }
   */
  #calcBottomCenterPosition(): { x: number; y: number } {
    const display = screen.getPrimaryDisplay()
    const { workArea } = display

    // 左对齐到屏幕工作区
    const x = workArea.x
    // 距底部 80px
    const y = workArea.y + workArea.height - NoticeNewFrame.POPUP_HEIGHT - NoticeNewFrame.BOTTOM_MARGIN

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
      this.sendOne(
        'to-renderer-NoticeNewFrame:sendMsg',
        this.#msg,
        this.#showTranslate,
        this.#showOpenLink
      )
      this.#msgSent = true
    }

    // 定位到屏幕底部（窗口宽度固定为屏幕宽度）
    this.window!.setBounds({
      x: pos.x,
      y: pos.y,
      width: NoticeNewFrame.getScreenWidth(),
      height: NoticeNewFrame.POPUP_HEIGHT
    })

    // 显示窗口
    this.window!.show()

    // 启动自动销毁定时器（使用实例级 duration）
    this.#destroyTimer = setTimeout(() => {
      this.destroy()
    }, this.#duration)
  }

  /**
   * 平滑移动窗口到目标 Y 坐标
   * @param targetY - 目标 Y 坐标
   * @param animated - 是否使用动画，默认 true
   */
  moveTo(targetY: number, animated = true): void {
    if (!this.isAlive()) return

    if (!animated) {
      const [x] = this.window!.getPosition()
      this.window!.setPosition(x, targetY)
      return
    }

    const [x, startY] = this.window!.getPosition()
    if (startY === targetY) return

    const duration = 300
    const startTime = Date.now()

    const animate = (): void => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      // 缓动函数：easeOutCubic - 先快后慢，自然停止
      const easeOutCubic = 1 - Math.pow(1 - progress, 3)
      const currentY = Math.round(startY + (targetY - startY) * easeOutCubic)

      this.window!.setPosition(x, currentY)

      if (progress < 1) {
        setTimeout(animate, 8)
      }
    }

    animate()
  }

  /**
   * 获取窗口当前 Y 坐标
   * @returns Y 坐标，窗口不存在时返回 0
   */
  getY(): number {
    if (!this.isAlive()) return 0
    const [, y] = this.window!.getPosition()
    return y
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
