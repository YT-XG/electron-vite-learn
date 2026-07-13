/**
 * 文本分享服务
 * @description 基于文件互传的设备发现能力，提供文本分享功能
 *              复用 fileTransferService 的设备列表和 HTTP Server
 *              发送文本到目标设备的 /share-text 端点
 *              接收文本后通过 PopupManager 显示持久通知
 */
import { clipboard, ipcMain } from 'electron'
import http from 'http'
import log from 'electron-log'
import { fileTransferService } from './fileTransferService'
import { popupManager } from '../frame/PopupManager'
import NoticeNewFrame from '../frame/NoticeNewFrame'
import { broadcast } from '../utils/platform'

// ── 类型 ──

interface DeviceInfo {
  name: string
  address: string
  port: number
  version: string
  offline?: boolean
}

interface ReceivedTextInfo {
  text: string
  senderName: string
  senderAddress: string
  timestamp: number
}

/** HTTP 请求超时（毫秒） */
const HTTP_TIMEOUT_MS = 3_000

/**
 * 文本分享服务
 * @description 单例服务，提供文本的发送和接收能力
 */
class TextShareService {
  /** 最近收到的文本列表（最多保留 20 条） */
  #receivedTexts: ReceivedTextInfo[] = []

  /** 当前活动的持久通知槽位索引（用于关闭） */
  #activeNoticeSlotIndex: number | null = null

  /**
   * 初始化：注册 IPC 处理器
   */
  init(): void {
    this.registerIPC()
    log.info('[TextShare] 服务初始化完成')
  }

  /**
   * 注册 IPC 通道
   */
  private registerIPC(): void {
    ipcMain.handle('to-service-TextShareService:getOnlineDevices', () => {
      return this.getOnlineDevices()
    })

    ipcMain.handle('to-service-TextShareService:sendText', async (_event, target: DeviceInfo, text: string) => {
      return this.sendText(target, text)
    })

    ipcMain.handle('to-service-TextShareService:getLastReceivedText', () => {
      return this.getLastReceivedText()
    })
  }

  /**
   * 获取在线设备列表
   * @description 从 fileTransferService 获取所有可见设备（过滤离线）
   * @returns 在线设备列表
   */
  getOnlineDevices(): DeviceInfo[] {
    const all = fileTransferService.getDevices()
    // 只返回在线设备
    return all.filter((d) => !d.offline)
  }

  /**
   * 发送文本到目标设备
   * @param target - 目标设备信息
   * @param text - 要发送的文本内容
   * @returns 是否发送成功
   */
  async sendText(target: DeviceInfo, text: string): Promise<boolean> {
    log.info('[TextShare] 开始发送文本到', target.address, '端口:', target.port)

    // 先 ping 验证在线
    const online = await this.#pingDevice(target)
    if (!online) {
      log.warn('[TextShare] 设备不在线或不可达:', target.address, target.port)
      throw new Error('设备不在线或不可达')
    }
    log.info('[TextShare] 设备在线，准备 POST /share-text')

    // POST /share-text
    try {
      const result = await this.#doPost(target, '/share-text', {
        text,
        senderName: fileTransferService.getDeviceName(),
        timestamp: Date.now()
      })
      if (result.ok !== true) {
        const errMsg = result.error || '对方返回异常'
        log.error('[TextShare] 发送文本失败:', errMsg, JSON.stringify(result))
        throw new Error(errMsg)
      }
      log.info('[TextShare] 发送文本成功:', target.address)
      return true
    } catch (err: any) {
      log.error('[TextShare] 发送文本失败:', err.message)
      throw new Error(`发送失败: ${err.message}`)
    }
  }

  /**
   * 接收文本（由 fileTransferService 的回调触发）
   * @param text - 收到的文本内容
   * @param senderName - 发送者名称
   * @param senderAddress - 发送者 IP
   */
  onReceiveText(text: string, senderName: string, senderAddress: string): void {
    const info: ReceivedTextInfo = {
      text,
      senderName,
      senderAddress,
      timestamp: Date.now()
    }
    log.info(`[TextShare] 收到文本: 来自 ${senderName}(${senderAddress}), 长度: ${text.length}`)

    // 存入列表
    this.#receivedTexts.unshift(info)
    if (this.#receivedTexts.length > 20) {
      this.#receivedTexts = this.#receivedTexts.slice(0, 20)
    }

    // 广播到所有可见窗口
    broadcast('broadcast:text-received', info)
    log.info('[TextShare] 已广播 text-received 事件')

    // 通过 PopupManager 显示持久通知
    this.#showReceivedTextNotification(info)
  }

  /**
   * 显示接收文本的持久通知
   * @param info - 收到的文本信息
   */
  #showReceivedTextNotification(info: ReceivedTextInfo): void {
    const displayText = `来自 ${info.senderName}:\n${info.text}`
    log.info('[TextShare] 准备创建接收通知弹窗')
    try {
      const popup = popupManager.showNotice(
        () => {
          log.info('[TextShare] 创建 NoticeNewFrame 窗口')
          const frame = new NoticeNewFrame()
          frame.setMsg({ data: displayText, isPersistent: true, showCopy: true, showCloseText: true })
          return frame.create()
        },
        { type: 'notice', width: 520, height: 80 },
        { text: displayText, duration: 0 }
      )
      log.info('[TextShare] 接收通知弹窗创建成功, slotIndex:', popup.slotIndex)
      // 记录槽位索引以便关闭
      this.#activeNoticeSlotIndex = popup.slotIndex
    } catch (err: any) {
      log.error('[TextShare] 创建接收通知弹窗失败:', err.message)
    }
  }

  /**
   * 获取最近收到的文本
   * @returns 最近收到的文本信息
   */
  getLastReceivedText(): ReceivedTextInfo | null {
    return this.#receivedTexts[0] || null
  }

  /**
   * 将文本写入系统剪贴板
   * @param text - 要复制的文本
   */
  copyTextToClipboard(text: string): void {
    clipboard.writeText(text)
  }

  /**
   * 关闭当前活动的接收文本通知
   */
  closeActiveReceivedNotice(): void {
    if (this.#activeNoticeSlotIndex !== null) {
      popupManager.destroySlotByIndex(this.#activeNoticeSlotIndex)
      this.#activeNoticeSlotIndex = null
    }
  }

  // ── HTTP 客户端辅助方法 ──

  /**
   * Ping 目标设备，检查是否在线
   * @param target - 目标设备
   * @returns 是否在线
   */
  #pingDevice(target: DeviceInfo): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`http://${target.address}:${target.port}/ping`, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            resolve(parsed.ok === true)
          } catch {
            resolve(false)
          }
        })
      })
      req.setTimeout(HTTP_TIMEOUT_MS, () => {
        req.destroy()
        resolve(false)
      })
      req.on('error', () => resolve(false))
    })
  }

  /**
   * 发送 HTTP POST 请求
   * @param target - 目标设备
   * @param path - 请求路径
   * @param body - 请求体（自动 JSON 序列化）
   * @returns 响应体（自动 JSON 解析）
   */
  #doPost(target: DeviceInfo, path: string, body: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify(body)
      const req = http.request({
        hostname: target.address,
        port: target.port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(bodyStr))
        }
      }, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => {
          try { resolve(JSON.parse(data)) }
          catch { resolve(data) }
        })
      })
      req.setTimeout(HTTP_TIMEOUT_MS, () => {
        req.destroy()
        reject(new Error('超时'))
      })
      req.on('error', reject)
      req.write(bodyStr)
      req.end()
    })
  }
}

// 导出单例
export const textShareService = new TextShareService()
