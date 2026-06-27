import { app, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { windowFactory } from './frame'
import { TrayService } from './trayService'
import { LanUpdateService } from './updater'
import log from 'electron-log'

// 配置 electron-log：日志写入文件
log.transports.file.level = 'info'
log.transports.console.level = 'info'
log.info('[App] 应用启动，日志路径:', log.transports.file.getFile().path)

/** 局域网更新服务实例 */
let lanUpdateService: LanUpdateService | null = null

/** 托盘服务实例 */
let trayService: TrayService | null = null

// 设置退出标志
;(app as any).isQuitting = false

app.whenReady().then(() => {
  // 设置应用用户模型 ID
  electronApp.setAppUserModelId('com.electron')

  // 监听窗口创建，自动设置快捷键
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 创建主窗口（悬浮球时钟）
  const mainFrame = windowFactory.createMainFrame()
  const mainWindow = mainFrame.getWindow()!

  // 初始化托盘服务（暂时传入 null，后面会设置更新服务）
  trayService = new TrayService(mainWindow, null)

  // 注册「点击更新按钮」的 IPC 处理
  ipcMain.on('update:start-download', (_event, version: string) => {
    log.info(`[App] 用户点击更新，版本: ${version}`)
    // TODO: 调用 LanUpdateService 开始下载
    if (lanUpdateService) {
      lanUpdateService.checkForUpdates()
    }
  })

  /**
   * 初始化局域网更新服务
   * @param testWindow - 弹窗窗口实例
   */
  const initLanUpdateService = (testWindow: BrowserWindow): void => {
    if (lanUpdateService) return
    lanUpdateService = new LanUpdateService(testWindow, {
      serverUrl: process.env.UPDATE_SERVER_URL || '\\\\10.15.8.28\\releases'
    })
    // 注册回调：发现新版本时显示更新弹窗
    lanUpdateService.onUpdateFound = (updateInfo) => {
      log.info(`[App] 发现新版本: ${updateInfo.version}，显示更新弹窗`)
      const testFrame = windowFactory.getTestFrame()
      testFrame.showPopup({ state: 'available', version: updateInfo.version })
    }
    // 注册回调：已是最新版时显示提示
    lanUpdateService.onUpdateLatest = () => {
      log.info('[App] 已是最新版本')
      const testFrame = windowFactory.getTestFrame()
      if (testFrame.isAlive()) {
        // 弹窗已在显示（checking 状态），更新为 latest 状态
        testFrame.updatePopup({ state: 'latest' })
      }
    }
    trayService?.setLanUpdateService(lanUpdateService)
    console.log('[App] 局域网更新服务已初始化')
  }

  // 应用启动 3 秒后静默检查更新（不弹窗，有新版本才弹）
  setTimeout(() => {
    // 创建弹窗窗口并初始化更新服务
    const testFrame = windowFactory.getTestFrame()
    let testWindow = testFrame.getWindow()
    if (!testWindow || testWindow.isDestroyed()) {
      testFrame.create()
      testWindow = testFrame.getWindow()
    }
    if (testWindow) {
      initLanUpdateService(testWindow)
    }

    // 静默检查更新：有新版本时由 onUpdateFound 回调触发弹窗
    if (lanUpdateService) {
      lanUpdateService.checkForUpdates()
    }
  }, 3000)

  // 应用激活时重新创建窗口（macOS）
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowFactory.createMainFrame()
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
  lanUpdateService?.destroy()
  app.quit()
})

// 应用退出前的清理
app.on('before-quit', () => {
  ;(app as any).isQuitting = true
  trayService?.destroy()
  lanUpdateService?.destroy()
})
