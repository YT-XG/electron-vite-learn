import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, shell } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { windowFactory } from './frame'
import { TrayService } from './service/trayService'
import { clipboardService } from './service/clipboardService'
import { settingsService } from './service/settingsService'
import { translateService } from './service/translateService'
import { claudeCodeService } from './service/claudeCodeService'
import { downloadService } from './service/downloadService'
import './service/inputService'
import log from 'electron-log'

// 抑制 Electron 默认错误弹窗（网络错误等已知异常由各模块自行处理）
process.on('uncaughtException', (error) => {
  log.error('[App] 未捕获异常:', error.message)
})

process.on('unhandledRejection', (reason) => {
  log.error('[App] 未处理的 Promise 拒绝:', reason)
})

// 配置 electron-log：日志写入文件
log.transports.file.level = 'info'
log.transports.console.level = 'info'
log.info('[App] 应用启动，日志路径:', log.transports.file.getFile().path)

/** 托盘服务实例 */
let trayService: TrayService | null = null

// 设置退出标志
;(app as any).isQuitting = false

// 设置应用名称为"Prism"，避免自启/任务栏显示"Electron"或"electron-app"
app.setName('Prism')

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
  // 初始化下载服务（多线程下载）
  downloadService.init()

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

  // macOS：点击 Dock 图标时显示主页面
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowFactory.getMainPageFrame().create()
    }
  })
})

// 所有窗口关闭时退出应用（非 macOS）
app.on('window-all-closed', () => {
  // 注意：有托盘时，关闭窗口不会退出应用
  // 只有点击托盘菜单的"退出"才会真正退出
  if (process.platform !== 'darwin') {
    // 如果不是从托盘退出，不关闭所有窗口
    if (!(app as any).isQuitting) {
      return
    }
  }
  windowFactory.closeAll()
  trayService?.destroy()
  app.quit()
})

// 应用退出前的清理
app.on('before-quit', () => {
  ;(app as any).isQuitting = true
  clipboardService.stop()
  settingsService.destroy()
  translateService.destroy()
  claudeCodeService.destroy()
  trayService?.destroy()
  // 注销所有全局快捷键
  globalShortcut.unregisterAll()
})
