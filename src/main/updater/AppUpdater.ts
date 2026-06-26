import { autoUpdater, UpdateInfo } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow } from 'electron'
import log from 'electron-log'
import path from 'node:path'

/**
 * 自定义更新器
 * @description 支持多种更新源的自动更新器
 */
export default class AppUpdater {
  /** 主窗口实例 */
  private mainWindow: BrowserWindow | null = null

  /** 是否正在下载更新 */
  private isDownloading = false

  /**
   * 构造函数
   * @param mainWindow - 主窗口实例（可选）
   */
  constructor(mainWindow?: BrowserWindow) {
    this.mainWindow = mainWindow || null
    this.setupAutoUpdater()
    this.setupEventListeners()
  }

  /**
   * 配置自动更新器
   */
  private setupAutoUpdater(): void {
    // 开发模式下模拟打包环境
    if (is.dev) {
      Object.defineProperty(app, 'isPackaged', {
        get() {
          return true
        }
      })

      // 开发模式下使用 dev-app-update.yml 配置文件
      autoUpdater.updateConfigPath = path.join(__dirname, '../../dev-app-update.yml')
      log.info('开发模式：使用 dev-app-update.yml 配置文件')
    }

    // 配置日志
    autoUpdater.logger = log

    // 禁用自动下载（由用户确认后手动下载）
    autoUpdater.autoDownload = false

    // 禁用自动安装（由用户确认后手动安装）
    autoUpdater.autoInstallOnAppQuit = false
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 检查更新中
    autoUpdater.on('checking-for-update', () => {
      log.info('正在检查更新...')
      this.sendToRenderer('update-checking')
    })

    // 发现可用更新
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      log.info('发现新版本:', info.version)
      this.sendToRenderer('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
        releaseName: info.releaseName
      })
    })

    // 没有可用更新
    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      log.info('当前已是最新版本:', info.version)
      this.sendToRenderer('update-not-available', info)
    })

    // 下载进度
    autoUpdater.on('download-progress', (progress) => {
      log.info(`下载进度: ${progress.percent.toFixed(2)}%`)
      this.sendToRenderer('update-progress', {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      })
    })

    // 更新下载完成
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      log.info('更新下载完成:', info.version)
      this.isDownloading = false
      this.sendToRenderer('update-downloaded', info)
    })

    // 更新错误
    autoUpdater.on('error', (error) => {
      log.error('更新错误:', error)
      this.isDownloading = false
      this.sendToRenderer('update-error', {
        message: error.message,
        code: (error as any).code
      })
    })
  }

  /**
   * 发送消息到渲染进程
   * @param channel - 频道名称
   * @param data - 数据
   */
  private sendToRenderer(channel: string, data?: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  /**
   * 检查更新
   * @returns 检查结果
   */
  async checkForUpdates(): Promise<{ success: boolean; updateInfo?: UpdateInfo; error?: string }> {
    try {
      log.info('开始检查更新...')
      const result = await autoUpdater.checkForUpdates()
      return {
        success: true,
        updateInfo: result?.updateInfo
      }
    } catch (error) {
      log.error('检查更新失败:', error)
      return {
        success: false,
        error: (error as Error).message
      }
    }
  }

  /**
   * 下载更新
   * @returns 下载结果
   */
  async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
    if (this.isDownloading) {
      return { success: false, error: '正在下载中，请勿重复操作' }
    }

    try {
      log.info('开始下载更新...')
      this.isDownloading = true
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      log.error('下载更新失败:', error)
      this.isDownloading = false
      return {
        success: false,
        error: (error as Error).message
      }
    }
  }

  /**
   * 安装更新并重启应用
   */
  installUpdate(): void {
    log.info('准备安装更新并重启...')
    autoUpdater.quitAndInstall(false, true)
  }

  /**
   * 检查并通知更新
   * @description 自动检查更新，如果发现新版本会通知用户
   */
  checkForUpdatesAndNotify(): void {
    log.info('检查并通知更新...')
    autoUpdater.checkForUpdatesAndNotify()
  }

  /**
   * 设置主窗口
   * @param window - 主窗口实例
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  /**
   * 获取是否正在下载
   */
  getIsDownloading(): boolean {
    return this.isDownloading
  }
}
