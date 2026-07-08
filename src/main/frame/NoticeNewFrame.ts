import { BrowserWindow, BrowserWindowConstructorOptions, screen, shell } from 'electron'
import BaseFrame from './BaseFrame'
import { windowFactory } from './index'
import type { NoticeType } from './PopupManager'

/**
 * 通知弹窗
 * @description 从右侧滑入的通知提示窗口，位置由 PopupManager 统一管理（槽位式布局，右下角堆叠）
 *              入场/出场动画由渲染进程 CSS 实现（从右侧滑入/滑出）
 *              窗口透明，仅卡片区域可交互
 *              支持翻译按钮、打开链接按钮、JSON 工具按钮和 Claude Code 持久状态通知
 */
export default class NoticeNewFrame extends BaseFrame {
  /** 弹窗高度（单行文字） */
  private static readonly POPUP_HEIGHT = 60

  /** 窗口固定宽度（屏幕完整宽度，给渲染进程更多扩展空间，延迟求值避免 app ready 前调用） */
  private static getScreenWidth(): number {
    return screen.getPrimaryDisplay().workArea.width
  }

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

  /** 消息是否已发送给渲染进程（避免重复发送） */
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
   * @description 由 PopupManager 调用，创建后不自动显示（由 PopupManager 控制显示时机）
   * @returns 窗口实例
   */
  create(): BrowserWindow {
    this.#msgSent = false
    const win = super.create()
    // 设置鼠标穿透，透明区域可点击穿透
    win.setIgnoreMouseEvents(true, { forward: true })
    return win
  }

  /**
   * 注册 IPC 监听器
   * @description 监听渲染进程就绪事件，页面加载完成后发送缓存的消息
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 渲染进程已就绪，发送缓存的消息
    this.recvOne('to-main-NoticeNewFrame:ready', async () => {
      // 如果窗口已被 PopupManager 销毁，不再操作（避免孤儿窗口）
      if (!this.isAlive()) return

      // 持久通知的消息由 claudeCodeService 通过 did-finish-load 直接发送到 webContents，
      // ready 处理器不重复发送，避免覆盖已有内容
      if (this.#isPersistent) return

      // 防止重复发送（setMsg 和 create 之间的时序保护）
      if (this.#msgSent) return

      this.#msgSent = true
      this.sendOne(
        'to-renderer-NoticeNewFrame:sendMsg',
        this.#msg,
        this.#showTranslate,
        this.#showOpenLink,
        this.#showJsonTool,
        this.#type,
        this.#isPersistent
      )
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
   * 获取是否为持久通知
   * @returns 是否为持久通知
   */
  isPersistent(): boolean {
    return this.#isPersistent
  }

  /**
   * 销毁窗口（重置状态）
   */
  async destroy(): Promise<void> {
    this.#msgSent = false
    super.destroy()
  }
}
