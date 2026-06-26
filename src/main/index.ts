import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { windowFactory } from './frame'
import { UpdateService } from './updateService'

/** 更新服务实例 */
let updateService: UpdateService | null = null

app.whenReady().then(() => {
  // 设置应用用户模型 ID
  electronApp.setAppUserModelId('com.electron')

  // 监听窗口创建，自动设置快捷键
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 创建主窗口（悬浮球时钟）
  const mainFrame = windowFactory.createMainFrame()

  // 初始化更新服务
  updateService = new UpdateService(mainFrame.getWindow()!)

  // 应用启动 3 秒后检查更新（避免影响启动速度）
  setTimeout(() => {
    updateService?.checkForUpdates()
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
  windowFactory.closeAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
