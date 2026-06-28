import { app, BrowserWindow, clipboard } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { windowFactory } from './frame'
import { TrayService } from './trayService'
import log from 'electron-log'

// 配置 electron-log：日志写入文件
log.transports.file.level = 'info'
log.transports.console.level = 'info'
log.info('[App] 应用启动，日志路径:', log.transports.file.getFile().path)

/** 托盘服务实例 */
let trayService: TrayService | null = null

/** 剪贴板监控定时器 */
let clipboardTimer: ReturnType<typeof setInterval> | null = null

/** 上次剪贴板文本 */
let lastClipboardText = ''

// 设置退出标志
;(app as any).isQuitting = false

/**
 * 启动剪贴板监控
 * @description 每秒检查剪贴板变化，有新文字时通过 NoticeNewFrame 弹窗显示
 */
function startClipboardWatcher(): void {
  lastClipboardText = clipboard.readText()

  clipboardTimer = setInterval(() => {
    const currentText = clipboard.readText()
    if (currentText && currentText !== lastClipboardText) {
      lastClipboardText = currentText
      log.info('[Clipboard] 检测到新复制内容:', currentText.substring(0, 50))

      // 通过 NoticeNewFrame 弹窗显示
      const noticeFrame = windowFactory.getNoticeNewFrame()
      noticeFrame.setMsg(currentText)
      noticeFrame.showAtBottomCenter()
    }
  }, 1000)
}

/**
 * 停止剪贴板监控
 */
function stopClipboardWatcher(): void {
  if (clipboardTimer) {
    clearInterval(clipboardTimer)
    clipboardTimer = null
  }
}

app.whenReady().then(() => {
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

  // 启动剪贴板监控
  startClipboardWatcher()

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
  stopClipboardWatcher()
  trayService?.destroy()
})
