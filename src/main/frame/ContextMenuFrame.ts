import { BrowserWindowConstructorOptions, ipcMain, screen, BrowserWindow } from 'electron'
import BaseFrame from './BaseFrame'
import { windowFactory } from './WindowFactory'

/**
 * 右键菜单窗口
 * @description 透明无边框小窗口，用于显示 Markdown 编辑器的右键菜单
 *              支持动态大小、失去焦点后自动关闭、菜单项点击回调
 */
export default class ContextMenuFrame extends BaseFrame {
  /** 菜单宽度 */
  static readonly MENU_WIDTH = 190

  /** 菜单项高度（padding 7+7 + 字体 13 + 余量 ≈ 30） */
  static readonly ITEM_HEIGHT = 30

  /** 分隔线高度（height 1 + margin 4+4 = 9） */
  static readonly SEPARATOR_HEIGHT = 9

  /** 菜单内边距 */
  static readonly PADDING = 6

  /** 窗口配置 - 透明无边框，小窗口 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: ContextMenuFrame.MENU_WIDTH + ContextMenuFrame.PADDING * 2,
    height: 100, // 初始高度，会被动态调整
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    show: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true
  }

  /** 路由路径 */
  protected readonly routePath: string = '/contextMenu'

  /** 是否已注册 IPC */
  static #ipcRegistered = false

  /**
   * 显示右键菜单
   * @param x - 鼠标 X 坐标（屏幕坐标）
   * @param y - 鼠标 Y 坐标（屏幕坐标）
   * @param items - 菜单项列表
   */
  showMenu(x: number, y: number, items: Array<{
    icon: string
    label: string
    shortcut?: string
    separator?: boolean
    action?: string
  }>): void {
    // 计算菜单高度
    const itemCount = items.filter(item => !item.separator).length
    const separatorCount = items.filter(item => item.separator).length
    // 最后一个分隔线会被 CSS 隐藏，所以实际显示的分隔线数量减 1（如果有分隔线的话）
    const visibleSeparatorCount = separatorCount > 0 ? separatorCount - 1 : 0
    const menuHeight = ContextMenuFrame.PADDING * 2 +
      itemCount * ContextMenuFrame.ITEM_HEIGHT +
      visibleSeparatorCount * ContextMenuFrame.SEPARATOR_HEIGHT +
      8 // 额外余量，确保内容不被截断

    // 获取屏幕工作区
    const display = screen.getDisplayMatching({ x, y, width: 1, height: 1 })
    const { workArea } = display

    // 调整位置，确保菜单不超出屏幕
    let menuX = x
    let menuY = y

    // 右侧超出
    if (x + ContextMenuFrame.MENU_WIDTH + ContextMenuFrame.PADDING * 2 > workArea.x + workArea.width) {
      menuX = x - ContextMenuFrame.MENU_WIDTH - ContextMenuFrame.PADDING * 2
    }

    // 下方超出
    if (y + menuHeight > workArea.y + workArea.height) {
      menuY = y - menuHeight
    }

    // 左侧超出
    if (menuX < workArea.x) {
      menuX = workArea.x
    }

    // 上方超出
    if (menuY < workArea.y) {
      menuY = workArea.y
    }

    // 创建窗口（如果不存在）
    if (!this.isAlive()) {
      this.create()
    }

    // 设置位置
    this.window!.setPosition(Math.round(menuX), Math.round(menuY))

    // 等待渲染进程准备好后再发送数据并显示
    const showWindow = (): void => {
      // 发送菜单数据和可用高度到渲染进程，让渲染进程计算实际高度
      this.sendOne('to-renderer-ContextMenu:show', items, workArea.height - menuY)
      // 先设置一个较大的高度，等渲染进程计算好后会调整
      this.window!.setSize(
        ContextMenuFrame.MENU_WIDTH + ContextMenuFrame.PADDING * 2,
        Math.min(menuHeight + 50, workArea.height - menuY)
      )
      // 显示窗口并获取焦点
      this.window!.show()
      this.window!.focus()
    }

    // 如果窗口已经准备好，直接显示；否则等待 ready-to-show
    if (this.window!.webContents.isLoading()) {
      this.window!.once('ready-to-show', showWindow)
    } else {
      showWindow()
    }
  }

  /**
   * 隐藏菜单
   */
  hideMenu(): void {
    if (this.isAlive()) {
      this.window!.hide()
    }
  }

  /**
   * 注册 IPC 监听器
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 只注册一次 IPC
    if (ContextMenuFrame.#ipcRegistered) {
      return
    }

    // 菜单项被点击
    ipcMain.on('to-main-ContextMenu:click', (_event, action: string) => {
      // 隐藏菜单
      this.hideMenu()

      // 通过 BroadcastChannel 广播到所有窗口
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed() && win.webContents) {
          win.webContents.send('broadcast:context-menu-action', action)
        }
      })

      // 将焦点返回到 Markdown 预览窗口
      const mdFrame = windowFactory.getMarkdownPreviewFrame()
      if (mdFrame.isAlive()) {
        mdFrame.getWindow()?.focus()
      }
    })

    // 关闭菜单（点击其他区域）
    ipcMain.on('to-main-ContextMenu:close', () => {
      this.hideMenu()
    })

    // 渲染进程报告实际内容高度，调整窗口大小
    ipcMain.on('to-main-ContextMenu:resize', (_event, height: number) => {
      if (this.isAlive()) {
        const width = ContextMenuFrame.MENU_WIDTH + ContextMenuFrame.PADDING * 2
        this.window!.setSize(width, Math.round(height))
      }
    })

    ContextMenuFrame.#ipcRegistered = true
  }

  /**
   * 创建窗口后注册 blur 事件监听
   */
  create(autoShow = false): BrowserWindow {
    const win = super.create(autoShow)

    // 监听窗口失去焦点事件，自动隐藏菜单
    win.on('blur', () => {
      this.hideMenu()
    })

    return win
  }
}
