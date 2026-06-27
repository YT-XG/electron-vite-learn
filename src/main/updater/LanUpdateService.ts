/**
 * 局域网更新服务
 * @description 通过 SMB 共享文件夹检查和下载应用更新
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, mkdirSync, unlinkSync, copyFileSync, statSync } from 'fs'
import * as yaml from 'js-yaml'
import log from 'electron-log'
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

  /** 发现新版本时的回调（由主进程注册，用于显示更新弹窗） */
  onUpdateFound: ((updateInfo: UpdateInfo) => void) | null = null

  /** 已是最新版时的回调（由主进程注册） */
  onUpdateLatest: (() => void) | null = null

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
        log.info('[LanUpdate] latest.yml 文件不存在:', latestYmlPath)
        this.sendToRenderer('lan-update-not-available', { reason: '文件不存在' })
        if (this.onUpdateLatest) {
          this.onUpdateLatest()
        }
        return null
      }

      // 读取并解析 latest.yml
      const yamlContent = readFileSync(latestYmlPath, 'utf-8')
      const latestInfo = yaml.load(yamlContent) as Record<string, unknown>

      // 提取版本信息
      const remoteVersion = latestInfo.version as string
      const currentVersion = app.getVersion()

      log.info('[LanUpdate] 当前版本:', currentVersion)
      log.info('[LanUpdate] 远程版本:', remoteVersion)

      // 比较版本号
      if (!semver.valid(remoteVersion)) {
        throw new Error(`无效的版本号格式: ${remoteVersion}`)
      }

      if (semver.lte(remoteVersion, currentVersion)) {
        log.info('[LanUpdate] 已是最新版本')
        this.sendToRenderer('lan-update-not-available', {
          currentVersion,
          remoteVersion
        })
        // 通过回调通知主进程（已是最新版）
        if (this.onUpdateLatest) {
          this.onUpdateLatest()
        }
        return null
      }

      // 构建更新信息（兼容 electron-builder 和自定义 latest.yml 格式）
      const fileName = latestInfo.path as string
        || (latestInfo.files as any)?.[0]?.url as string
        || latestInfo.fileName as string
        || ''

      const updateInfo: UpdateInfo = {
        version: remoteVersion,
        file: fileName,
        size: latestInfo.size as number || (latestInfo.files as any)?.[0]?.size as number || 0,
        sha512: latestInfo.sha512 as string || (latestInfo.files as any)?.[0]?.sha512 as string || '',
        releaseNotes: latestInfo.releaseNotes as string || '',
        releaseDate: latestInfo.releaseDate as string || new Date().toISOString()
      }

      log.info('[LanUpdate] latest.yml 原始内容:', latestInfo)
      log.info('[LanUpdate] 解析出的文件名:', fileName)

      log.info('[LanUpdate] 发现新版本:', updateInfo)
      this.sendToRenderer('lan-update-available', updateInfo)

      // 通过回调通知主进程显示更新弹窗（比 ipcMain.emit 更可靠）
      if (this.onUpdateFound) {
        this.onUpdateFound(updateInfo)
      }

      return updateInfo
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error('[LanUpdate] 检查更新失败:', errorMessage)
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
      log.info('[LanUpdate] 服务器地址:', this.config.serverUrl)
      log.info('[LanUpdate] 文件名:', info.file)
      log.info('[LanUpdate] 完整路径:', remoteFilePath)
      // 检查文件是否存在
      log.info('[LanUpdate] 检查源文件是否存在...')
      const srcExists = existsSync(remoteFilePath)
      log.info('[LanUpdate] 源文件存在:', srcExists)
      if (!srcExists) {
        throw new Error(`更新文件不存在: ${remoteFilePath}`)
      }

      // 构建本地保存路径
      const localFileName = `update-${info.version}-${info.file}`
      const localFilePath = join(this.config.cacheDir, localFileName)
      this.currentDownloadPath = localFilePath

      log.info('[LanUpdate] 保存到:', localFilePath)

      // 确保目标目录存在
      log.info('[LanUpdate] 创建缓存目录...')
      mkdirSync(this.config.cacheDir, { recursive: true })
      log.info('[LanUpdate] 缓存目录就绪')

      // 报告 0% 进度
      this.sendToRenderer('lan-update-progress', {
        transferred: 0,
        total: info.size,
        bytesPerSecond: 0,
        percent: 0
      })

      // 使用 copyFileSync 复制文件（支持 UNC 网络路径）
      log.info('[LanUpdate] 开始复制文件...')
      const startTime = Date.now()
      copyFileSync(remoteFilePath, localFilePath)
      const elapsed = (Date.now() - startTime) / 1000

      log.info(`[LanUpdate] 复制完成，耗时 ${elapsed.toFixed(1)}s`)

      // 报告 100% 进度
      this.sendToRenderer('lan-update-progress', {
        transferred: info.size,
        total: info.size,
        bytesPerSecond: 0,
        percent: 100
      })

      // 验证文件大小
      log.info('[LanUpdate] 验证下载文件...')
      const downloadedSize = statSync(localFilePath).size
      log.info(`[LanUpdate] 预期大小: ${info.size}, 实际大小: ${downloadedSize}`)
      if (info.size > 0 && downloadedSize !== info.size) {
        log.warn(
          `[LanUpdate] 文件大小不匹配: 预期 ${info.size}, 实际 ${downloadedSize}`
        )
      }

      log.info('[LanUpdate] 下载完成:', localFilePath)
      this.sendToRenderer('lan-update-downloaded', { path: localFilePath })

      return localFilePath
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error('[LanUpdate] 下载失败:', errorMessage)

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

    log.info('[LanUpdate] 启动安装程序:', installerPath)

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
