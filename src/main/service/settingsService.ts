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
import { windowFactory, popupManager, NoticeNewFrame } from '../frame'

/** 应用设置类型 */
export interface AppSettings {
  /** Electron accelerator 格式的全局快捷键，如 'CommandOrControl+Alt+V' */
  shortcut: string
  /** 片段选择器快捷键，如 'CommandOrControl+Shift+V' */
  snippetShortcut: string
  /** 搜索框快捷键，如 'CommandOrControl+K' */
  searchBoxShortcut: string
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
  /** 下载线程数（1-16） */
  downloadThreads: number
  /** 文件互传接收目录，默认系统下载目录 */
  transferSaveDir: string
  /** 文件互传设备名称，默认 os.hostname() */
  transferDeviceName: string
  /** TCP 跨子网扫描网段列表，如 ["10.15.8.0/24"] */
  scanSubnets: string[]
  /** 手动添加的设备列表 */
  manualDevices: { address: string; port: number }[]
  /** Claude Code 状态通知开关 */
  showClaudeStatus: boolean
  /** 文件资源管理器右键菜单集成（Shell 集成） */
  shellIntegration?: boolean
  /** 剪贴板历史保留天数: 10 | 30 | 90 */
  clipboardRetentionDays: number
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
  snippetShortcut: 'CommandOrControl+Shift+V',
  searchBoxShortcut: 'CommandOrControl+K',
  serverUrl: getDefaultServerUrl(),
  autoStart: true,
  updateSource: 'github',
  githubRepo: 'YT-XG/electron-vite-learn',
  downloadThreads: 8,
  transferSaveDir: '',
  transferDeviceName: '',
  scanSubnets: [],
  manualDevices: [],
  showClaudeStatus: false,
  shellIntegration: true,
  clipboardRetentionDays: 30
}

class SettingsService {
  private settings: AppSettings = { ...DEFAULT_SETTINGS }
  private filePath: string = ''
  /** Claude Code 状态通知开关变化的回调（由 index.ts 注入，避免循环依赖） */
  private claudeStatusHandler: ((enabled: boolean) => void) | null = null

  /**
   * 设置 Claude Code 状态通知开关回调
   * @description 由 index.ts 在初始化所有服务后调用，避免模块间循环依赖
   */
  setClaudeStatusHandler(handler: (enabled: boolean) => void): void {
    this.claudeStatusHandler = handler
  }

  /**
   * 初始化设置服务
   * - 加载 settings.json（不存在时使用默认值）
   * - 注册全局快捷键
   * - 清理旧版自启项名称（Electron / electron-app）
   */
  init(): void {
    this.filePath = join(app.getPath('userData'), 'settings.json')
    this.settings = this.#load()
    // 清理旧版自启项残留
    this.#cleanupStaleLoginItems()
    this.#registerAllShortcuts()
    this.#applyAutoStart()
    this.#registerIPC()
    log.info('[Settings] 初始化完成')
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
   * - 仅 autoStart 变化时才触发开机自启通知
   * - 仅快捷键变化时才重新注册快捷键
   * - 联动 Claude Code 状态通知开关：通过回调避免循环依赖
   */
  update(partial: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...partial }
    this.#save()
    if (partial.shortcut !== undefined || partial.snippetShortcut !== undefined || partial.searchBoxShortcut !== undefined) {
      this.#registerAllShortcuts()
    }
    if (partial.autoStart !== undefined) {
      this.#applyAutoStart()
    }

    // Claude Code status notification toggle → callback to avoid circular dependency
    if (partial.showClaudeStatus !== undefined && this.claudeStatusHandler) {
      this.claudeStatusHandler(partial.showClaudeStatus)
    }

    log.info('[Settings] 已更新')
  }

  /**
   * 销毁服务（应用退出时调用）
   */
  destroy(): void {
    globalShortcut.unregisterAll()
    log.info('[Settings] 已清理全局快捷键')
  }

  /**
   * 注册 IPC 处理器
   */
  #registerIPC(): void {
    // IPC 处理器在 index.ts 中通过 to-service-SettingsService:* 注册
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
      openAsHidden: true,
      name: 'Prism'
    })
    const noticeText = '开机自启已' + (this.settings.autoStart ? '开启' : '关闭')
    popupManager.showNotice(
      () => {
        const frame = new NoticeNewFrame()
        frame.setMsg({ data: noticeText })
        return frame.create()
      },
      { type: 'notice', width: 500, height: 60 },
      { text: noticeText, duration: 5000 }
    )
    log.info('[Settings] 开机自启:', this.settings.autoStart ? '已开启' : '已关闭')
  }

  /**
   * 清理旧版开机自启项残留
   * @description 移除开发模式、旧名称、旧版打包注册的多个启动项
   *   - Electron: 开发框架名（npm run dev 时 electron.exe 注册）
   *   - electron-app: 旧版 appId 默认名称
   *   - com.electron: 旧版 appId
   *   - Prism: 重新注册确保路径正确（防止旧版指向 electron.exe 而非 prism.exe）
   */
  #cleanupStaleLoginItems(): void {
    const staleNames = ['Electron', 'electron-app', 'com.electron']
    for (const name of staleNames) {
      app.setLoginItemSettings({ openAtLogin: false, name })
    }
    // 强制重新注册当前项，确保路径指向正确的打包后 exe
    if (this.settings.autoStart) {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
        name: 'Prism'
      })
    }
    log.info('[Settings] 旧版启动项已清理，当前自启状态:', this.settings.autoStart)
  }

  /**
   * 注册/重新注册所有全局快捷键
   * @description 统一管理三大快捷键，避免 unregisterAll 遗漏
   *  - 主页面显示/隐藏（配置项 shortcut）
   *  - 片段选择器（配置项 snippetShortcut）
   *  - 搜索框（硬编码 CommandOrControl+K）
   */
  #registerAllShortcuts(): void {
    globalShortcut.unregisterAll()

    // 主页面快捷键
    this.#tryRegister(this.settings.shortcut, () => {
      windowFactory.getMainPageFrame().showCentered()
    }, '主页面')

    // 片段选择器快捷键
    this.#tryRegister(this.settings.snippetShortcut, () => {
      windowFactory.getSnippetPickerFrame().toggle()
    }, '片段选择器')

    // 搜索框快捷键
    this.#tryRegister(this.settings.searchBoxShortcut, () => {
      windowFactory.getSearchBoxFrame().toggle()
    }, '搜索框')
  }

  /**
   * 尝试注册一个全局快捷键
   * @param accelerator - 快捷键组合
   * @param callback - 回调函数
   * @param label - 快捷键用途（仅日志）
   */
  #tryRegister(accelerator: string, callback: () => void, label: string): void {
    if (!accelerator) return
    const registered = globalShortcut.register(accelerator, callback)
    if (registered) {
      log.info(`[Settings] ${label}快捷键已注册:`, accelerator)
    } else {
      log.warn(`[Settings] ${label}快捷键注册失败（可能被占用）:`, accelerator)
    }
  }
}

export const settingsService = new SettingsService()
