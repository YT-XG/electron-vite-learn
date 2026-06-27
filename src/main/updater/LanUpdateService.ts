/**
 * 局域网更新服务
 * @description 通过 SMB 共享文件夹检查和下载应用更新
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, createWriteStream, mkdirSync, unlinkSync } from 'fs'
import { createReadStream } from 'fs'
import * as yaml from 'js-yaml'
import semver from 'semver'
import { getUpdateConfig, type UpdateConfig } from './config'

/** 更新信息接口 */
export interface UpdateInfo {
  /** 版本号 */
  version: string
  /** 文件名 */
  file: string
  /** 文件大小（字节） */
  size: number
  /** SHA512 校验值 */
  sha512: string
  /** 发布说明 */
  releaseNotes?: string
  /** 发布日期 */
  releaseDate?: string
}

/** 下载进度接口 */
export interface DownloadProgress {
  /** 已下载字节数 */
  transferred: number
  /** 总字节数 */
  total: number
  /** 下载速度（字节/秒） */
  bytesPerSecond: number
  /** 百分比 */
  percent: number
}

/**
 * 局域网更新服务类
 * @description 提供通过 SMB 共享文件夹进行应用更新的功能
 */
export class LanUpdateService {
  /** 更新配置 */
  private config: UpdateConfig

  /** 目标窗口（用于发送 IPC 消息） */
  private targetWindow: BrowserWindow | null = null

  /** 是否正在下载 */
  private isDownloading = false

  /** 下载 abort controller */
  private abortController: AbortController | null = null

  /** 当前下载的文件路径 */
  private currentDownloadPath: string | null = null

  /**
   * 构造函数
   * @param window - 目标窗口实例
   * @param configOverrides - 配置覆盖项
   */
  constructor(window: BrowserWindow | null, configOverrides?: Partial<UpdateConfig>) {
    this.targetWindow = window
    this.config = getUpdateConfig(configOverrides)
    this.ensureCacheDir()
    this.registerIPC()
  }

  /**
   * 确保缓存目录存在
   */
  private ensureCacheDir(): void {
    if (!existsSync(this.config.cacheDir)) {
      mkdirSync(this.config.cacheDir, { recursive: true })
    }
  }

  /**
   * 注册 IPC 处理器
   */
  private registerIPC(): void {
    // 检查更新
    ipcMain.handle('lan-update:check', async () => {
      return this.checkForUpdates()
    })

    // 下载更新
    ipcMain.handle('lan-update:download', async (_event, info: UpdateInfo) => {
      return this.downloadUpdate(info)
    })

    // 安装更新
    ipcMain.handle('lan-update:install', async (_event, installerPath: string) => {
      return this.installUpdate(installerPath)
    })

    // 取消下载
    ipcMain.handle('lan-update:cancel', async () => {
      return this.cancelDownload()
    })
  }

  /**
   * 检查是否有可用更新
   * @returns 更新信息，如果没有更新返回 null
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    try {
      // 构建 latest.yml 文件路径
      const latestYmlPath = join(this.config.serverUrl, this.config.latestFileName)

      // 检查文件是否存在
      if (!existsSync(latestYmlPath)) {
        console.log('[LanUpdate] latest.yml 文件不存在:', latestYmlPath)
        this.sendToRenderer('lan-update-not-available', { reason: '文件不存在' })
        return null
      }

      // 读取并解析 latest.yml
      const yamlContent = readFileSync(latestYmlPath, 'utf-8')
      const latestInfo = yaml.load(yamlContent) as Record<string, unknown>

      // 提取版本信息
      const remoteVersion = latestInfo.version as string
      const currentVersion = app.getVersion()

      console.log('[LanUpdate] 当前版本:', currentVersion)
      console.log('[LanUpdate] 远程版本:', remoteVersion)

      // 比较版本号
      if (!semver.valid(remoteVersion)) {
        throw new Error(`无效的版本号格式: ${remoteVersion}`)
      }

      if (semver.lte(remoteVersion, currentVersion)) {
        console.log('[LanUpdate] 已是最新版本')
        this.sendToRenderer('lan-update-not-available', {
          currentVersion,
          remoteVersion
        })
        return null
      }

      // 构建更新信息
      const updateInfo: UpdateInfo = {
        version: remoteVersion,
        file: latestInfo.path as string || latestInfo.fileName as string,
        size: latestInfo.size as number || 0,
        sha512: latestInfo.sha512 as string || '',
        releaseNotes: latestInfo.releaseNotes as string || '',
        releaseDate: latestInfo.releaseDate as string || new Date().toISOString()
      }

      console.log('[LanUpdate] 发现新版本:', updateInfo)
      this.sendToRenderer('lan-update-available', updateInfo)

      return updateInfo
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[LanUpdate] 检查更新失败:', errorMessage)
      this.sendToRenderer('lan-update-error', { message: errorMessage })
      return null
    }
  }

  /**
   * 下载更新包
   * @param info - 更新信息
   * @returns 下载后的本地文件路径
   */
  async downloadUpdate(info: UpdateInfo): Promise<string> {
    if (this.isDownloading) {
      throw new Error('已有下载任务进行中')
    }

    this.isDownloading = true
    this.abortController = new AbortController()

    try {
      // 构建远程文件路径
      const remoteFilePath = join(this.config.serverUrl, info.file)
      console.log('remoteFilePath:' + remoteFilePath)
      // 检查文件是否存在
      if (!existsSync(remoteFilePath)) {
        throw new Error(`更新文件不存在: ${remoteFilePath}`)
      }

      // 构建本地保存路径
      const localFileName = `update-${info.version}-${info.file}`
      const localFilePath = join(this.config.cacheDir, localFileName)
      this.currentDownloadPath = localFilePath

      console.log('[LanUpdate] 开始下载:', remoteFilePath)
      console.log('[LanUpdate] 保存到:', localFilePath)

      // 记录开始时间
      const startTime = Date.now()
      let lastBytes = 0
      let lastTime = startTime

      // 使用 stream pipeline 复制文件
      await new Promise<void>((resolve, reject) => {
        const readStream = createReadStream(remoteFilePath)
        const writeStream = createWriteStream(localFilePath)

        // 监听读取流的 data 事件来报告进度
        readStream.on('data', () => {
          const currentTime = Date.now()
          const timeDiff = (currentTime - lastTime) / 1000

          if (timeDiff >= 0.1) {
            // 每 100ms 报告一次进度
            const bytesPerSecond = (readStream.bytesRead - lastBytes) / timeDiff
            lastBytes = readStream.bytesRead
            lastTime = currentTime

            const progress: DownloadProgress = {
              transferred: readStream.bytesRead,
              total: info.size,
              bytesPerSecond: Math.round(bytesPerSecond),
              percent: info.size > 0 ? (readStream.bytesRead / info.size) * 100 : 0
            }

            this.sendToRenderer('lan-update-progress', progress)
          }
        })

        readStream.on('error', reject)
        writeStream.on('error', reject)
        writeStream.on('finish', resolve)

        readStream.pipe(writeStream)
      })

      // 验证文件大小（可选）
      const { statSync } = await import('fs')
      const downloadedStat = statSync(localFilePath)
      if (info.size > 0 && downloadedStat.size !== info.size) {
        console.warn(
          `[LanUpdate] 文件大小不匹配: 预期 ${info.size}, 实际 ${downloadedStat.size}`
        )
      }

      console.log('[LanUpdate] 下载完成:', localFilePath)
      this.sendToRenderer('lan-update-downloaded', { path: localFilePath })

      return localFilePath
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[LanUpdate] 下载失败:', errorMessage)

      // 清理失败的下载文件
      if (this.currentDownloadPath && existsSync(this.currentDownloadPath)) {
        try {
          unlinkSync(this.currentDownloadPath)
        } catch {
          // 忽略清理错误
        }
      }

      this.sendToRenderer('lan-update-error', { message: errorMessage })
      throw error
    } finally {
      this.isDownloading = false
      this.abortController = null
      this.currentDownloadPath = null
    }
  }

  /**
   * 安装更新
   * @param installerPath - 安装包路径
   */
  installUpdate(installerPath: string): void {
    if (!existsSync(installerPath)) {
      throw new Error(`安装包不存在: ${installerPath}`)
    }

    console.log('[LanUpdate] 启动安装程序:', installerPath)

    // 使用 spawn 以 detached 模式启动安装程序，使其独立于当前进程运行
    const { spawn } = require('child_process')
    const child = spawn(installerPath, [], {
      detached: true,
      stdio: 'ignore',
      shell: true
    })
    child.unref()

    // 等待一小段时间让安装程序启动，然后退出应用
    setTimeout(() => {
      app.quit()
    }, 500)
  }

  /**
   * 取消下载
   */
  cancelDownload(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
    this.isDownloading = false
  }

  /**
   * 发送消息到渲染进程
   * @param channel - IPC 频道
   * @param data - 数据
   */
  private sendToRenderer(channel: string, data: unknown): void {
    if (this.targetWindow && !this.targetWindow.isDestroyed()) {
      this.targetWindow.webContents.send(channel, data)
    }
  }

  /**
   * 设置目标窗口
   * @param window - 窗口实例
   */
  setTargetWindow(window: BrowserWindow): void {
    this.targetWindow = window
  }

  /**
   * 获取当前配置
   * @returns 更新配置
   */
  getConfig(): UpdateConfig {
    return { ...this.config }
  }

  /**
   * 更新服务器地址
   * @param serverUrl - 新的服务器地址
   */
  updateServerUrl(serverUrl: string): void {
    this.config.serverUrl = serverUrl
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.cancelDownload()
    this.targetWindow = null
  }
}
