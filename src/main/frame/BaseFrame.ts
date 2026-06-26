import { app, BrowserWindow, BrowserWindowConstructorOptions, ipcMain, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/icon.png?asset'

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

  /**
   * 创建窗口
   * @returns 窗口实例
   */
  create(): BrowserWindow {
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

    // 窗口准备好后显示
    this.window.on('ready-to-show', () => {
      this.window?.show()
    })

    // 外部链接在默认浏览器打开
    this.window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // 加载页面
    this.loadPage()

    // 注册 IPC 监听器（子类可重写）
    this.registerIPC()

    return this.window
  }

  /**
   * 加载页面
   */
  protected loadPage(): void {
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      // 开发模式：加载 URL
      const url = new URL(this.routePath, process.env['ELECTRON_RENDERER_URL'])
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
    // 关闭窗口
    ipcMain.on('close-window', () => {
      this.close()
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
   */
  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
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

  /**
   * 发送消息到渲染进程
   * @param channel - 频道名称
   * @param data - 数据
   */
  send(channel: string, ...data: unknown[]): void {
    if (this.isAlive()) {
      this.window!.webContents.send(channel, ...data)
    }
  }
}
