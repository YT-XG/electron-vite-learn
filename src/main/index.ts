import { app, BrowserWindow, clipboard, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { windowFactory } from './frame'
import { TrayService } from './service/trayService'
import { clipboardService } from './service/clipboardService'
import { settingsService } from './service/settingsService'
import './service/inputService'
import log from 'electron-log'

// 配置 electron-log：日志写入文件
log.transports.file.level = 'info'
log.transports.console.level = 'info'
log.info('[App] 应用启动，日志路径:', log.transports.file.getFile().path)

/** 托盘服务实例 */
let trayService: TrayService | null = null

// 设置退出标志
;(app as any).isQuitting = false

app.whenReady().then(async () => {
  // 设置应用用户模型 ID
  electronApp.setAppUserModelId('com.electron')

  // 监听窗口创建，自动设置快捷键
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 初始化托盘服务
  trayService = new TrayService()
  // 创建新版更新窗口（未发现新版本自动销毁）
  windowFactory.getUpdateNewFrame().create()
  // 初始化剪贴板历史服务（SQLite + IPC 注册 + 剪贴板监控）
  await clipboardService.init()
  // 初始化设置服务（加载配置文件 + 注册全局快捷键）
  settingsService.init()

  // 渲染进程复制文本到剪贴板（fallback，navigator.clipboard 不可用时使用）
  ipcMain.on('clipboard-write', (_event, text: string) => {
    clipboard.writeText(text)
  })

  // 点击剪贴板记录 → 写入剪贴板 → 隐藏窗口 → 恢复焦点 → 粘贴
  // 由 ClipboardManager.vue 的 copyItem 触发
  // 设计参考 copy-creator（Rust Tauri）的 paste_with_defocus
  ipcMain.handle('clipboard:click-item', async (_event, content: string) => {
    log.info('[Clipboard] 用户点击记录，开始粘贴流程')

    // 1. 写入系统剪贴板 + 同步监控缓存（避免触发通知弹窗）
    clipboard.writeText(content)
    clipboardService.syncMonitorCache()
    log.info('[Clipboard] 已写入系统剪贴板')

    // 2. 最小化主页面窗口（先移除 alwaysOnTop → 最小化 → Windows 自动恢复焦点）
    const mainPage = windowFactory.getMainPageFrame()
    if (mainPage.isAlive()) {
      mainPage.minimizeForPaste()
      log.info('[Clipboard] 已最小化主页面（Windows 自动恢复焦点到上一个窗口）')
    }

    // 3. 等待焦点稳定
    await new Promise((resolve) => setTimeout(resolve, 300))

    // 4. 执行粘贴（nut-js Ctrl+V，使用 SendInput，无需前台权限）
    log.info('[Clipboard] 开始执行粘贴...')
    const inputService = (await import('./service/inputService')).inputService
    await inputService.pasteToPreviousWindow()
    log.info('[Clipboard] 粘贴流程完成')
  })

  // 设置相关 IPC
  ipcMain.handle('settings:get', () => {
    return settingsService.getAll()
  })

  ipcMain.handle('settings:update', (_event, partial: Record<string, unknown>) => {
    settingsService.update(partial)
  })

  // 应用激活时重新创建窗口（macOS）
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowFactory.createBallFrame()
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
  trayService?.destroy()
})
