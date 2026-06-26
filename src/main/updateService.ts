import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log'

/**
 * 更新服务
 * @description 负责检查更新、下载更新、安装更新
 */
export class UpdateService {
  /** 主窗口实例 */
  private mainWindow: BrowserWindow

  /** 是否正在下载更新 */
  private isDownloading = false

  /**
   * 构造函数
   * @param mainWindow - 主窗口实例
   */
  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    this.setupAutoUpdater()
    this.setupIPC()
  }

  /**
   * 配置自动更新器
   */
  private setupAutoUpdater(): void {
    // 配置日志
    autoUpdater.logger = log

    // 配置更新源（从 electron-builder.yml 读取）
    // autoUpdater.setFeedURL() 会在 electron-builder.yml 中配置

    // 禁用自动下载（由用户确认后手动下载）
    autoUpdater.autoDownload = false

    // 禁用自动安装（由用户确认后手动安装）
    autoUpdater.autoInstallOnAppQuit = false

    // 监听更新事件
    this.setupEventListeners()
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 发现可用更新
    autoUpdater.on('update-available', (info) => {
      log.info('发现新版本:', info.version)
      this.mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
        releaseName: info.releaseName
      })
    })

    // 没有可用更新
    autoUpdater.on('update-not-available', (info) => {
      log.info('当前已是最新版本:', info.version)
      this.mainWindow.webContents.send('update-not-available', info)
    })

    // 下载进度
    autoUpdater.on('download-progress', (progress) => {
      log.info(`下载进度: ${progress.percent.toFixed(2)}%`)
      this.mainWindow.webContents.send('update-progress', {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      })
    })

    // 更新下载完成
    autoUpdater.on('update-downloaded', (info) => {
      log.info('更新下载完成:', info.version)
      this.isDownloading = false
      this.mainWindow.webContents.send('update-downloaded', info)
    })

    // 更新错误
    autoUpdater.on('error', (error) => {
      log.error('更新错误:', error)
      this.isDownloading = false
      this.mainWindow.webContents.send('update-error', {
        message: error.message,
        code: (error as any).code
      })
    })
  }

  /**
   * 设置 IPC 监听器
   */
  private setupIPC(): void {
    // 检查更新
    ipcMain.handle('check-for-updates', async () => {
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
    })

    // 开始下载更新
    ipcMain.handle('start-download', async () => {
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
    })

    // 安装更新并重启
    ipcMain.handle('install-update', () => {
      log.info('准备安装更新并重启...')
      autoUpdater.quitAndInstall(false, true)
    })

    // 取消更新
    ipcMain.handle('cancel-update', () => {
      log.info('用户取消更新')
      this.isDownloading = false
      // 注意：electron-updater 没有提供取消下载的方法
      // 这里只是重置状态，实际下载会继续但不会安装
    })
  }

  /**
   * 手动检查更新
   */
  async checkForUpdates(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      log.error('检查更新失败:', error)
    }
  }
}

export default UpdateService
