/**
 * 文件传输确认弹窗
 * @description 收到传输请求时显示，底部弹出，槽位和动画由 PopupManager 统一管理
 *              显示发送方信息、文件列表、保存目录选择，提供拒绝/接受按钮
 */
import { BrowserWindowConstructorOptions, BrowserWindow } from 'electron'
import BaseFrame from './BaseFrame'
import type { TransferRequestInfo } from '../service/fileTransferService'

/** 重新导出类型以解耦 */
export type { TransferRequestInfo }

export default class TransferConfirmFrame extends BaseFrame {
  private static readonly POPUP_WIDTH = 420
  private static readonly POPUP_HEIGHT = 300

  #requestInfo: TransferRequestInfo | null = null
  #msgSent = false

  protected readonly options: BrowserWindowConstructorOptions = {
    width: TransferConfirmFrame.POPUP_WIDTH,
    height: TransferConfirmFrame.POPUP_HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false
  }

  protected readonly routePath = '/transferConfirm'

  setRequestInfo(info: TransferRequestInfo): void {
    this.#requestInfo = info
  }

  protected registerIPC(): void {
    super.registerIPC()

    this.recvOne('to-main-TransferConfirmFrame:ready', () => {
      if (!this.#msgSent && this.#requestInfo) {
        this.sendOne('to-renderer-TransferConfirm:show', this.#requestInfo)
        this.#msgSent = true
      }
    })

    this.recvOne('to-main-TransferConfirmFrame:mouse-enter-card', () => {
      if (this.isAlive()) this.window!.setIgnoreMouseEvents(false)
    })

    this.recvOne('to-main-TransferConfirmFrame:mouse-leave-card', () => {
      if (this.isAlive()) this.window!.setIgnoreMouseEvents(true, { forward: true })
    })

    this.recvOne('to-main-TransferConfirmFrame:respond', async (_event, requestId: string, action: 'accept' | 'reject', saveDir?: string) => {
      // 转发到主进程 fileTransferService 处理
      // 直接调用 respondToRequest（在同一进程内无需 IPC）
      const { fileTransferService } = require('../service/fileTransferService')
      await fileTransferService.respondToRequest(requestId, action, saveDir || '')

      // 播放退场动画后销毁
      this.sendOne('to-renderer-TransferConfirm:animate', { action: 'exit' })
      setTimeout(() => {
        const { popupManager } = require('./PopupManager')
        popupManager.destroyPermissionNotice()
      }, 350)
    })

    // 渲染进程请求销毁窗口（退场动画完成后）
    this.recvOne('to-main-TransferConfirmFrame:destroy', () => {
      this.destroy()
    })
  }

  create(): BrowserWindow {
    const win = super.create()
    win.setIgnoreMouseEvents(true, { forward: true })
    return win
  }

  destroy(): void {
    this.#msgSent = false
    this.#requestInfo = null
    super.destroy()
  }
}
