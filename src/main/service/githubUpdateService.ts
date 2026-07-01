import { app, net } from 'electron'
import * as fs from 'fs'
import { join } from 'path'
import log from 'electron-log'

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

      // 比较版本号
      if (this.compareVersions(latestVersion, this.currentVersion) <= 0) {
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

    return new Promise((resolve, reject) => {
      let settled = false

      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true
          fn()
        }
      }

      const request = net.request({
        url: info.downloadUrl,
        headers: {
          'User-Agent': `ElectronApp/${this.currentVersion}`
        }
      })

      request.on('response', (response) => {
        if (response.statusCode !== 200 && response.statusCode !== 302) {
          settle(() => reject(new Error(`下载失败: HTTP ${response.statusCode}`)))
          return
        }

        const contentLength = parseInt(response.headers['content-length']?.[0] || '0', 10)
        let downloaded = 0
        const chunks: Buffer[] = []

        // 如果没有 content-length，使用 info.size 作为备用
        const totalSize =
          contentLength > 0 ? contentLength : info.size > 0 ? info.size : 0

        response.on('data', (chunk) => {
          chunks.push(chunk)
          downloaded += chunk.length
          if (totalSize > 0) {
            const percent = Math.min(Math.round((downloaded / totalSize) * 100), 100)
            onProgress?.(percent)
          }
        })

        response.on('end', () => {
          settle(() => {
            try {
              const buffer = Buffer.concat(chunks)
              fs.writeFileSync(localPath, buffer)
              log.info('[GitHubUpdate] 下载完成:', localPath)
              onProgress?.(100)
              resolve(localPath)
            } catch (writeError) {
              reject(
                new Error(
                  `写入文件失败: ${writeError instanceof Error ? writeError.message : String(writeError)}`
                )
              )
            }
          })
        })
      })

      request.on('error', (err) => {
        log.error('[GitHubUpdate] 网络请求错误:', err.message)
        // 清理失败的下载文件
        try {
          if (fs.existsSync(localPath)) {
            fs.unlinkSync(localPath)
          }
        } catch {
          // 忽略清理错误
        }
        settle(() => reject(new Error(`网络连接失败: ${err.message}`)))
      })

      request.end()
    })
  }

  /**
   * 比较两个版本号
   * @param v1 - 版本号 1
   * @param v2 - 版本号 2
   * @returns v1 > v2 返回 1，v1 < v2 返回 -1，相等返回 0
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number)
    const parts2 = v2.split('.').map(Number)

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0
      const p2 = parts2[i] || 0
      if (p1 > p2) return 1
      if (p1 < p2) return -1
    }
    return 0
  }
}

/** GitHub 更新服务单例 */
export const githubUpdateService = new GitHubUpdateService()
