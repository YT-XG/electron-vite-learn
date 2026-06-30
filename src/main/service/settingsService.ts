/**
 * 应用设置服务
 * @description 管理 settings.json 中的用户配置，以及全局快捷键生命周期
 *
 * 设置持久化到 userData/settings.json，支持：
 * - 快捷键自定义（跨平台 CommandOrControl 格式）
 * - 热重载：update() 后立即重新注册全球快捷键
 * - 边界处理：文件损坏/不存在时自动返回默认值
 */
import { app, globalShortcut } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import log from 'electron-log'
import { windowFactory } from '../frame'

/** 应用设置类型 */
export interface AppSettings {
  /** Electron accelerator 格式的全局快捷键，如 'CommandOrControl+Alt+V' */
  shortcut: string
  /**
   * 局域网更新服务器路径
   * - Windows: UNC 路径，如 '\\10.15.2.28\dist'
   * - macOS: SMB 挂载路径，如 '/Volumes/dist'（需先在 Finder 中挂载共享文件夹）
   */
  serverUrl: string
  /** 开机自启动 */
  autoStart: boolean
  /** 翻译 API 地址（可选） */
  translateApiUrl?: string
  /** 翻译 API Key（可选） */
  translateApiKey?: string
  /** 更新源：lan（局域网）或 github */
  updateSource: 'lan' | 'github'
  /** GitHub 仓库地址（格式：owner/repo） */
  githubRepo: string
}

/**
 * 获取默认更新服务器路径（跨平台）
 * @description Windows 使用 UNC 路径，macOS 使用 SMB 挂载路径
 * @returns 默认服务器路径
 */
function getDefaultServerUrl(): string {
  if (process.platform === 'darwin') {
    // macOS: 用户需要先在 Finder 中挂载 SMB 共享到 /Volumes/dist
    // 操作：Finder → 前往 → 连接服务器 → 输入 smb://10.15.8.28/dist
    return '/Volumes/dist'
  }
  // Windows: 使用 UNC 路径
  return '\\\\10.15.8.28\\dist'
}

/** 默认设置 */
const DEFAULT_SETTINGS: AppSettings = {
  shortcut: 'CommandOrControl+Alt+V',
  serverUrl: getDefaultServerUrl(),
  autoStart: false,
  updateSource: 'github',
  githubRepo: 'YT-XG/electron-vite-learn'
}

class SettingsService {
  private settings: AppSettings = { ...DEFAULT_SETTINGS }
  private filePath: string = ''

  /**
   * 初始化设置服务
   * - 加载 settings.json（不存在时使用默认值）
   * - 注册全局快捷键
   */
  async init(): Promise<void> {
    this.filePath = join(app.getPath('userData'), 'settings.json')
    this.settings = this.#load()
    this.#registerShortcut()
    this.#applyAutoStart()
    log.info('[Settings] 初始化完成，当前快捷键:', this.settings.shortcut)
  }

  /**
   * 获取全部设置
   */
  getAll(): AppSettings {
    return { ...this.settings }
  }

  /**
   * 更新设置
   * - 合并到现有设置
   * - 写入磁盘
   * - 重新注册快捷键（立即生效）
   */
  update(partial: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...partial }
    this.#save()
    this.#registerShortcut()
    this.#applyAutoStart()
    log.info('[Settings] 已更新，当前快捷键:', this.settings.shortcut)
  }

  /**
   * 销毁服务（应用退出时调用）
   */
  destroy(): void {
    globalShortcut.unregisterAll()
    log.info('[Settings] 已清理全局快捷键')
  }

  /**
   * 从 disk 加载设置
   * 文件不存在 → 返回默认值
   * 文件损坏 → log 警告 + 返回默认值
   * 跨平台修正：自动修正不匹配当前平台的 serverUrl
   */
  #load(): AppSettings {
    if (!existsSync(this.filePath)) {
      return { ...DEFAULT_SETTINGS }
    }

    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      const loaded = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }

      // 跨平台修正：如果 serverUrl 与当前平台不匹配，自动替换为默认值
      if (process.platform === 'darwin') {
        // macOS: UNC 路径（\\开头）不适用，替换为默认 SMB 挂载路径
        if (loaded.serverUrl.startsWith('\\\\')) {
          log.info('[Settings] macOS 检测到 UNC 路径，自动替换为默认 SMB 挂载路径')
          loaded.serverUrl = DEFAULT_SETTINGS.serverUrl
        }
      } else {
        // Windows: SMB 挂载路径（/Volumes/ 开头）不适用，替换为默认 UNC 路径
        if (loaded.serverUrl.startsWith('/Volumes/')) {
          log.info('[Settings] Windows 检测到 SMB 挂载路径，自动替换为默认 UNC 路径')
          loaded.serverUrl = DEFAULT_SETTINGS.serverUrl
        }
      }

      return loaded
    } catch (err) {
      log.warn('[Settings] 配置文件损坏，使用默认值:', err)
      return { ...DEFAULT_SETTINGS }
    }
  }

  /**
   * 保存设置到 disk
   */
  #save(): void {
    try {
      writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch (err) {
      log.error('[Settings] 保存失败:', err)
    }
  }

  /**
   * 应用开机自启动设置
   * @description 调用 Electron 的 app.setLoginItemSettings 设置开机自启
   */
  #applyAutoStart(): void {
    app.setLoginItemSettings({
      openAtLogin: this.settings.autoStart,
      openAsHidden: true
    })
    windowFactory
      .getNoticeManager()
      .show({ text: '开机自启已' + (this.settings.autoStart ? '开启' : '关闭')})
    log.info('[Settings] 开机自启:', this.settings.autoStart ? '已开启' : '已关闭')
  }

  /**
   * 注册/重新注册全局快捷键
   * 先 unregisterAll → 再 register accelerator
   * callback 调用 MainPageFrame.showCentered()（与托盘左键行为一致）
   */
  #registerShortcut(): void {
    globalShortcut.unregisterAll()

    const accelerator = this.settings.shortcut
    if (!accelerator) return

    const registered = globalShortcut.register(accelerator, () => {
      windowFactory.getMainPageFrame().showCentered()
    })

    if (registered) {
      log.info('[Settings] 全局快捷键已注册:', accelerator)
    } else {
      log.warn('[Settings] 全局快捷键注册失败（可能被系统或其他应用占用）:', accelerator)
    }
  }
}

export const settingsService = new SettingsService()
