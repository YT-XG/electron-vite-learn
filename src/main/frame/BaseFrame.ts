import { app, BrowserWindow, BrowserWindowConstructorOptions, ipcMain, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/icon.png?asset'

/** IPC on 处理器类型 */
type IPCOnHandler = {
  channel: string
  type: 'on'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (event: Electron.IpcMainEvent, ...args: any[]) => void
}

/** IPC handle 处理器类型 */
type IPCHandleHandler = {
  channel: string
  type: 'handle'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any
}

/** IPC 处理器联合类型 */
type IPCHandler = IPCOnHandler | IPCHandleHandler

/**
 * 窗口基类 - 封装所有窗口的通用逻辑
 * @description 提供窗口创建、IPC 通信、生命周期管理等基础功能
 */
export default abstract class BaseFrame {
  /** 窗口实例 */
  protected window: BrowserWindow | null = null

  /** 窗口配置（子类必须实现） */
  protected abstract readonly options: BrowserWindowConstructorOptions

  /** 路由路径（子类必须实现） */
  protected abstract readonly routePath: string

  /** 已注册的 IPC 处理器列表（窗口销毁时自动清理） */
  private ipcHandlers: IPCHandler[] = []

  /** 销毁回调（由 WindowFactory 设置，销毁时自动清空引用） */
  onDestroyCallback: (() => void) | null = null

  /**
   * 创建窗口
   * @param autoShow - 是否在 ready-to-show 时自动显示，默认 false
   * @returns 窗口实例
   */
  create(autoShow = false): BrowserWindow {
    // 合并默认配置和子类配置
    const defaultOptions: BrowserWindowConstructorOptions = {
      show: false,
      autoHideMenuBar: true,
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    }

    this.window = new BrowserWindow({
      ...defaultOptions,
      ...this.options
    })

    // 窗口准备好后根据参数决定是否自动显示
    if (autoShow) {
      this.window.on('ready-to-show', () => {
        this.window?.show()
      })
    }

    // 外部链接在默认浏览器打开
    this.window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // 加载页面
    this.loadPage()

    // 监听窗口 closed 事件，确保外部销毁窗口时也能清理 IPC 处理器
    // 解决 PopupManager 通过 PopupItem.destroyImmediate() 直接销毁 BrowserWindow
    // 时不经过 BaseFrame.destroy() 导致的 IPC 监听器泄漏问题
    this.window.on('closed', () => {
      this.clearIPCHandlers()
      this.onDestroyCallback?.()
      this.onDestroyCallback = null
    })

    // 注册 IPC 监听器（子类可重写）
    this.registerIPC()

    return this.window
  }

  /**
   * 显示窗口
   * @description 如果窗口不存在会自动创建，创建后显示
   */
  show(): void {
    if (!this.isAlive()) {
      this.create()
    }
    this.window?.show()
  }

  /**
   * 在指定位置显示窗口
   * @param x - 屏幕 X 坐标
   * @param y - 屏幕 Y 坐标
   */
  showAt(x: number, y: number): void {
    if (!this.isAlive()) {
      this.create()
    }
    this.window?.setPosition(x, y)
    this.window?.show()
  }

  /**
   * 加载页面
   */
  protected loadPage(): void {
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      // 开发模式：加载 URL，使用 hash 模式匹配 Vue Router
      const url = new URL(process.env['ELECTRON_RENDERER_URL'])
      url.hash = this.routePath
      this.window?.loadURL(url.href)
    } else {
      // 生产模式：加载本地文件
      this.window?.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: this.routePath
      })
    }
  }

  /**
   * 注册 IPC 监听器（子类可重写）
   */
  protected registerIPC(): void {
    // 关闭窗口（只关闭发送事件的窗口，避免多窗口共用频道时互相干扰）
    this.recvOne('to-main-BaseFrame:closeWindow', (event) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender)
      if (senderWindow && !senderWindow.isDestroyed()) {
        if ((app as any).isQuitting) {
          senderWindow.close()
        } else {
          senderWindow.hide()
        }
      }
    })
  }

  // ========== 四种通信方式：recv/send + one/two ==========

  /**
   * 渲染→主 单向（通知模式）
   * @description 渲染进程发送消息，主进程处理但不返回
   * @param channel - 频道名称
   * @param handler - 处理函数
   */
  protected recvOne(
    channel: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (event: Electron.IpcMainEvent, ...args: any[]) => void
  ): void {
    ipcMain.on(channel, handler)
    this.ipcHandlers.push({ channel, type: 'on', handler })
  }

  /**
   * 渲染→主 双向（请求模式）
   * @description 渲染进程请求数据，主进程返回结果
   * @param channel - 频道名称
   * @param handler - 处理函数，需要 return 数据
   */
  protected recvTwo(
    channel: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any
  ): void {
    ipcMain.handle(channel, handler)
    this.ipcHandlers.push({ channel, type: 'handle', handler })
  }

  /**
   * 主→渲染 单向（通知模式）
   * @description 主进程推送消息到渲染进程
   * @param channel - 频道名称
   * @param data - 数据
   */
  protected sendOne(channel: string, ...data: unknown[]): void {
    if (this.isAlive()) {
      this.window!.webContents.send(channel, ...data)
    }
  }

  /**
   * 主→渲染 双向（请求模式）
   * @description 主进程向渲染进程请求数据，等待返回
   * @param channel - 频道名称
   * @param timeout - 超时时间（毫秒），默认 5000
   * @param args - 参数
   * @returns 渲染进程返回的数据
   */
  protected async sendTwo(
    channel: string,
    timeout = 5000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: unknown[]
  ): Promise<any> {
    if (!this.isAlive()) {
      throw new Error('Window not alive')
    }

    const requestId = `${channel}-${Date.now()}-${Math.random()}`
    const responseChannel = `__response:${requestId}`

    return new Promise((resolve, reject) => {
      // 监听一次性响应
      const cleanup = (): void => {
        this.window?.webContents.removeAllListeners(responseChannel)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.window!.webContents.on(responseChannel as any, (_event: any, result: any) => {
        cleanup()
        resolve(result)
      })

      // 超时处理
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`sendTwo timeout: ${channel}`))
      }, timeout)

      // 清理超时定时器（正常响应时）
      this.window!.webContents.once(responseChannel as any, () => {
        clearTimeout(timer)
      })

      // 发送请求到渲染进程
      this.sendOne(`__invoke:${channel}`, requestId, ...args)
    })
  }

  /**
   * 关闭窗口（隐藏到托盘）
   */
  close(): void {
    if (this.window && !this.window.isDestroyed()) {
      // 如果正在退出应用，真正关闭窗口
      if ((app as any).isQuitting) {
        this.window.close()
      } else {
        // 否则隐藏窗口到托盘
        this.window.hide()
      }
    }
  }

  /**
   * 销毁窗口
   * @description 自动清理已注册的 IPC 处理器，并触发回调通知 WindowFactory
   */
  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
    // 清理已注册的 IPC 处理器
    this.clearIPCHandlers()
    // 通知 WindowFactory 清空引用
    this.onDestroyCallback?.()
    this.onDestroyCallback = null
  }

  /**
   * 清理所有已注册的 IPC 处理器
   */
  private clearIPCHandlers(): void {
    for (const item of this.ipcHandlers) {
      if (item.type === 'on') {
        ipcMain.removeListener(item.channel, item.handler)
      } else if (item.type === 'handle') {
        ipcMain.removeHandler(item.channel)
      }
    }
    this.ipcHandlers = []
  }

  /**
   * 获取窗口实例
   */
  getWindow(): BrowserWindow | null {
    return this.window
  }

  /**
   * 检查窗口是否存活
   */
  isAlive(): boolean {
    return this.window !== null && !this.window.isDestroyed()
  }
}
