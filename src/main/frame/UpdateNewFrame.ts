import { BaseFrame, popupManager } from './index'
import { app, BrowserWindowConstructorOptions, BrowserWindow } from 'electron'
import { join } from 'path'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  promises as fsPromises
} from 'fs'
import log from 'electron-log'
import * as yaml from 'js-yaml'
import semver from 'semver'
import { settingsService } from '../service/settingsService'
import { githubUpdateService, GitHubUpdateInfo } from '../service/githubUpdateService'
import { isMacOS } from '../utils/platform'

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
  msg?: string
}
/**
 * 新版更新窗口
 * @description 从右侧滑入的更新提示窗口，位置由 PopupManager 统一管理（槽位式布局，右下角堆叠）
 *              入场/出场动画由渲染进程 CSS 实现（从右侧滑入/滑出）
 *              窗口透明，玻璃拟态卡片风格，蓝粉配色
 */
export default class UpdateNewFrame extends BaseFrame {
  /** 弹窗宽度 */
  private static readonly POPUP_WIDTH = 380

  /** 弹窗高度 */
  private static readonly POPUP_HEIGHT = 280

  /** 窗口配置 - 透明无边框气泡 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: UpdateNewFrame.POPUP_WIDTH,
    height: UpdateNewFrame.POPUP_HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false
  }

  /** 路由路径 */
  protected readonly routePath: string = '/updateNew'
  private isDownloading = false
  private config = {
    // 局域网更新服务器地址（从 settingsService 读取，用户可在设置页面修改）
    get serverUrl(): string {
      return settingsService.getAll().serverUrl
    },
    // 本地缓存目录
    cacheDir: join(app.getPath('userData'), 'update-cache'),
    // 超时时间
    timeout: 10000,
    // 最新版本文件名
    latestFileName: 'latest.yml'
  }
  private currentDownloadPath: string | null = null

  /** 当前更新信息（用于下载和安装） */
  private currentUpdateInfo: UpdateInfo | null = null

  /**
   * 带超时的文件存在性检查（异步）
   * @description 替代 existsSync，避免访问不可达的 UNC 路径时长时间阻塞
   * @param filePath - 要检查的文件路径
   * @param timeoutMs - 超时时间（毫秒），默认使用 config.timeout
   * @returns 文件是否可访问
   */
  private async checkFileExistsWithTimeout(filePath: string, timeoutMs?: number): Promise<boolean> {
    const timeout = timeoutMs ?? this.config.timeout
    try {
      await Promise.race([
        fsPromises.access(filePath),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('网络请求超时')), timeout)
        )
      ])
      return true
    } catch {
      return false
    }
  }

  /**
   * 带超时的文件读取（异步）
   * @description 替代 readFileSync，避免阻塞主线程
   * @param filePath - 要读取的文件路径
   * @param encoding - 编码格式，默认 utf-8
   * @param timeoutMs - 超时时间（毫秒），默认使用 config.timeout
   * @returns 文件内容字符串
   */
  private async readFileWithTimeout(
    filePath: string,
    encoding: BufferEncoding = 'utf-8',
    timeoutMs?: number
  ): Promise<string> {
    const timeout = timeoutMs ?? this.config.timeout
    return Promise.race([
      fsPromises.readFile(filePath, { encoding }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('读取文件超时')), timeout)
      )
    ])
  }

  /**
   * 在本地缓存目录查找已下载的更新包
   * @param version - 要查找的版本号
   * @returns 找到的安装包路径，未找到返回 null
   */
  private findCachedUpdate(version: string): string | null {
    try {
      if (!existsSync(this.config.cacheDir)) {
        return null
      }

      const files = readdirSync(this.config.cacheDir)
      // 查找匹配版本号的安装包（文件名格式：update-{version}-{filename}）
      const cachedFile = files.find((file) => file.startsWith(`update-${version}-`))

      if (cachedFile) {
        const filePath = join(this.config.cacheDir, cachedFile)
        // 验证文件存在且大小大于 0
        const stat = statSync(filePath)
        if (stat.size > 0) {
          log.info('[UpdateNew] 找到本地缓存:', filePath)
          return filePath
        }
      }

      return null
    } catch (error) {
      log.error('[UpdateNew] 查找缓存失败:', error)
      return null
    }
  }

  /**
   * 注册 IPC 监听器
   * @description 监听渲染进程的关闭请求和就绪通知
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 渲染进程请求隐藏更新窗口（由 PopupManager 管理销毁）
    this.recvOne('to-main-UpdateNewFrame:hide', async () => {
      await this.destroy()
    })

    // 渲染进程请求销毁更新窗口
    this.recvOne('to-main-UpdateNewFrame:destroy', async () => {
      await this.destroy()
    })

    // 渲染进程已就绪，发送已缓存的数据
    this.recvOne('to-main-UpdateNewFrame:ready', async () => {
      log.info('渲染进程加载完毕，发送已缓存的更新信息')
      // 如果已有更新信息（由 checkGitHubUpdates/checkLanUpdates 预先获取），直接发送
      // 不再调用 checkForUpdates()，避免递归循环：
      //   checkForUpdates → showUpdateNotice → create() → 页面加载 → ready → checkForUpdates(!!!)
      if (this.currentUpdateInfo) {
        this.sendOne('to-renderer-UpdateNewFrame:info', {
          version: this.currentUpdateInfo.version,
          updateInfo: this.currentUpdateInfo
        })
        if (this.currentDownloadPath) {
          this.sendOne('to-renderer-UpdateNewFrame:downloaded', { path: this.currentDownloadPath })
        }
      }
    })

    // 渲染进程请求下载更新
    this.recvOne('to-main-UpdateNewFrame:download', async () => {
      log.info('[UpdateNewFrame] 收到下载请求')
      if (!this.currentUpdateInfo) {
        log.error('[UpdateNewFrame] 没有更新信息，无法下载')
        return
      }
      try {
        await this.downloadUpdate(this.currentUpdateInfo)
      } catch (error) {
        log.error('[UpdateNewFrame] 下载失败:', error)
      }
    })

    // 渲染进程请求安装更新
    this.recvOne('to-main-UpdateNewFrame:install', () => {
      log.info('[UpdateNewFrame] 收到安装请求')
      if (!this.currentDownloadPath) {
        log.error('[UpdateNewFrame] 没有安装包路径，无法安装')
        return
      }
      try {
        this.installUpdate(this.currentDownloadPath)
      } catch (error) {
        log.error('[UpdateNewFrame] 安装失败:', error)
      }
    })
  }

  /**
   * 检查服务器路径是否有效
   * @description 针对 macOS 提供更友好的错误提示
   * @returns 错误信息，有效返回 null
   */
  #validateServerUrl(): string | null {
    const serverUrl = this.config.serverUrl

    if (isMacOS()) {
      // macOS: 检查是否还是 Windows UNC 路径格式
      if (serverUrl.startsWith('\\\\')) {
        return 'macOS 不支持 Windows UNC 路径，请在设置中修改为 SMB 挂载路径（如 /Volumes/dist）'
      }

      // macOS: 检查路径是否在 /Volumes 下（SMB 挂载位置）
      if (!serverUrl.startsWith('/Volumes/') && !serverUrl.startsWith('/mnt/')) {
        log.warn('[LanUpdate] macOS 更新路径可能不正确:', serverUrl)
      }

      // macOS: 检查挂载点是否存在
      if (!existsSync(serverUrl)) {
        return `共享文件夹未挂载，请先在 Finder 中挂载：
1. 打开 Finder
2. 菜单栏 → 前往 → 连接服务器（⌘K）
3. 输入 smb://10.15.8.28/dist
4. 点击连接并输入 Windows 用户名密码

挂载后路径为: ${serverUrl}`
      }
    } else {
      // Windows: 检查是否是 UNC 路径格式
      if (!serverUrl.startsWith('\\\\')) {
        return 'Windows 请使用 UNC 路径格式（如 \\\\10.15.8.28\\dist）'
      }
    }

    return null
  }

  /**
   * 检查是否有可用更新
   * @description 根据设置选择更新源（局域网或 GitHub）
   * @returns 更新信息，如果没有更新返回 null
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    log.info('进入检测更新状态')
    const settings = settingsService.getAll()

    // 根据设置选择更新源
    if (settings.updateSource === 'github') {
      return this.checkGitHubUpdates()
    }
    return this.checkLanUpdates()
  }

  /**
   * 检查 GitHub 更新
   * @description 从 GitHub Releases 检查更新，发现更新后通过 PopupManager 显示
   */
  private async checkGitHubUpdates(): Promise<UpdateInfo | null> {
    try {
      const settings = settingsService.getAll()
      const repo = settings.githubRepo

      log.info('[UpdateNew] 检查 GitHub 更新，仓库:', repo)

      const githubInfo = await githubUpdateService.checkForUpdates(repo)
      if (!githubInfo) {
        await this.destroy()
        return { file: '', sha512: '', size: 0, version: '', msg: '已是最新版本' }
      }

      // 转换为统一的 UpdateInfo 格式
      const updateInfo: UpdateInfo = {
        version: githubInfo.version,
        file: githubInfo.file,
        size: githubInfo.size,
        sha512: '',
        releaseNotes: githubInfo.releaseNotes,
        releaseDate: githubInfo.releaseDate,
        msg: `发现新版本 v${githubInfo.version}`
      }

      log.info('[UpdateNew] GitHub 发现新版本:', updateInfo)

      // 保存更新信息供下载和安装使用
      this.currentUpdateInfo = updateInfo

      // 检查本地缓存是否已有该版本的安装包
      const cachedPath = this.findCachedUpdate(githubInfo.version)
      if (cachedPath) {
        log.info('[UpdateNew] 本地已缓存该版本，直接显示安装按钮')
        this.currentDownloadPath = cachedPath
        updateInfo.msg = `发现新版本 v${githubInfo.version}（已缓存）`
      }

      // 通过 PopupManager 显示更新窗口
      popupManager.showUpdateNotice(
        () => this.create(),
        { type: 'update', width: UpdateNewFrame.POPUP_WIDTH, height: UpdateNewFrame.POPUP_HEIGHT },
        () => {
          this.sendOne('to-renderer-UpdateNewFrame:info', { version: githubInfo.version, updateInfo })
          // 如果已缓存，通知渲染进程显示安装按钮
          if (cachedPath) {
            this.sendOne('to-renderer-UpdateNewFrame:downloaded', { path: cachedPath })
          }
        }
      )
      return updateInfo
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error('[UpdateNew] GitHub 更新检查失败:', errorMessage)
      return {
        file: '',
        sha512: '',
        size: 0,
        version: '',
        msg: `检查更新失败: ${errorMessage}`
      }
    }
  }

  /**
   * 检查局域网更新
   * @description 从共享文件夹检查更新，发现更新后通过 PopupManager 显示
   */
  private async checkLanUpdates(): Promise<UpdateInfo | null> {
    console.log('进入检测更新状态（局域网）')
    try {
      // 验证服务器路径
      const validationError = this.#validateServerUrl()
      if (validationError) {
        log.error('[LanUpdate] 服务器路径验证失败:', validationError)
        return {
          file: '',
          sha512: '',
          size: 0,
          version: '',
          msg: validationError
        }
      }

      // 构建 latest.yml 文件路径
      const latestYmlPath = join(this.config.serverUrl, this.config.latestFileName)

      // 带超时检查文件是否存在（替代 existsSync，避免访问不可达 UNC 路径时长时间阻塞）
      const fileExists = await this.checkFileExistsWithTimeout(latestYmlPath)
      if (!fileExists) {
        log.info('[LanUpdate] latest.yml 文件不存在或访问超时:', latestYmlPath)

        // 提供更详细的错误信息
        let msg = '请求超时，请检查网络连接'
        if (isMacOS()) {
          msg = `无法访问更新服务器，请检查：
1. 共享文件夹是否已挂载到 ${this.config.serverUrl}
2. 网络连接是否正常
3. Windows 共享文件夹是否开启

当前路径: ${this.config.serverUrl}`
        }

        return {
          file: '',
          sha512: '',
          size: 0,
          version: '',
          msg
        }
      }

      // 带超时读取 latest.yml（替代 readFileSync，避免阻塞主线程）
      const yamlContent = await this.readFileWithTimeout(latestYmlPath)
      const latestInfo = yaml.load(yamlContent) as Record<string, unknown>

      // 提取版本信息
      const remoteVersion = latestInfo.version as string
      const currentVersion = app.getVersion()

      // 比较版本号
      if (!semver.valid(remoteVersion)) {
        return {
          file: '',
          sha512: '',
          size: 0,
          version: '',
          msg: `无效的版本号格式: ${remoteVersion}`
        }
      }

      if (semver.lte(remoteVersion, currentVersion)) {
        log.info('[LanUpdate] 已是最新版本')
        await this.destroy()
        return { file: '', sha512: '', size: 0, version: '', msg: '已是最新版本---' + remoteVersion }
      }

      // 构建更新信息（兼容 electron-builder 和自定义 latest.yml 格式）
      const fileName =
        (latestInfo.path as string) ||
        ((latestInfo.files as any)?.[0]?.url as string) ||
        (latestInfo.fileName as string) ||
        ''

      const updateInfo: UpdateInfo = {
        version: remoteVersion,
        file: fileName,
        size: (latestInfo.size as number) || ((latestInfo.files as any)?.[0]?.size as number) || 0,
        sha512:
          (latestInfo.sha512 as string) || ((latestInfo.files as any)?.[0]?.sha512 as string) || '',
        releaseNotes: (latestInfo.releaseNotes as string) || '',
        releaseDate: (latestInfo.releaseDate as string) || new Date().toISOString(),
        msg: `发现新版本 v${remoteVersion}`
      }
      log.info('[LanUpdate] 发现新版本:', updateInfo)

      // 保存更新信息供下载和安装使用
      this.currentUpdateInfo = updateInfo

      // 检查本地缓存是否已有该版本的安装包
      const cachedPath = this.findCachedUpdate(remoteVersion)
      if (cachedPath) {
        log.info('[UpdateNew] 本地已缓存该版本，直接显示安装按钮')
        this.currentDownloadPath = cachedPath
        updateInfo.msg = `发现新版本 v${remoteVersion}（已缓存）`
      }

      // 通过 PopupManager 显示更新窗口
      popupManager.showUpdateNotice(
        () => this.create(),
        { type: 'update', width: UpdateNewFrame.POPUP_WIDTH, height: UpdateNewFrame.POPUP_HEIGHT },
        () => {
          this.sendOne('to-renderer-UpdateNewFrame:info', { version: remoteVersion, updateInfo })
          // 如果已缓存，通知渲染进程显示安装按钮
          if (cachedPath) {
            this.sendOne('to-renderer-UpdateNewFrame:downloaded', { path: cachedPath })
          }
        }
      )
      return updateInfo
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error('[LanUpdate] 检查更新失败:', errorMessage)
      return {
        file: '',
        sha512: '',
        size: 0,
        version: '',
        msg: `检查更新失败: ${errorMessage}`
      }
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
    const settings = settingsService.getAll()

    try {
      // 根据更新源选择下载方式
      if (settings.updateSource === 'github') {
        return await this.downloadGitHubUpdate(info)
      }
      return await this.downloadLanUpdate(info)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error('[UpdateNew] 下载失败:', errorMessage)

      // 清理失败的下载文件
      if (this.currentDownloadPath && existsSync(this.currentDownloadPath)) {
        try {
          unlinkSync(this.currentDownloadPath)
        } catch {
          // 忽略清理错误
        }
      }

      this.sendOne('to-renderer-UpdateNewFrame:error', { message: errorMessage })
      throw error
    } finally {
      this.isDownloading = false
    }
  }

  /**
   * 从 GitHub 下载更新包
   * @param info - 更新信息
   */
  private async downloadGitHubUpdate(info: UpdateInfo): Promise<string> {
    log.info('[UpdateNew] 从 GitHub 下载更新:', info.file)

    // 构建 GitHub 下载链接，使用 gh-proxy 代理加速
    const githubRepo = settingsService.getAll().githubRepo
    const downloadUrl = `https://github.com/${githubRepo}/releases/download/v${info.version}/${info.file}`

    // 构建 GitHub 更新信息
    const githubInfo: GitHubUpdateInfo = {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
      releaseDate: info.releaseDate || '',
      file: info.file,
      size: info.size,
      downloadUrl
    }

    // 报告 0% 进度
    this.sendOne('to-renderer-UpdateNewFrame:progress', {
      transferred: 0,
      total: info.size,
      bytesPerSecond: 0,
      percent: 0
    })

    // 下载文件（githubUpdateService 内部已处理网络错误）
    const localPath = await githubUpdateService.downloadUpdate(githubInfo, (percent) => {
      // 安全计算已下载字节数，确保 percent 在 0-100 范围内
      const safePercent = Math.max(0, Math.min(100, percent))
      const transferred = info.size > 0 ? Math.round((info.size * safePercent) / 100) : 0
      this.sendOne('to-renderer-UpdateNewFrame:progress', {
        transferred,
        total: info.size,
        bytesPerSecond: 0,
        percent: safePercent
      })
    })

    this.currentDownloadPath = localPath
    log.info('[UpdateNew] GitHub 下载完成:', localPath)

    // 通知渲染进程下载完成
    this.sendOne('to-renderer-UpdateNewFrame:downloaded', { path: localPath })

    return localPath
  }

  /**
   * 从局域网下载更新包（流式复制，支持实时进度）
   * @param info - 更新信息
   */
  private async downloadLanUpdate(info: UpdateInfo): Promise<string> {
    // 构建远程文件路径
    const remoteFilePath = join(this.config.serverUrl, info.file)
    log.info('[LanUpdate] 服务器地址:', this.config.serverUrl)
    log.info('[LanUpdate] 文件名:', info.file)
    log.info('[LanUpdate] 完整路径:', remoteFilePath)

    // 带超时检查文件是否存在
    log.info('[LanUpdate] 检查源文件是否存在...')
    const srcExists = await this.checkFileExistsWithTimeout(remoteFilePath)
    log.info('[LanUpdate] 源文件存在:', srcExists)
    if (!srcExists) {
      throw new Error(`更新文件不存在或访问超时: ${remoteFilePath}`)
    }

    // 获取实际文件大小（修复 latest.yml 中 size 缺失或为 0 的问题）
    let totalSize = info.size
    try {
      const srcStat = statSync(remoteFilePath)
      if (srcStat.size > 0) {
        totalSize = srcStat.size
        log.info('[LanUpdate] 从源文件获取实际大小:', totalSize)
      }
    } catch (e) {
      log.warn('[LanUpdate] 无法获取源文件大小:', e)
    }

    // 构建本地保存路径
    const localFileName = `update-${info.version}-${info.file}`
    const localFilePath = join(this.config.cacheDir, localFileName)
    this.currentDownloadPath = localFilePath

    log.info('[LanUpdate] 保存到:', localFilePath)

    // 确保目标目录存在
    mkdirSync(this.config.cacheDir, { recursive: true })

    // 报告 0% 进度
    this.sendOne('to-renderer-UpdateNewFrame:progress', {
      transferred: 0,
      total: totalSize,
      bytesPerSecond: 0,
      percent: 0
    })

    // 流式复制文件，支持实时进度报告
    log.info('[LanUpdate] 开始流式复制文件...')
    const startTime = Date.now()
    let transferred = 0
    let lastReportTime = 0

    try {
      await new Promise<void>((resolve, reject) => {
        const readStream = createReadStream(remoteFilePath)
        const writeStream = createWriteStream(localFilePath)

        readStream.on('data', (chunk: Buffer) => {
          transferred += chunk.length
          // 每 300ms 报告一次进度，避免频繁 IPC 通信
          const now = Date.now()
          if (now - lastReportTime > 300 && totalSize > 0) {
            lastReportTime = now
            const percent = Math.min(Math.round((transferred / totalSize) * 100), 99)
            this.sendOne('to-renderer-UpdateNewFrame:progress', {
              transferred,
              total: totalSize,
              bytesPerSecond: 0,
              percent
            })
          }
        })

        readStream.on('error', (err) => {
          // 清理失败的文件
          try {
            writeStream.destroy()
            if (existsSync(localFilePath)) {
              unlinkSync(localFilePath)
            }
          } catch {
            // 忽略清理错误
          }
          reject(err)
        })

        writeStream.on('error', (err) => {
          try {
            readStream.destroy()
            if (existsSync(localFilePath)) {
              unlinkSync(localFilePath)
            }
          } catch {
            // 忽略清理错误
          }
          reject(err)
        })

        writeStream.on('finish', () => resolve())

        readStream.pipe(writeStream)
      })
    } catch (copyError) {
      const errMsg = copyError instanceof Error ? copyError.message : String(copyError)
      log.error('[LanUpdate] 流式复制失败（网络可能已断开）:', errMsg)
      throw new Error(`下载失败，连接已断开: ${errMsg}`)
    }

    const elapsed = (Date.now() - startTime) / 1000
    log.info(`[LanUpdate] 复制完成，耗时 ${elapsed.toFixed(1)}s`)

    // 报告 100% 进度
    this.sendOne('to-renderer-UpdateNewFrame:progress', {
      transferred: totalSize,
      total: totalSize,
      bytesPerSecond: 0,
      percent: 100
    })

    // 验证文件大小
    try {
      const downloadedSize = statSync(localFilePath).size
      log.info(`[LanUpdate] 预期大小: ${totalSize}, 实际大小: ${downloadedSize}`)
      if (totalSize > 0 && downloadedSize !== totalSize) {
        log.warn(`[LanUpdate] 文件大小不匹配: 预期 ${totalSize}, 实际 ${downloadedSize}`)
      }
    } catch (e) {
      log.warn('[LanUpdate] 无法验证文件大小:', e)
    }

    log.info('[LanUpdate] 下载完成:', localFilePath)
    this.sendOne('to-renderer-UpdateNewFrame:downloaded', { path: localFilePath })

    return localFilePath
  }

  /**
   * 清理更新缓存目录
   * @description 按修改时间排序，保留最新的 2 个安装包，删除其余旧文件
   */
  private clearUpdateCache(): void {
    try {
      if (!existsSync(this.config.cacheDir)) {
        return
      }

      const files = readdirSync(this.config.cacheDir)
      if (files.length <= 2) {
        log.info(`[UpdateNew] 缓存文件仅 ${files.length} 个，无需清理`)
        return
      }

      // 按修改时间倒序排列（最新的在前）
      const filesWithStat = files
        .map((file) => {
          try {
            const filePath = join(this.config.cacheDir, file)
            const stat = statSync(filePath)
            return { file, filePath, mtime: stat.mtimeMs }
          } catch {
            return null
          }
        })
        .filter(Boolean) as { file: string; filePath: string; mtime: number }[]

      filesWithStat.sort((a, b) => b.mtime - a.mtime)

      // 保留最新的 2 个，删除其余
      const toDelete = filesWithStat.slice(2)
      let clearedCount = 0

      for (const { filePath, file } of toDelete) {
        try {
          unlinkSync(filePath)
          clearedCount++
          log.info('[UpdateNew] 已删除旧缓存:', file)
        } catch (err) {
          log.warn('[UpdateNew] 删除缓存文件失败:', file, err)
        }
      }

      if (clearedCount > 0) {
        log.info(`[UpdateNew] 共清理 ${clearedCount} 个旧缓存，保留 ${filesWithStat.length - clearedCount} 个`)
      }
    } catch (error) {
      log.warn('[UpdateNew] 清理缓存目录失败:', error)
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

    // 安装前清理缓存目录，释放磁盘空间
    this.clearUpdateCache()

    log.info('[LanUpdate] 启动安装程序:', installerPath)

    const { spawn } = require('child_process')

    if (process.platform === 'darwin') {
      // macOS: 处理 .dmg 或 .app 文件
      if (installerPath.endsWith('.dmg')) {
        // 挂载 DMG 并打开 Finder
        spawn('hdiutil', ['attach', installerPath, '-nobrowse'], {
          detached: true,
          stdio: 'ignore'
        })
      } else if (installerPath.endsWith('.app')) {
        // 直接启动 .app
        spawn('open', [installerPath], {
          detached: true,
          stdio: 'ignore'
        })
      } else {
        // 其他格式，尝试用 open 命令打开
        spawn('open', [installerPath], {
          detached: true,
          stdio: 'ignore'
        })
      }
    } else {
      // Windows: 使用 spawn 以 detached 模式启动安装程序
      const child = spawn(installerPath, [], {
        detached: true,
        stdio: 'ignore',
        shell: true
      })
      child.unref()
    }

    // 等待一小段时间让安装程序启动，然后退出应用
    setTimeout(() => {
      app.quit()
    }, 500)
  }

  /**
   * 创建窗口
   * @description 由 PopupManager 调用，创建后不自动显示（由 PopupManager 控制显示时机）
   * @returns 窗口实例
   */
  create(): BrowserWindow {
    return super.create()
  }

  /**
   * 销毁更新窗口
   * @description 直接销毁窗口，由 PopupManager 管理动画
   */
  destroy(): void {
    super.destroy()
    log.info('更新窗口被销毁')
  }
}
