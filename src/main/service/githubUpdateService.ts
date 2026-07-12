import { app, net } from 'electron'
import * as fs from 'fs'
import { join } from 'path'
import log from 'electron-log'
import semver from 'semver'
import { downloadService } from './downloadService'

/** GitHub Release 资源接口 */
interface GitHubAsset {
  /** 资源名称 */
  name: string
  /** 下载链接 */
  browser_download_url: string
  /** 文件大小（字节） */
  size: number
  /** 资源状态 */
  state: string
}

/** GitHub Release 接口 */
interface GitHubRelease {
  /** 标签名（版本号） */
  tag_name: string
  /** 发布名称 */
  name: string
  /** 发布说明 */
  body: string
  /** 发布日期 */
  published_at: string
  /** 资源列表 */
  assets: GitHubAsset[]
}

/** 更新信息接口 */
export interface GitHubUpdateInfo {
  /** 版本号 */
  version: string
  /** 发布说明 */
  releaseNotes: string
  /** 发布日期 */
  releaseDate: string
  /** 文件名 */
  file: string
  /** 文件大小（字节） */
  size: number
  /** 下载链接 */
  downloadUrl: string
}

/**
 * GitHub 更新服务
 * @description 从 GitHub Releases 检查和下载应用更新
 */
class GitHubUpdateService {
  /** 缓存目录 */
  private cacheDir: string

  /** 当前应用版本 */
  private currentVersion: string

  constructor() {
    this.cacheDir = join(app.getPath('userData'), 'update-cache')
    this.currentVersion = app.getVersion()
  }

  /**
   * 检查 GitHub 是否有可用更新
   * @param repo - GitHub 仓库（格式：owner/repo）
   * @returns 更新信息，如果没有更新返回 null
   */
  async checkForUpdates(repo: string): Promise<GitHubUpdateInfo | null> {
    try {
      const releases = await this.fetchReleases(repo)
      if (!releases || releases.length === 0) {
        log.info('[GitHubUpdate] 没有找到任何 Release')
        return null
      }

      const latestRelease = releases[0]
      const latestVersion = latestRelease.tag_name.replace(/^v/, '')

      log.info(`[GitHubUpdate] 当前版本: ${this.currentVersion}, 最新版本: ${latestVersion}`)

      // 使用 semver 库比较版本号（正确处理 pre-release 标签）
      if (semver.lte(latestVersion, this.currentVersion)) {
        log.info('[GitHubUpdate] 已是最新版本')
        return null
      }

      // 根据当前平台选择安装包
      const asset = this.findAssetForPlatform(latestRelease.assets)
      if (!asset) {
        log.warn('[GitHubUpdate] 最新 Release 中没有找到适合当前平台的安装包')
        return null
      }

      log.info('[GitHubUpdate] 发现新版本:', latestVersion)

      return {
        version: latestVersion,
        releaseNotes: latestRelease.body,
        releaseDate: latestRelease.published_at,
        file: asset.name,
        size: asset.size,
        downloadUrl: asset.browser_download_url
      }
    } catch (error) {
      log.error('[GitHubUpdate] 检查更新失败:', error)
      return null
    }
  }

  /**
   * 根据当前平台查找对应的安装包
   * @param assets - Release 资源列表
   * @returns 匹配的资源，未找到返回 null
   */
  private findAssetForPlatform(assets: GitHubAsset[]): GitHubAsset | null {
    const platform = process.platform

    if (platform === 'darwin') {
      // macOS: 查找 DMG 文件
      return assets.find((a) => a.name.endsWith('.dmg')) || null
    } else if (platform === 'win32') {
      // Windows: 查找 EXE 安装包（优先 NSIS 安装包）
      return assets.find((a) => a.name.endsWith('-setup.exe')) || assets.find((a) => a.name.endsWith('.exe')) || null
    }

    return null
  }

  /**
   * 获取 GitHub Releases 列表
   * @param repo - GitHub 仓库（格式：owner/repo）
   * @returns Release 列表
   */
  private async fetchReleases(repo: string): Promise<GitHubRelease[]> {
    return new Promise((resolve, reject) => {
      const request = net.request({
        url: `https://api.github.com/repos/${repo}/releases`,
        headers: {
          'User-Agent': `ElectronApp/${this.currentVersion}`
        }
      })

      let responseData = ''

      request.on('response', (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`GitHub API 请求失败: ${response.statusCode}`))
          return
        }

        response.on('data', (chunk) => {
          responseData += chunk.toString()
        })

        response.on('end', () => {
          try {
            resolve(JSON.parse(responseData))
          } catch (e) {
            reject(new Error('解析 GitHub API 响应失败'))
          }
        })
      })

      request.on('error', reject)
      request.end()
    })
  }

  /**
   * 下载更新包
   * @param info - 更新信息
   * @param onProgress - 进度回调
   * @returns 下载后的本地文件路径
   */
  async downloadUpdate(
    info: GitHubUpdateInfo,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    const localPath = join(this.cacheDir, `update-${info.version}-${info.file}`)

    // 检查本地缓存
    if (fs.existsSync(localPath)) {
      log.info('[GitHubUpdate] 使用本地缓存:', localPath)
      onProgress?.(100)
      return localPath
    }

    // 确保缓存目录存在
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }

    log.info('[GitHubUpdate] 开始下载:', info.downloadUrl)

    // 使用多线程下载服务
    const task = await downloadService.startDownload({
      url: info.downloadUrl,
      savePath: localPath,
      threads: 4, // 更新下载用 4 线程即可
      defaultDir: this.cacheDir
    })

    // 等待下载完成（带 30 分钟超时）
    return new Promise((resolve, reject) => {
      const POLL_TIMEOUT = 30 * 60 * 1000 // 30 分钟
      let elapsed = 0

      const checkInterval = setInterval(() => {
        elapsed += 500
        if (elapsed >= POLL_TIMEOUT) {
          clearInterval(checkInterval)
          downloadService.cancelDownload(task.id)
          reject(new Error('下载超时'))
          return
        }

        const currentTask = downloadService.getTask(task.id)
        if (!currentTask) {
          clearInterval(checkInterval)
          reject(new Error('任务不存在'))
          return
        }

        if (currentTask.status === 'completed') {
          clearInterval(checkInterval)
          onProgress?.(100)
          resolve(localPath)
        } else if (currentTask.status === 'failed' || currentTask.status === 'canceled') {
          clearInterval(checkInterval)
          reject(new Error(currentTask.errorMessage || '下载失败'))
        } else if (currentTask.status === 'downloading') {
          onProgress?.(Math.round(currentTask.progress * 100))
        }
      }, 500)
    })
  }

}

/** GitHub 更新服务单例 */
export const githubUpdateService = new GitHubUpdateService()
