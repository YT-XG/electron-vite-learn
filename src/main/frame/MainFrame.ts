import { BrowserWindow, BrowserWindowConstructorOptions, clipboard, ipcMain, screen } from 'electron'
import BaseFrame from './BaseFrame'
import { windowFactory } from './index'

/**
 * 主窗口 - 悬浮球时钟
 * @description 负责显示悬浮球、剪贴板监控、窗口拖拽吸附
 */
export default class MainFrame extends BaseFrame {
  /** 上次剪贴板文本 */
  #lastClipboardText = ''

  /** 剪贴板监控定时器 */
  #clipboardTimer: ReturnType<typeof setInterval> | null = null

  /** 窗口配置 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: 90,
    height: 90,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false
  }

  /** 路由路径 */
  protected readonly routePath = '/'

  /**
   * 重写创建方法，添加剪贴板监控
   */
  create() {
    const window = super.create()
    window.removeAllListeners('ready-to-show')
    this.startClipboardWatcher()
    return window
  }

  /**
   * 注册 IPC 监听器
   * @description 处理窗口拖拽、吸附、调整大小等
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 窗口拖拽定位（处理 DPI 缩放问题，移动发送事件的窗口而非固定窗口）
    ipcMain.handle(
      'custom-adsorption',
      (event, { mouseX, mouseY, offsetLeft, offsetTop, windowWidth, windowHeight }) => {
        // 获取发送事件的窗口，避免多窗口共用频道时互相干扰
        const senderWindow = BrowserWindow.fromWebContents(event.sender)
        if (!senderWindow || senderWindow.isDestroyed()) return

        // 获取鼠标所在屏幕的显示信息
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

        senderWindow.setPosition(targetX, targetY)

        // 如果移动的是主窗口（悬浮球），同步更新弹窗位置
        if (this.isAlive() && senderWindow === this.window!) {
          const testFrame = windowFactory.getTestFrame()
          if (testFrame.isAlive()) {
            testFrame.positionAboveBall()
          }
          // 同步更新 OpenDialog 位置
          const openDialogFrame = windowFactory.getOpenDialogFrame()
          if (openDialogFrame.isAlive()) {
            openDialogFrame.positionAboveBall()
          }
        }
      }
    )

    // 获取窗口位置
    ipcMain.handle('get-window-position', () => {
      if (this.isAlive()) {
        return this.window!.getPosition()
      }
      return [0, 0]
    })

    // 更新弹窗跟随位置（拖拽悬浮球时，通知弹窗同步移动）
    ipcMain.on('update-popup:follow', () => {
      // 直接通知 TestFrame 重新定位
      const testFrame = windowFactory.getTestFrame()
      if (testFrame.isAlive()) {
        testFrame.positionAboveBall()
      }
      // 同步更新 OpenDialog 位置
      const openDialogFrame = windowFactory.getOpenDialogFrame()
      if (openDialogFrame.isAlive()) {
        openDialogFrame.positionAboveBall()
      }
    })

    // 调整窗口大小和位置
    ipcMain.handle(
      'resize-window',
      (_event, { width, height, x, y }: { width: number; height: number; x?: number; y?: number }) => {
        if (!this.isAlive()) return

        this.window!.setResizable(true)
        this.window!.setSize(width, height)

        if (x !== undefined && y !== undefined) {
          // 限制在屏幕工作区域内
          const display = screen.getDisplayNearestPoint({ x, y })
          const { workArea } = display
          const safeX = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width))
          const safeY = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height))
          this.window!.setPosition(safeX, safeY)
        }

        this.window!.setResizable(false)
      }
    )

    // 从通知窗口恢复为悬浮球：隐藏 → 缩小 → 定位（显示由 Home.vue 挂载后触发）
    ipcMain.handle('restore-ball', (_event, { x, y }: { x: number; y: number }) => {
      if (!this.isAlive()) return

      this.window!.hide()
      this.window!.setResizable(true)
      this.window!.setSize(90, 90)

      const display = screen.getDisplayNearestPoint({ x, y })
      const { workArea } = display
      const safeX = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - 90))
      const safeY = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - 90))
      this.window!.setPosition(safeX, safeY)

      this.window!.setResizable(false)
    })

    // 显示窗口（由渲染进程组件挂载后调用）
    ipcMain.on('window:show', () => {
      if (this.isAlive()) {
        this.window!.show()
      }
    })

    // 显示 OpenDialog（鼠标悬停在悬浮球上）
    ipcMain.on('open-dialog:show', () => {
      const openDialogFrame = windowFactory.getOpenDialogFrame()
      openDialogFrame.setMouseOnBall(true)
      openDialogFrame.showPopup()
    })

    // 隐藏 OpenDialog（鼠标离开悬浮球，延迟隐藏）
    ipcMain.on('open-dialog:hide', () => {
      const openDialogFrame = windowFactory.getOpenDialogFrame()
      openDialogFrame.setMouseOnBall(false)
      openDialogFrame.hideWithDelay()
    })
  }

  /**
   * 启动剪贴板监控
   * @description 每秒检查一次剪贴板变化，有变化时通知渲染进程
   */
  startClipboardWatcher(): void {
    this.#lastClipboardText = clipboard.readText()

    this.#clipboardTimer = setInterval(() => {
      const currentText = clipboard.readText()
      if (currentText && currentText !== this.#lastClipboardText) {
        this.#lastClipboardText = currentText
        this.send('clipboard-changed', currentText)
      }
    }, 1000)
  }

  /**
   * 停止剪贴板监控
   */
  stopClipboardWatcher(): void {
    if (this.#clipboardTimer) {
      clearInterval(this.#clipboardTimer)
      this.#clipboardTimer = null
    }
  }

  /**
   * 销毁窗口前的清理
   */
  destroy(): void {
    this.stopClipboardWatcher()
    super.destroy()
  }
}
