import { BaseFrame } from './index'
import { app, BrowserWindowConstructorOptions, screen } from 'electron'
import { join } from 'path'
import {
  copyFileSync,
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
import { getBottomMargin, isMacOS } from '../utils/platform'

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
 * @description 底部居中弹出的更新提示窗口，契合悬浮球主题
 */
export default class UpdateNewFrame extends BaseFrame {
  /** 弹窗宽度 */
  private static readonly POPUP_WIDTH = 380

  /** 弹窗高度 */
  private static readonly POPUP_HEIGHT = 280

  /** 窗口底部距屏幕边缘的间距（像素） */
  private static readonly BOTTOM_MARGIN = 60

  /** 是否正在显示 */
  #isShowing = false

  /** 动画是否正在播放 */
  #isAnimating = false

  /** 动画帧 ID */
  #animationFrameId: ReturnType<typeof setTimeout> | null = null

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

    // 渲染进程请求隐藏更新窗口
    this.recvOne('to-main-UpdateNewFrame:hide', async () => {
      await this.hide()
    })

    // 渲染进程请求销毁更新窗口
    this.recvOne('to-main-UpdateNewFrame:destroy', async () => {
      await this.destroy()
    })

    // 渲染进程已就绪，显示窗口并发送待处理的数据
    this.recvOne('to-main-UpdateNewFrame:ready', async () => {
      console.log('渲染进程加载完毕，准备检查更新')
      await this.checkForUpdates()
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
      if (serverUrl.startsWith('\\\\') || serverUrl.startsWith('\\\\')) {
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
    console.log('进入检测更新状态')
    const settings = settingsService.getAll()

    // 根据设置选择更新源
    if (settings.updateSource === 'github') {
      return this.checkGitHubUpdates()
    }
    return this.checkLanUpdates()
  }

  /**
   * 检查 GitHub 更新
   * @description 从 GitHub Releases 检查更新
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
        releaseDate: githubInfo.releaseDate
      }

      log.info('[UpdateNew] GitHub 发现新版本:', updateInfo)

      // 保存更新信息供下载和安装使用
      this.currentUpdateInfo = updateInfo

      // 检查本地缓存是否已有该版本的安装包
      const cachedPath = this.findCachedUpdate(githubInfo.version)
      if (cachedPath) {
        log.info('[UpdateNew] 本地已缓存该版本，直接显示安装按钮')
        this.currentDownloadPath = cachedPath
        // 通知渲染进程：已下载完成，可直接安装
        this.sendOne('to-renderer-UpdateNewFrame:downloaded', { path: cachedPath })
      }

      // 显示更新窗口
      await this.showUpdate({ version: githubInfo.version, updateInfo })
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
   * @description 从共享文件夹检查更新（保留原有逻辑）
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
        releaseDate: (latestInfo.releaseDate as string) || new Date().toISOString()
      }
      log.info('[LanUpdate] 发现新版本:', updateInfo)

      // 保存更新信息供下载和安装使用
      this.currentUpdateInfo = updateInfo

      // 检查本地缓存是否已有该版本的安装包
      const cachedPath = this.findCachedUpdate(remoteVersion)
      if (cachedPath) {
        log.info('[UpdateNew] 本地已缓存该版本，直接显示安装按钮')
        this.currentDownloadPath = cachedPath
        // 通知渲染进程：已下载完成，可直接安装
        this.sendOne('to-renderer-UpdateNewFrame:downloaded', { path: cachedPath })
      }

      // 显示更新窗口
      await this.showUpdate({ version: remoteVersion, updateInfo })
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

    // 构建 GitHub 更新信息
    const githubInfo: GitHubUpdateInfo = {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
      releaseDate: info.releaseDate || '',
      file: info.file,
      size: info.size,
      downloadUrl: `https://github.com/${settingsService.getAll().githubRepo}/releases/download/v${info.version}/${info.file}`
    }

    // 报告 0% 进度
    this.sendOne('to-renderer-UpdateNewFrame:progress', {
      transferred: 0,
      total: info.size,
      bytesPerSecond: 0,
      percent: 0
    })

    // 下载文件
    const localPath = await githubUpdateService.downloadUpdate(githubInfo, (percent) => {
      this.sendOne('to-renderer-UpdateNewFrame:progress', {
        transferred: Math.round((info.size * percent) / 100),
        total: info.size,
        bytesPerSecond: 0,
        percent
      })
    })

    this.currentDownloadPath = localPath
    log.info('[UpdateNew] GitHub 下载完成:', localPath)

    // 通知渲染进程下载完成
    this.sendOne('to-renderer-UpdateNewFrame:downloaded', { path: localPath })

    return localPath
  }

  /**
   * 从局域网下载更新包
   * @param info - 更新信息
   */
  private async downloadLanUpdate(info: UpdateInfo): Promise<string> {
    // 构建远程文件路径
    const remoteFilePath = join(this.config.serverUrl, info.file)
    log.info('[LanUpdate] 服务器地址:', this.config.serverUrl)
    log.info('[LanUpdate] 文件名:', info.file)
    log.info('[LanUpdate] 完整路径:', remoteFilePath)
    // 带超时检查文件是否存在（避免访问不可达 UNC 路径时长时间阻塞）
    log.info('[LanUpdate] 检查源文件是否存在...')
    const srcExists = await this.checkFileExistsWithTimeout(remoteFilePath)
    log.info('[LanUpdate] 源文件存在:', srcExists)
    if (!srcExists) {
      throw new Error(`更新文件不存在或访问超时: ${remoteFilePath}`)
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
    this.sendOne('to-renderer-UpdateNewFrame:progress', {
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
    this.sendOne('to-renderer-UpdateNewFrame:progress', {
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
      log.warn(`[LanUpdate] 文件大小不匹配: 预期 ${info.size}, 实际 ${downloadedSize}`)
    }

    log.info('[LanUpdate] 下载完成:', localFilePath)
    this.sendOne('to-renderer-UpdateNewFrame:downloaded', { path: localFilePath })

    return localFilePath
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
   * 计算屏幕底部居中位置
   * @returns 窗口左上角坐标 { x, y }
   */
  #calcBottomCenterPosition(): { x: number; y: number } {
    const display = screen.getPrimaryDisplay()
    const { workArea } = display

    const popupW = UpdateNewFrame.POPUP_WIDTH
    const popupH = UpdateNewFrame.POPUP_HEIGHT

    // 水平居中
    const x = workArea.x + (workArea.width - popupW) / 2
    // 距底部 60px（macOS 会额外加上 Dock 高度）
    const bottomMargin = getBottomMargin(UpdateNewFrame.BOTTOM_MARGIN)
    const y = workArea.y + workArea.height - popupH - bottomMargin

    return { x: Math.round(x), y: Math.round(y) }
  }

  /**
   * 执行窗口位置动画
   * @description 使用缓动函数实现平滑的弹出/收起效果
   * @param fromY - 起始 Y 坐标
   * @param toY - 目标 Y 坐标
   * @param duration - 动画时长（毫秒）
   * @returns Promise 动画完成后 resolve
   */
  #animateWindow(fromY: number, toY: number, duration: number = 350): Promise<void> {
    return new Promise((resolve) => {
      if (this.#animationFrameId) {
        clearTimeout(this.#animationFrameId)
      }

      this.#isAnimating = true
      const startTime = Date.now()
      const x = this.window!.getPosition()[0]

      const animate = (): void => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)

        // 缓动函数：easeOutCubic - 先快后慢，更自然
        const easeOutCubic = 1 - Math.pow(1 - progress, 3)
        const currentY = Math.round(fromY + (toY - fromY) * easeOutCubic)

        this.window!.setPosition(x, currentY)

        if (progress < 1) {
          this.#animationFrameId = setTimeout(animate, 16) // ~60fps
        } else {
          this.#isAnimating = false
          this.#animationFrameId = null
          resolve()
        }
      }

      animate()
    })
  }

  /**
   * 显示更新窗口
   * @description 从屏幕底部居中弹出，带动画效果
   * @param data - 更新信息（版本号、更新说明、完整更新信息）
   */
  async showUpdate(data?: {
    version?: string
    description?: string
    updateInfo?: UpdateInfo
  }): Promise<void> {
    const pos = this.#calcBottomCenterPosition()
    const display = screen.getPrimaryDisplay()
    const { workArea, bounds } = display
    // macOS 需要加上 Dock 高度
    const dockHeight = process.platform === 'darwin' ? bounds.y + bounds.height - (workArea.y + workArea.height) : 0
    const screenHeight = workArea.height + workArea.y + dockHeight

    // 起始位置：屏幕底部外（窗口完全隐藏在底部）
    const startY = screenHeight + 10

    if (!this.isAlive()) {
      // 窗口不存在 → 创建并播放弹出动画
      this.create()
      this.window!.setPosition(pos.x, startY)
      this.window!.show()
      this.#isShowing = true

      // 播放弹出动画：从底部外滑入到目标位置
      await this.#animateWindow(startY, pos.y, 400)

      if (data) {
        this.sendOne('to-renderer-UpdateNewFrame:info', data)
      }
    } else {
      // 窗口已存在（隐藏状态）→ 定位 + 播放弹出动画 + 发送数据
      this.window!.setPosition(pos.x, startY)
      this.window!.show()
      this.#isShowing = true

      // 播放弹出动画
      await this.#animateWindow(startY, pos.y, 400)

      if (data) {
        this.sendOne('to-renderer-UpdateNewFrame:info', data)
      }
    }
  }

  /**
   * 隐藏更新窗口
   * @description 播放收起动画，然后隐藏窗口
   */
  async hide(): Promise<void> {
    if (this.isAlive() && this.#isShowing && !this.#isAnimating) {
      this.#isShowing = false

      // 计算目标位置：屏幕底部外（考虑 macOS Dock）
      const display = screen.getPrimaryDisplay()
      const { workArea, bounds } = display
      const dockHeight = process.platform === 'darwin' ? bounds.y + bounds.height - (workArea.y + workArea.height) : 0
      const screenHeight = workArea.height + workArea.y + dockHeight
      const targetY = screenHeight + 10

      // 播放收起动画：从当前位置滑出到底部外
      const currentY = this.window!.getPosition()[1]
      await this.#animateWindow(currentY, targetY, 300)

      // 动画完成后隐藏窗口
      if (!this.#isShowing) {
        this.window?.hide()
      }
    }
  }

  /**
   * 销毁更新窗口
   * @description 播放收起动画后销毁窗口
   */
  async destroy(): Promise<void> {
    if (this.isAlive() && !this.#isAnimating) {
      // 计算目标位置：屏幕底部外（考虑 macOS Dock）
      const display = screen.getPrimaryDisplay()
      const { workArea, bounds } = display
      const dockHeight = process.platform === 'darwin' ? bounds.y + bounds.height - (workArea.y + workArea.height) : 0
      const screenHeight = workArea.height + workArea.y + dockHeight
      const targetY = screenHeight + 10

      // 播放收起动画
      const currentY = this.window!.getPosition()[1]
      await this.#animateWindow(currentY, targetY, 300)
    }

    // 清理动画帧
    if (this.#animationFrameId) {
      clearTimeout(this.#animationFrameId)
      this.#animationFrameId = null
    }

    super.destroy()
    console.log('更新窗口被销毁')
  }
}
