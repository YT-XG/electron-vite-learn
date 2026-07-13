import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, shell } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { existsSync, statSync, readFileSync, unlinkSync } from 'fs'
import { basename, join } from 'path'
import { arch, hostname, platform, release, totalmem, freemem } from 'os'
import { windowFactory } from './frame'

// macOS GPU 崩溃修复：提前禁用 GPU 加速，必须在 app ready 前设置
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
}
import QuickShareFrame from './frame/QuickShareFrame'
import { TrayService } from './service/trayService'
import { clipboardService } from './service/clipboardService'
import { settingsService } from './service/settingsService'
import { translateService } from './service/translateService'
import { claudeCodeService } from './service/claudeCodeService'
import { downloadService } from './service/downloadService'
import { fileTransferService } from './service/fileTransferService'
import { textShareService } from './service/textShareService'
import { shellIntegrationService } from './service/shellIntegrationService'
import './service/inputService'
import log from 'electron-log'

// ── 全局错误捕获（记录完整堆栈） ──
process.on('uncaughtException', (error) => {
  log.error('[App] 未捕获异常:', error.message)
  log.error('[App] 异常堆栈:', error.stack)
})

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : ''
  log.error('[App] 未处理的 Promise 拒绝:', message)
  if (stack) log.error('[App] 拒绝堆栈:', stack)
})

// ── 配置 electron-log ──
log.transports.file.level = 'info'
log.transports.console.level = 'info'

// 记录系统信息，方便定位闪退原因
const sysInfo = {
  os: `${platform()} ${release()}`,
  arch: arch(),
  hostname: hostname(),
  electron: process.versions.electron,
  node: process.versions.node,
  chrome: process.versions.chrome,
  v8: process.versions.v8,
  totalMem: `${Math.round(totalmem() / 1024 / 1024 / 1024)}GB`,
  freeMem: `${Math.round(freemem() / 1024 / 1024 / 1024)}GB`,
  appVersion: app.getVersion(),
  appPath: app.getAppPath()
}
log.info('[App] 应用启动，系统信息:', JSON.stringify(sysInfo, null, 2))
log.info('[App] 日志路径:', log.transports.file.getFile().path)

// ── 进程崩溃监控（捕获 GPU 进程 / 子进程崩溃） ──
app.on('child-process-gone', (_event, details) => {
  log.error('[App] 子进程崩溃:', JSON.stringify({
    type: details.type,       // GPU / Utility / etc.
    reason: details.reason,   // crashed / killed / oom / etc.
    exitCode: details.exitCode
  }))
})

// 监听每个渲染进程的崩溃事件
app.on('web-contents-created', (_event, contents) => {
  contents.on('render-process-gone', (_event, details) => {
    log.error('[App] 渲染进程崩溃:', JSON.stringify({
      reason: details.reason,
      exitCode: details.exitCode
    }))
  })
})

/** 托盘服务实例 */
let trayService: TrayService | null = null

/** 是否正在退出应用 */
let isQuitting = false

// 设置应用名称为"Prism"，避免自启/任务栏显示"Electron"或"electron-app"
app.setName('Prism')

// ── 单实例锁 ──

interface FileEntry {
  name: string
  path: string
  size: number
}

/** 待分享的文件（从 --send-files 命令行参数获取） */
let pendingShareFiles: FileEntry[] = []

/**
 * 获取分享临时文件路径
 */
function getShareTempPath(): string {
  if (process.platform === 'win32') {
    return join(process.env.TEMP || 'C:\\Temp', 'psf')
  }
  return '/tmp/prism-share'
}

/**
 * 从临时文件读取分享的文件路径
 * @description Windows 右键菜单通过 cmd 把文件路径写入临时文件
 *              macOS 通过 --send-files 参数传递
 */
function readShareTempFile(): string[] {
  try {
    const tempPath = getShareTempPath()
    if (!existsSync(tempPath)) return []

    const content = readFileSync(tempPath, 'utf-8').trim()
    if (!content) return []

    // Windows: 路径用 | 分隔；移除可能存在的引号
    const rawPaths = content.split('|').map((p) => p.replace(/"/g, '').trim()).filter(Boolean)
    const validPaths = rawPaths.filter((p) => existsSync(p))

    // 读取后清理临时文件
    try { unlinkSync(tempPath) } catch { /* ignore */ }

    return validPaths
  } catch {
    return []
  }
}

/**
 * 处理命令行参数和临时文件中的分享文件
 * @description 从 argv(--send-files，macOS) 或临时文件(Windows) 提取文件路径
 * @param argv - 命令行参数列表
 * @returns 是否处理了分享文件
 */
function handleSendFiles(argv: string[]): boolean {
  try {
    // 1. 尝试从 argv 中提取 --send-files (macOS Automator)
    let paths: string[] = []
    const idx = argv.indexOf('--send-files')
    if (idx !== -1) {
      paths = argv.slice(idx + 1).filter((a) => {
        if (a.startsWith('-')) return false
        return existsSync(a)
      })
    }

    // 2. 尝试从临时文件读取 (Windows 右键菜单)
    if (paths.length === 0) {
      paths = readShareTempFile()
    }

    if (paths.length === 0) return false

    pendingShareFiles = paths.map((p) => ({
      name: basename(p),
      path: p,
      size: statSync(p).size
    }))
    log.info(`[App] 收到分享文件: ${paths.length} 个文件`)

    if (fileTransferService.port > 0) {
      showQuickShare()
    }
    return true
  } catch (err) {
    log.error('[App] handleSendFiles 错误:', err)
    return false
  }
}

/**
 * 显示文件快捷分享弹窗
 */
function showQuickShare(): void {
  if (pendingShareFiles.length === 0) return

  const frame = new QuickShareFrame()
  frame.setFiles(pendingShareFiles)
  frame.create()
  frame.showCentered()

  pendingShareFiles = []
}

// 单实例锁：确保只有一个实例运行（设置 ALLOW_MULTI_INSTANCE=1 可绕过，用于联机测试）
const gotLock = process.env.ALLOW_MULTI_INSTANCE || app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // 当第二个实例启动时，将文件路径转发给已有实例
  app.on('second-instance', (_event, argv) => {
    // 如果是文件分享操作，不打开主窗口
    if (handleSendFiles(argv)) return

    // 聚焦主窗口
    const mainPage = windowFactory.getMainPageFrame()
    if (mainPage.isAlive()) {
      mainPage.showCentered()
    } else {
      mainPage.create()
    }
  })

  // macOS: 通过 open -b 或 Automator 打开文件时触发
  app.on('open-file', (event, path) => {
    event.preventDefault()
    if (existsSync(path)) {
      pendingShareFiles.push({
        name: basename(path),
        path,
        size: statSync(path).size
      })
      log.info(`[App] open-file: ${path}`)
      // 如果服务已就绪，处理完后显示弹窗
      if (fileTransferService.port > 0 && pendingShareFiles.length > 0) {
        showQuickShare()
      }
    }
  })
}

app.whenReady().then(async () => {
  // 设置应用用户模型 ID
  electronApp.setAppUserModelId('com.electron')

  // 监听窗口创建，自动设置快捷键
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 初始化托盘服务
  trayService = new TrayService()
  // 初始化剪贴板历史服务（SQLite + IPC 注册 + 剪贴板监控）
  await clipboardService.init()
  // 初始化设置服务（加载配置文件 + 注册全局快捷键）
  settingsService.init()
  // 初始化翻译服务（SQLite + IPC 注册）
  await translateService.init()
  // 初始化 Claude Code 监控服务（HTTP 服务器 + Hook 管理）
  await claudeCodeService.init()
  // 设置 Claude Code 状态通知开关回调（settingsService ↔ claudeCodeService 解耦，避免循环依赖）
  settingsService.setClaudeStatusHandler((enabled) => {
    if (enabled) {
      claudeCodeService.installHook().catch((err: Error) => {
        log.warn('[Settings] Claude Code Hook 安装失败:', err)
      })
    } else {
      // uninstallHook 内部已处理：hideClaudeStatus + destroyPermissionNotice + destroyPermissionWaiters + stopServer
      claudeCodeService.uninstallHook().catch((err: Error) => {
        log.warn('[Settings] Claude Code Hook 卸载失败:', err)
      })
    }
  })
  // 初始化下载服务（多线程下载）
  downloadService.init()
  // 初始化文件互传服务（HTTP Server + mDNS）
  await fileTransferService.init()
  // 注册本地文件分享回调（Windows 右键菜单 → HTTP → 弹窗）
  fileTransferService.setLocalShareHandler((files) => {
    const frame = new QuickShareFrame()
    frame.setFiles(files)
    frame.create()
    frame.showCentered()
  })
  // 初始化文本分享服务（注册 IPC）
  textShareService.init()

  // 处理首次启动时的 --send-files 参数
  handleSendFiles(process.argv)

  // 自动注册右键菜单（如果已启用）
  const settings = settingsService.getAll()
  if (settings.shellIntegration !== false) {
    shellIntegrationService.register().catch(() => {})
  }

  // 渲染进程复制文本到剪贴板（fallback，navigator.clipboard 不可用时使用）
  ipcMain.on('to-service-ClipboardService:writeText', (_event, text: string) => {
    clipboard.writeText(text)
  })

  // 设置相关 IPC
  ipcMain.handle('to-service-SettingsService:get', () => {
    return settingsService.getAll()
  })

  ipcMain.handle('to-service-SettingsService:update', (_event, partial: Record<string, unknown>) => {
    settingsService.update(partial)
  })

  // Shell 相关 IPC（打开文件/文件夹）
  ipcMain.handle('shell:openPath', (_event, filePath: string) => {
    return shell.openPath(filePath)
  })

  ipcMain.handle('shell:showItemInFolder', (_event, fullPath: string) => {
    return shell.showItemInFolder(fullPath)
  })

  // 右键菜单集成 IPC（注册/注销）
  ipcMain.handle('shell:registerContextMenu', async () => {
    await shellIntegrationService.register()
    return { ok: true }
  })
  ipcMain.handle('shell:unregisterContextMenu', async () => {
    await shellIntegrationService.unregister()
    return { ok: true }
  })

  // macOS：点击 Dock 图标时显示主页面
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowFactory.getMainPageFrame().create()
    } else {
      // 当窗口存在但全部隐藏/最小化时，恢复显示主页面
      const mainFrame = windowFactory.getMainPageFrame()
      if (mainFrame && mainFrame.isAlive()) {
        const win = mainFrame.getWindow()
        if (win) {
          if (win.isMinimized()) win.restore()
          win.show()
          win.focus()
        }
      }
    }
  })
})

// 所有窗口关闭时退出应用（非 macOS）
app.on('window-all-closed', () => {
  // 注意：有托盘时，关闭窗口不会退出应用
  // 只有点击托盘菜单的"退出"才会真正退出
  if (process.platform !== 'darwin') {
    // 如果不是从托盘退出，不关闭所有窗口
    if (!isQuitting) {
      return
    }
  }
  windowFactory.closeAll()
  trayService?.destroy()
  app.quit()
})

// 应用退出前的清理
app.on('before-quit', () => {
  isQuitting = true
  log.info('[App] 应用退出，清理资源...')
  clipboardService.stop()
  settingsService.destroy()
  translateService.destroy()
  claudeCodeService.destroy()
  fileTransferService.destroy()
  trayService?.destroy()
  // 注销所有全局快捷键
  globalShortcut.unregisterAll()
})
