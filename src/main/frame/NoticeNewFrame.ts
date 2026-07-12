import { BrowserWindow, BrowserWindowConstructorOptions, screen, shell } from 'electron'
import BaseFrame from './BaseFrame'
import { windowFactory } from './index'
import { popupManager } from './PopupManager'
import type { NoticeType } from './PopupManager'
import ShareSelectFrame from './ShareSelectFrame'
import { textShareService } from '../service/textShareService'

/** 设置消息选项 */
export interface SetMsgOptions {
  /** 通知文本内容 */
  data: string
  /** 是否显示翻译按钮，默认 false */
  showTranslate?: boolean
  /** 通知类型，默认 'default' */
  type?: NoticeType
  /** 是否为持久通知，默认 false */
  isPersistent?: boolean
  /** 是否显示分享按钮，默认 false */
  showShare?: boolean
  /** 是否显示复制按钮（接收端文本通知），默认 false */
  showCopy?: boolean
  /** 是否显示关闭按钮（接收端文本通知），默认 false */
  showCloseText?: boolean
}

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

  /** 是否显示分享按钮（剪贴板通知） */
  #showShare = false

  /** 是否显示复制按钮（接收端文本通知） */
  #showCopy = false

  /** 是否显示关闭按钮（接收端文本通知） */
  #showCloseText = false

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
  }

  /** 路由路径 */
  protected readonly routePath = '/noticeNew'

  /**
   * 检测文本中是否包含链接
   * @param text - 要检测的文本
   * @returns 是否包含链接
   */
  static #containsUrl(text: string): boolean {
    return !!this.#extractUrl(text)
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
   * 设置待发送的消息（使用选项对象）
   * @param options - 通知选项
   */
  setMsg(options: SetMsgOptions) {
    this.#msg = options.data
    this.#showTranslate = options.showTranslate ?? false
    this.#type = options.type ?? 'default'
    this.#isPersistent = options.isPersistent ?? false
    this.#showShare = options.showShare ?? false
    this.#showCopy = options.showCopy ?? false
    this.#showCloseText = options.showCloseText ?? false
    // 自动检测链接并设置显示打开链接按钮
    this.#showOpenLink = NoticeNewFrame.#containsUrl(options.data)
    // 自动检测 JSON 格式并设置显示 JSON 工具按钮
    this.#showJsonTool = NoticeNewFrame.#containsJson(options.data)
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
        this.#isPersistent,
        this.#showShare,
        this.#showCopy,
        this.#showCloseText
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
    this.recvOne('to-main-NoticeNewFrame:translate', (event, text: string) => {
      // 只处理来自本窗口的事件
      if (!this.isAlive() || event.sender.id !== this.window!.webContents.id) return
      // 打开主页面并跳转到翻译页面
      windowFactory.getMainPageFrame().showAndTranslate(text)
    })

    // 打开链接按钮点击：使用系统默认浏览器打开链接
    this.recvOne('to-main-NoticeNewFrame:openLink', (event, text: string) => {
      // 只处理来自本窗口的事件，防止多个通知实例重复触发（ipcMain.on 是全局的）
      if (!this.isAlive() || event.sender.id !== this.window!.webContents.id) return
      // 从文本中提取链接并打开
      const url = NoticeNewFrame.#extractUrl(text)
      if (url) {
        shell.openExternal(url)
      }
    })

    // JSON 工具按钮点击：打开 JSON 工具窗口并发送内容
    this.recvOne('to-main-NoticeNewFrame:openJsonTool', (event, text: string) => {
      // 只处理来自本窗口的事件
      if (!this.isAlive() || event.sender.id !== this.window!.webContents.id) return
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

    // 分享按钮点击：打开设备选择弹窗
    this.recvOne('to-main-NoticeNewFrame:share', (event, text: string) => {
      if (!this.isAlive() || event.sender.id !== this.window!.webContents.id) return
      // 创建设备选择弹窗
      const frame = new ShareSelectFrame()
      frame.setShareText(text)
      const win = frame.create()
      // 通过 popupManager 显示
      popupManager.showPermissionNotice(
        () => win,
        { type: 'shareSelect', width: 380, height: 320 },
        (w) => {
          w.webContents.send('to-renderer-ShareSelectFrame:show', {
            text,
            devices: textShareService.getOnlineDevices()
          })
          w.webContents.send('to-renderer-ShareSelectFrame:animate', { action: 'enter' })
        }
      )
    })

    // 复制按钮点击（接收端文本通知）：复制文本到剪贴板
    this.recvOne('to-main-NoticeNewFrame:copyReceivedText', (event, text: string) => {
      if (!this.isAlive() || event.sender.id !== this.window!.webContents.id) return
      textShareService.copyTextToClipboard(text)
    })

    // 关闭按钮点击（接收端文本通知）：关闭持久通知
    this.recvOne('to-main-NoticeNewFrame:closeReceivedText', () => {
      if (!this.isAlive()) return
      textShareService.closeActiveReceivedNotice()
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
  destroy(): void {
    this.#msgSent = false
    super.destroy()
  }
}
