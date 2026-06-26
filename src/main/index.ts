import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { windowFactory } from './frame'
import { TrayService } from './trayService'
import AppUpdater from './updater/AppUpdater'

/** 更新服务实例 */
let appUpdater: AppUpdater | null = null

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

  // 初始化托盘服务（暂时传入 null，后面会设置 appUpdater）
  trayService = new TrayService(mainWindow, null as any)

  // 应用启动 3 秒后启动检查更新窗口
  setTimeout(() => {
    // 创建检查更新窗口（TestFrame）
    const testFrame = windowFactory.getTestFrame()
    testFrame.create()
    const testWindow = testFrame.getWindow()

    if (testWindow) {
      // 初始化自定义更新服务，绑定到检查更新窗口
      appUpdater = new AppUpdater(testWindow)

      // 设置托盘服务的更新服务引用
      trayService?.setAppUpdater(appUpdater)

      // 检查更新窗口准备好后，开始检查更新
      testWindow.webContents.on('did-finish-load', () => {
        console.log('检查更新窗口加载完成，开始检查更新...')
        appUpdater?.checkForUpdates()
      })
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
  app.quit()
})

// 应用退出前的清理
app.on('before-quit', () => {
  ;(app as any).isQuitting = true
  trayService?.destroy()
})
