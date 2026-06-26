import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { windowFactory } from './frame'

app.whenReady().then(() => {
  // 设置应用用户模型 ID
  electronApp.setAppUserModelId('com.electron')

  // 监听窗口创建，自动设置快捷键
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 创建主窗口（悬浮球时钟）
  windowFactory.createMainFrame()

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
