import { BrowserWindow, BrowserWindowConstructorOptions, screen, shell } from 'electron'
import BaseFrame from './BaseFrame'
import { windowFactory } from './WindowFactory'
import { getBottomMargin } from '../utils/platform'
import type { NoticeType } from './PopupManager'

/**
 * 通知弹窗
 * @description 底部居中弹出的通知提示窗口，显示时长由 PopupManager 统一管理
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

  /** 待发送的消息 */
  #msg = ''

  /** 是否显示翻译按钮（仅剪贴板通知显示） */
  #showTranslate = false

  /** 是否显示打开链接按钮（文本包含链接时显示） */
  #showOpenLink = false

  /** 是否显示 JSON 工具按钮（文本包含 JSON 格式时显示） */
  #showJsonTool = false

  /** 通知类型 */
  #type: NoticeType = 'default'

  /** 是否为持久通知（Claude Code 状态通知） */
  #isPersistent = false

  /** 是否已显示（持久通知复用同一实例） */
  #isShown = false

  /** 最后一次由 PopupManager 设定的 Y 坐标 */
  #lastTargetY?: number

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
   * 检测文本中是否包含 JSON 格式
   * @param text - 要检测的文本
   * @returns 是否包含 JSON 格式
   */
  static #containsJson(text: string): boolean {
    // 去除首尾空白后检测
    const trimmed = text.trim()
    if (!trimmed) return false

    // 检测 JSON 对象 {} 或 JSON 数组 []
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed)
        return true
      } catch {
        return false
      }
    }

    return false
  }

  /**
   * 设置待发送的消息
   * @param data - 通知文本内容
   * @param showTranslate - 是否显示翻译按钮，默认 false
   * @param type - 通知类型，默认 'default'
   * @param isPersistent - 是否为持久通知，默认 false
   */
  setMsg(data: string, showTranslate = false, type: NoticeType = 'default', isPersistent = false) {
    this.#msg = data
    this.#showTranslate = showTranslate
    this.#type = type
    this.#isPersistent = isPersistent
    // 自动检测链接并设置显示打开链接按钮
    this.#showOpenLink = NoticeNewFrame.#containsUrl(data)
    // 自动检测 JSON 格式并设置显示 JSON 工具按钮
    this.#showJsonTool = NoticeNewFrame.#containsJson(data)
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
      // 如果窗口已被 PopupManager 销毁，不再操作（避免孤儿窗口）
      if (!this.isAlive()) return

      // 如果消息还没发过（窗口创建时 send 丢失的情况），现在补发
      if (!this.#msgSent) {
        this.sendOne(
          'to-renderer-NoticeNewFrame:sendMsg',
          this.#msg,
          this.#showTranslate,
          this.#showOpenLink,
          this.#showJsonTool,
          this.#type,
          this.#isPersistent  // 新增参数
        )
      }
      // 使用缓存的 lastTargetY 避免覆盖 PopupManager 的定位
      await this.showAtBottomCenter(this.#lastTargetY)
    })

    // 鼠标进入通知卡片区域：临时关闭鼠标穿透，允许按钮交互
    this.recvOne('to-main-NoticeNewFrame:mouse-enter-card', () => {
      if (this.isAlive()) {
        this.window!.setIgnoreMouseEvents(false)
      }
    })

    // 鼠标离开通知卡片区域：恢复鼠标穿透，透明区域可点击
    this.recvOne('to-main-NoticeNewFrame:mouse-leave-card', () => {
      if (this.isAlive()) {
        this.window!.setIgnoreMouseEvents(true, { forward: true })
      }
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

    // JSON 工具按钮点击：打开 JSON 工具窗口并发送内容
    this.recvOne('to-main-NoticeNewFrame:openJsonTool', (_event, text: string) => {
      const frame = windowFactory.getJsonToolFrame()
      // 如果窗口不存在，创建窗口
      if (!frame.isAlive()) {
        frame.create()
      }
      // 发送内容到 JSON 工具窗口
      frame.sendContentToRenderer(text)
      // 显示窗口
      frame.show()
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
    // 距底部 60px（macOS 会额外加上 Dock 高度）
    const bottomMargin = getBottomMargin(NoticeNewFrame.BOTTOM_MARGIN)
    const y = workArea.y + workArea.height - NoticeNewFrame.POPUP_HEIGHT - bottomMargin

    return { x: Math.round(x), y: Math.round(y) }
  }

  /**
   * 在屏幕底部居中显示通知弹窗
   * @description 定位 → 发送消息 → 显示窗口（CSS 处理入场放大动画）
   *              支持重复调用：窗口销毁后会自动重建
   *              持久通知：如果已显示，只更新内容，不重新创建
   * @param targetY - 可选的目标 Y 坐标（由 PopupManager 计算），不传则自行计算
   */
  async showAtBottomCenter(targetY?: number): Promise<void> {
    // 持久通知：如果已显示，只更新内容，不重新创建
    if (this.#isPersistent && this.#isShown) {
      if (this.isAlive()) {
        this.sendOne(
          'to-renderer-NoticeNewFrame:sendMsg',
          this.#msg,
          this.#showTranslate,
          this.#showOpenLink,
          this.#showJsonTool,
          this.#type,
          this.#isPersistent
        )
      }
      return
    }

    if (!this.isAlive()) {
      this.#msgSent = false
      this.create()
      this.window!.setIgnoreMouseEvents(true, { forward: true })
    } else {
      this.sendOne(
        'to-renderer-NoticeNewFrame:sendMsg',
        this.#msg,
        this.#showTranslate,
        this.#showOpenLink,
        this.#showJsonTool,
        this.#type,
        this.#isPersistent
      )
      this.#msgSent = true
    }

    // 定位到目标 Y 坐标（由 PopupManager 计算）
    const basePos = this.#calcBottomCenterPosition()
    const pos = targetY !== undefined ? { x: basePos.x, y: targetY } : basePos
    if (targetY !== undefined) {
      this.#lastTargetY = targetY // 缓存目标位置，供 ready 处理器使用
    }
    this.window!.setBounds({
      x: pos.x,
      y: pos.y,
      width: NoticeNewFrame.getScreenWidth(),
      height: NoticeNewFrame.POPUP_HEIGHT
    })

    // 显示窗口（不抢占焦点）
    this.window!.showInactive()

    // 持久通知：标记已显示
    if (this.#isPersistent) {
      this.#isShown = true
    }
    // 不再设置自动销毁定时器，由 PopupManager 管理生命周期
  }

  /**
   * 移动窗口到目标 Y 坐标（不再自驱动动画，由 PopupManager 帧循环驱
动）
   * @param targetY - 目标 Y 坐标
   */
  moveTo(targetY: number): void {
    if (!this.isAlive()) return
    const [x] = this.window!.getPosition()
    this.window!.setPosition(x, targetY)
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
   * 获取是否为持久通知
   * @returns 是否为持久通知
   */
  isPersistent(): boolean {
    return this.#isPersistent
  }

  /**
   * 获取是否已显示（持久通知复用判断）
   * @returns 是否已显示
   */
  isShown(): boolean {
    return this.#isShown
  }

  /**
   * 销毁窗口（重置状态，不再自驱动收起动画）
   */
  async destroy(): Promise<void> {
    this.#msgSent = false
    this.#isShown = false
    super.destroy()
  }
}
