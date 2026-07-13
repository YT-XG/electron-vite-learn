/**
 * 设备选择弹窗
 * @description 点击通知的"分享"按钮时弹出，显示在线设备列表供用户选择
 *              选中设备后发送文本，弹窗由 PopupManager 管理槽位
 */
import { BrowserWindowConstructorOptions, BrowserWindow } from 'electron'
import BaseFrame from './BaseFrame'
import { textShareService } from '../service/textShareService'

export default class ShareSelectFrame extends BaseFrame {
  private static readonly POPUP_WIDTH = 380
  private static readonly POPUP_HEIGHT = 320

  /** 要分享的文本 */
  #shareText = ''

  /** 消息是否已发送 */
  #msgSent = false

  protected readonly options: BrowserWindowConstructorOptions = {
    width: ShareSelectFrame.POPUP_WIDTH,
    height: ShareSelectFrame.POPUP_HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
  }

  protected readonly routePath = '/shareSelect'

  /**
   * 设置要分享的文本
   * @param text - 文本内容
   */
  setShareText(text: string): void {
    this.#shareText = text
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

    // 渲染进程就绪，发送设备和文本信息
    this.recvOne('to-main-ShareSelectFrame:ready', () => {
      if (!this.isAlive()) return
      if (this.#msgSent) return
      this.#msgSent = true

      this.sendOne('to-renderer-ShareSelectFrame:show', {
        text: this.#shareText,
        devices: textShareService.getOnlineDevices()
      })
      this.sendOne('to-renderer-ShareSelectFrame:animate', { action: 'enter' })
    })

    // 用户选择了目标设备并确认发送
    this.recvTwo('to-main-ShareSelectFrame:sendText', async (_event, target: { name: string; address: string; port: number }) => {
      if (!this.isAlive()) return { success: false, error: '窗口已关闭' }

      try {
        // 确保 target 有完整的 DeviceInfo 结构
        const device = {
          name: target.name,
          address: target.address,
          port: target.port,
          version: '',
          offline: false
        }
        await textShareService.sendText(device, this.#shareText)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    })

    // 关闭弹窗
    this.recvOne('to-main-ShareSelectFrame:close', () => {
      this.destroy()
    })

    // 鼠标进入卡片区域：关闭鼠标穿透，允许按钮交互
    this.recvOne('to-main-ShareSelectFrame:mouse-enter-card', () => {
      if (this.isAlive()) {
        this.window!.setIgnoreMouseEvents(false)
      }
    })

    // 鼠标离开卡片区域：恢复鼠标穿透，透明区域可点击
    this.recvOne('to-main-ShareSelectFrame:mouse-leave-card', () => {
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
    this.#shareText = ''
    super.destroy()
  }
}
