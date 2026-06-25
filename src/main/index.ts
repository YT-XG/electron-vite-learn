import { app, shell, BrowserWindow, ipcMain, clipboard, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let mainWindow: BrowserWindow | null = null
let lastClipboardText = ''

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 90,
    height: 90,
    show: false,
    resizable: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 监听剪贴板变化
function startClipboardWatcher(): void {
  lastClipboardText = clipboard.readText()
  setInterval(() => {
    const currentText = clipboard.readText()
    if (currentText && currentText !== lastClipboardText) {
      lastClipboardText = currentText
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('clipboard-changed', currentText)
      }
    }
  }, 1000)
}

// 关闭窗口
ipcMain.on('close-window', () => {
  if (mainWindow) {
    mainWindow.close()
  }
})

// 窗口拖拽定位（在主进程中计算，处理 DPI 缩放问题）
ipcMain.handle(
  'custom-adsorption',
  (_event, { mouseX, mouseY, offsetLeft, offsetTop, windowWidth, windowHeight }) => {
    if (!mainWindow || mainWindow.isDestroyed()) return

    // 获取鼠标所在屏幕的显示信息（正确处理 DPI 缩放）
    const display = screen.getDisplayNearestPoint({ x: mouseX, y: mouseY })
    const { workArea } = display

    // 计算目标位置：鼠标屏幕坐标 - 窗口内偏移量
    let targetX = mouseX - offsetLeft
    let targetY = mouseY - offsetTop

    // 限制在当前屏幕的工作区域内（排除任务栏）
    const maxX = workArea.x + workArea.width - windowWidth
    const maxY = workArea.y + workArea.height - windowHeight
    targetX = Math.max(workArea.x, Math.min(targetX, maxX))
    targetY = Math.max(workArea.y, Math.min(targetY, maxY))

    mainWindow.setPosition(targetX, targetY)
  }
)

// 获取窗口位置
ipcMain.handle('get-window-position', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow.getPosition()
  }
  return [0, 0]
})

// 调整窗口大小和位置
ipcMain.handle(
  'resize-window',
  (_event, { width, height, x, y }: { width: number; height: number; x?: number; y?: number }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setResizable(true)
      mainWindow.setSize(width, height)
      if (x !== undefined && y !== undefined) {
        // 限制在屏幕工作区域内
        const display = screen.getDisplayNearestPoint({ x, y })
        const { workArea } = display
        const safeX = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width))
        const safeY = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height))
        mainWindow.setPosition(safeX, safeY)
      }
      mainWindow.setResizable(false)
    }
  }
)

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  createWindow()
  startClipboardWatcher()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
