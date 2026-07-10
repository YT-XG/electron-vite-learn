/**
 * 文件快捷分享弹窗
 * @description 文件资源管理器右键"分享到妙妙屋"时弹出
 *              显示在线设备列表和待发送文件，选择设备后调用 fileTransferService 发送
 */
import { BrowserWindowConstructorOptions, BrowserWindow } from 'electron'
import BaseFrame from './BaseFrame'
import { fileTransferService } from '../service/fileTransferService'

interface FileEntry {
  name: string
  path: string
  size: number
}

interface DeviceInfo {
  name: string
  address: string
  port: number
  version: string
  offline?: boolean
}

export default class QuickShareFrame extends BaseFrame {
  private static readonly POPUP_WIDTH = 420
  private static readonly POPUP_HEIGHT = 380

  /** 要分享的文件列表 */
  #files: FileEntry[] = []

  /** 消息是否已发送 */
  #msgSent = false

  protected readonly options: BrowserWindowConstructorOptions = {
    width: QuickShareFrame.POPUP_WIDTH,
    height: QuickShareFrame.POPUP_HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false
  }

  protected readonly routePath = '/quickShare'

  /**
   * 设置要分享的文件
   * @param files - 文件列表
   */
  setFiles(files: FileEntry[]): void {
    this.#files = files
  }

  /**
   * 居中显示弹窗
   * @description 只设置位置和尺寸，不显示窗口。
   *              由渲染进程就绪后发送 animate('enter') 触发 CSS 入场动画
   */
  showCentered(): void {
    if (!this.isAlive()) return
    const { screen } = require('electron')
    const display = screen.getPrimaryDisplay()
    const { width: sw, height: sh } = display.workArea
    const fw = QuickShareFrame.POPUP_WIDTH
    const fh = QuickShareFrame.POPUP_HEIGHT
    const win = this['window'] as unknown as BrowserWindow
    if (win) {
      win.setBounds({
        x: Math.round((sw - fw) / 2),
        y: Math.round((sh - fh) / 2),
        width: fw,
        height: fh
      })
      // 不调用 showInactive，由渲染进程 ready 后通过 animate 触发入场
    }
  }

  /**
   * 创建窗口
   */
  create(): BrowserWindow {
    this.#msgSent = false
    const win = super.create()
    win.setIgnoreMouseEvents(true, { forward: true })
    return win
  }

  /**
   * 注册 IPC 监听器
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 渲染进程就绪，发送设备和文件信息
    this.recvOne('to-main-QuickShareFrame:ready', () => {
      if (!this.isAlive()) return
      if (this.#msgSent) return
      this.#msgSent = true

      // 先显示窗口，再发数据，animate IPC 在渲染进程用双 rAF 延迟到第二帧
      if (this.isAlive() && this.window && !this.window.isDestroyed()) {
        this.window.showInactive()
      }
      this.sendOne('to-renderer-QuickShareFrame:show', {
        files: this.#files,
        devices: fileTransferService.getDevices().filter((d: DeviceInfo) => !d.offline)
      })
      this.sendOne('to-renderer-QuickShareFrame:animate', { action: 'enter' })
    })

    // 用户选择了目标设备并确认发送
    this.recvOne('to-main-QuickShareFrame:sendFiles', async (_event, target: { name: string; address: string; port: number }) => {
      if (!this.isAlive()) return

      try {
        const device: DeviceInfo = {
          name: target.name,
          address: target.address,
          port: target.port,
          version: '',
          offline: false
        }
        await fileTransferService.sendRequest(device, this.#files)
        // 发送成功通知
        this.sendOne('to-renderer-QuickShareFrame:sendResult', { success: true })
      } catch (err: any) {
        this.sendOne('to-renderer-QuickShareFrame:sendResult', { success: false, error: err.message })
      }
    })

    // 关闭弹窗
    this.recvOne('to-main-QuickShareFrame:close', () => {
      this.destroy()
    })

    // 鼠标进入卡片区域：关闭鼠标穿透
    this.recvOne('to-main-QuickShareFrame:mouse-enter-card', () => {
      if (this.isAlive()) {
        this.window!.setIgnoreMouseEvents(false)
      }
    })

    // 鼠标离开卡片区域：恢复鼠标穿透
    this.recvOne('to-main-QuickShareFrame:mouse-leave-card', () => {
      if (this.isAlive()) {
        this.window!.setIgnoreMouseEvents(true, { forward: true })
      }
    })
  }

  /**
   * 销毁窗口（重置状态）
   */
  destroy(): void {
    this.#msgSent = false
    this.#files = []
    super.destroy()
  }
}
