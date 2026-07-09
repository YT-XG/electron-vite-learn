/**
 * 局域网文件互传服务
 * @description 管理 HTTP Server、mDNS 设备发现、传输任务调度
 *
 * 架构：
 * - HTTP Server（随机端口）处理传输请求和文件上传
 * - mDNS 广播宣告本机在线 + 扫描发现局域网设备
 * - 传输任务在内存中管理（首版不持久化）
 * - PopupManager 显示接收确认弹窗
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import http from 'http'
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from 'fs'
import { basename, join } from 'path'
import { networkInterfaces, hostname } from 'os'
import log from 'electron-log'
import { popupManager } from '../frame'
import { settingsService } from './settingsService'

// ── 类型（内部使用，外部从 preload/index.d.ts 引用） ──

interface DeviceInfo {
  name: string
  address: string
  port: number
  version: string
}

interface FileEntry {
  name: string
  path: string
  size: number
}

interface TransferRecord {
  id: string
  direction: 'sent' | 'received'
  peerName: string
  peerAddress: string
  files: { name: string; size: number }[]
  totalBytes: number
  transferredBytes: number
  status: 'pending' | 'transferring' | 'completed' | 'rejected' | 'failed'
  errorMessage?: string
  createdAt: number
  completedAt?: number
}

interface TransferRequestInfo {
  requestId: string
  senderName: string
  senderAddress: string
  files: { name: string; size: number }[]
  totalSize: number
}

/** 重新导出给 TransferConfirmFrame 使用 */
export type { TransferRequestInfo }

/** 暂存的传输请求元数据 */
interface PendingRequest {
  requestId: string
  senderAddress: string
  files: { name: string; size: number }[]
  senderName: string
  status: 'pending' | 'accepted' | 'rejected' | 'timeout'
  saveDir?: string
  timer: ReturnType<typeof setTimeout>
  createdAt: number
}

// ── 常量 ──

/** mDNS 扫描间隔（毫秒） */
const SCAN_INTERVAL_MS = 10_000

/** 设备离线判定：连续未响应次数 */
const OFFLINE_THRESHOLD = 3

/** HTTP 请求超时（毫秒） */
const HTTP_TIMEOUT_MS = 3_000

/** 等待接受超时（毫秒） */
const ACCEPT_TIMEOUT_MS = 60_000

/** 服务类型 */
const MDNS_SERVICE_TYPE = '_prism-xfer._tcp.local'

/** TCP 发现服务固定端口 */
const DISCOVERY_PORT = 17_862

/** TCP 发现端口绑定重试次数 */
const MAX_DISCOVERY_PORT_ATTEMPTS = 3

/** 子网 TCP 扫描间隔（毫秒） */
const SUBNET_SCAN_INTERVAL_MS = 60_000

/** 子网扫描并发数 */
const SCAN_CONCURRENCY = 20

/** 探针 TCP 超时（毫秒） */
const PROBE_TIMEOUT_MS = 2_000

/** 局域网 IP 段 */
const LAN_RANGES = [
  { start: ipToInt('192.168.0.0'), end: ipToInt('192.168.255.255') },
  { start: ipToInt('10.0.0.0'), end: ipToInt('10.255.255.255') },
  { start: ipToInt('172.16.0.0'), end: ipToInt('172.31.255.255') }
]

// ── 工具函数 ──

/** IP 字符串转整数 */
function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
}

/** 整数转 IP 字符串 */
function intToIP(num: number): string {
  return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join('.')
}

/**
 * CIDR 转 IP 范围
 * @returns { start, end } 整数形式的起始/结束 IP（不含网络地址和广播地址）
 */
function cidrToRange(cidr: string): { start: number; end: number } | null {
  const parts = cidr.split('/')
  if (parts.length !== 2) return null
  const ip = ipToInt(parts[0])
  const bits = parseInt(parts[1], 10)
  if (isNaN(bits) || bits < 0 || bits > 32) return null
  const mask = bits === 0 ? 0 : ~(2 ** (32 - bits) - 1) >>> 0
  const network = (ip & mask) >>> 0
  const hostCount = 2 ** (32 - bits)
  if (hostCount <= 2) return { start: network, end: network }
  return { start: network + 1, end: network + hostCount - 2 }
}

/** 判断 IP 是否为局域网地址 */
function isLANIP(ip: string): boolean {
  const num = ipToInt(ip)
  return LAN_RANGES.some(({ start, end }) => num >= start && num <= end)
}

/** 生成简单 UUID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 获取本机局域网 IPv4 地址列表 */
function getLocalIPs(): string[] {
  const interfaces = networkInterfaces()
  const ips: string[] = []
  for (const [, netList] of Object.entries(interfaces)) {
    if (!netList) continue
    for (const net of netList) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address)
      }
    }
  }
  return ips
}

/** 清理文件名中的非法字符 */
function sanitizeFileName(name: string): string {
  if (process.platform === 'win32') {
    return name.replace(/[<>:"/\\|?*]/g, '_')
  }
  return name.replace(/:/g, '_')
}

/** 避免文件名冲突：追加 (1)、(2)... */
function resolveFileNameConflict(dir: string, name: string): string {
  let result = join(dir, name)
  if (!existsSync(result)) return result
  const ext = name.includes('.') ? '.' + name.split('.').pop()! : ''
  const base = ext ? name.slice(0, -ext.length) : name
  let counter = 1
  while (existsSync(result)) {
    result = join(dir, `${base} (${counter})${ext}`)
    counter++
  }
  return result
}


class FileTransferService {
  private server: http.Server | null = null
  private port = 0
  private devices: Map<string, DeviceInfo & { lastSeen: number; missCount: number }> = new Map()
  private records: TransferRecord[] = []
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private scanTimer: ReturnType<typeof setInterval> | null = null
  private mdnsAdvertiser: any = null
  private mdnsBrowser: any = null
  private multicastDNS: any = null

  /** TCP 发现服务器（固定端口，用于跨子网发现） */
  private discoveryServer: http.Server | null = null
  /** 实际绑定的发现端口 */
  private discoveryPort = 0
  /** TCP 扫描到的设备（key: address:port） */
  private scannedDevices: Map<string, DeviceInfo & { lastSeen: number }> = new Map()
  /** 子网扫描定时器 */
  private subnetScanTimer: ReturnType<typeof setInterval> | null = null
  /** 是否正在扫描 */
  private isScanning = false

  async init(): Promise<void> {
    // 动态加载 multicast-dns（CJS 模块，避免 import 加载时阻塞）
    this.multicastDNS = require('multicast-dns')
    await this.startServer()
    this.startMDNS()
    this.startScanning()
    await this.startDiscoveryServer()
    this.startSubnetScanner()
    this.registerIPC()
    log.info('[FileTransfer] 服务初始化完成，端口:', this.port)
  }

  destroy(): void {
    this.stopScanning()
    this.stopMDNS()
    this.stopServer()
    this.stopSubnetScanner()
    this.stopDiscoveryServer()
    log.info('[FileTransfer] 服务已停止')
  }

  // ── IPC 注册 ──

  private registerIPC(): void {
    ipcMain.handle('to-service-FileTransferService:getDevices', () => {
      return this.getDevices()
    })

    ipcMain.handle('to-service-FileTransferService:sendRequest', (_event, target: DeviceInfo, files: FileEntry[]) => {
      return this.sendRequest(target, files)
    })

    ipcMain.handle('to-service-FileTransferService:respondToRequest', (_event, requestId: string, action: 'accept' | 'reject', saveDir: string) => {
      return this.respondToRequest(requestId, action, saveDir)
    })

    ipcMain.handle('to-service-FileTransferService:getRecords', () => {
      return this.getRecords()
    })

    ipcMain.handle('to-service-FileTransferService:pickFiles', async () => {
      return this.pickFiles()
    })

    ipcMain.handle('to-service-FileTransferService:cancelTransfer', (_event, recordId: string) => {
      this.cancelTransfer(recordId)
    })

    ipcMain.handle('to-service-FileTransferService:getServerInfo', () => {
      return {
        name: this.getDeviceName(),
        address: getLocalIPs()[0] || '127.0.0.1',
        port: this.port
      }
    })

    ipcMain.handle('to-service-FileTransferService:pickDirectory', async () => {
      return this.pickDirectory()
    })

    /** 获取当前扫描网段配置 */
    ipcMain.handle('to-service-FileTransferService:getScanSubnets', () => {
      return this.getScanSubnets()
    })

    /** 保存扫描网段配置 */
    ipcMain.handle('to-service-FileTransferService:setScanSubnets', (_event, subnets: string[]) => {
      settingsService.update({ scanSubnets: subnets })
      return { ok: true }
    })

    /** 手动添加设备（IP + 端口） */
    ipcMain.handle('to-service-FileTransferService:addDevice', (_event, address: string, port: number) => {
      return this.addScannedDevice(address, port)
    })
  }

  // ── 设备管理 ──

  getDevices(): DeviceInfo[] {
    // 合并 mDNS 发现的设备
    const mdnsDevices = Array.from(this.devices.values())
      .filter((d) => d.missCount < OFFLINE_THRESHOLD)
      .map(({ name, address, port, version }) => ({ name, address, port, version }))

    // 合并 TCP 扫描发现的设备（去重：优先保留 mDNS 结果，因其信息更完整）
    const existingKeys = new Set(mdnsDevices.map((d) => `${d.address}:${d.port}`))
    for (const [, scanned] of this.scannedDevices) {
      const key = `${scanned.address}:${scanned.port}`
      if (!existingKeys.has(key)) {
        mdnsDevices.push({
          name: scanned.name,
          address: scanned.address,
          port: scanned.port,
          version: scanned.version
        })
      }
    }

    return mdnsDevices
  }

  getDeviceName(): string {
    return settingsService.getAll().transferDeviceName || hostname()
  }

  getRecords(): TransferRecord[] {
    return this.records.slice().sort((a, b) => b.createdAt - a.createdAt)
  }

  // ── HTTP Server ──

  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tryPort = (attempt: number): void => {
        if (attempt > 3) {
          reject(new Error('无法分配端口，已重试 3 次'))
          return
        }
        this.server = http.createServer((req, res) => {
          this.handleRequest(req, res)
        })
        // 随机端口 1024-65535，0 让系统自动分配
        const port = attempt === 0 ? 0 : 1024 + Math.floor(Math.random() * 64511)
        this.server!.listen(port, '0.0.0.0', () => {
          const addr = this.server!.address()
          this.port = typeof addr === 'object' ? addr!.port : port
          log.info('[FileTransfer] HTTP Server 启动，端口:', this.port)
          resolve()
        })
        this.server!.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            log.warn('[FileTransfer] 端口占用，重试:', port)
            tryPort(attempt + 1)
          } else {
            reject(err)
          }
        })
      }
      tryPort(0)
    })
  }

  private stopServer(): void {
    if (this.server) {
      this.server.close()
      this.server = null
      log.info('[FileTransfer] HTTP Server 已停止')
    }
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // 安全校验：仅接受局域网 IP
    const clientIP = (req.socket.remoteAddress || '').replace(/^::ffff:/, '')
    if (!isLANIP(clientIP) && clientIP !== '127.0.0.1' && clientIP !== '::1') {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    const url = new URL(req.url || '/', `http://localhost:${this.port}`)
    const path = url.pathname

    try {
      // GET /ping
      if (req.method === 'GET' && path === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, name: this.getDeviceName(), version: app.getVersion() }))
        return
      }

      // POST /request
      if (req.method === 'POST' && path === '/request') {
        this.handleTransferRequest(req, res, clientIP)
        return
      }

      // POST /respond
      if (req.method === 'POST' && path === '/respond') {
        this.handleRespond(req, res)
        return
      }

      // GET /status/:requestId
      if (req.method === 'GET' && path.startsWith('/status/')) {
        this.handleStatus(req, res, path)
        return
      }

      // POST /upload/:requestId/:index
      if (req.method === 'POST' && path.startsWith('/upload/')) {
        this.handleUpload(req, res, path)
        return
      }

      res.writeHead(404)
      res.end('Not Found')
    } catch (err) {
      log.error('[FileTransfer] 请求处理错误:', err)
      res.writeHead(500)
      res.end('Internal Server Error')
    }
  }

  // ── 传输请求处理 ──

  private handleTransferRequest(req: http.IncomingMessage, res: http.ServerResponse, clientIP: string): void {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
      if (body.length > 100_000) {
        res.writeHead(413)
        res.end('Payload too large')
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        if (!data.files || !Array.isArray(data.files) || !data.senderName) {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'Invalid request format' }))
          return
        }
        const requestId = generateId()
        const totalSize = data.files.reduce((sum: number, f: any) => sum + (f.size || 0), 0)

        // 暂存请求
        const pending: PendingRequest = {
          requestId,
          senderAddress: clientIP,
          senderName: data.senderName,
          files: data.files,
          status: 'pending',
          timer: setTimeout(() => {
            if (this.pendingRequests.get(requestId)?.status === 'pending') {
              this.pendingRequests.get(requestId)!.status = 'timeout'
              this.pendingRequests.delete(requestId)
            }
          }, ACCEPT_TIMEOUT_MS),
          createdAt: Date.now()
        }
        this.pendingRequests.set(requestId, pending)

        // 弹出确认弹窗
        const info: TransferRequestInfo = {
          requestId,
          senderName: data.senderName,
          senderAddress: clientIP,
          files: data.files,
          totalSize
        }
        this.showConfirmPopup(info)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ requestId }))
      } catch {
        res.writeHead(400)
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
  }

  private handleRespond(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => {
      try {
        const { requestId, action, saveDir } = JSON.parse(body)
        const pending = this.pendingRequests.get(requestId)
        if (!pending) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: 'Request not found' }))
          return
        }
        clearTimeout(pending.timer)
        if (action === 'accept') {
          pending.status = 'accepted'
          pending.saveDir = saveDir || this.getSaveDir()
          // 创建接收记录
          this.records.push({
            id: generateId(),
            direction: 'received',
            peerName: pending.senderName,
            peerAddress: pending.senderAddress,
            files: pending.files,
            totalBytes: pending.files.reduce((s, f) => s + f.size, 0),
            transferredBytes: 0,
            status: 'transferring',
            createdAt: Date.now()
          })
          this.broadcast('broadcast:transfer-records-updated', this.getRecords())
        } else {
          pending.status = 'rejected'
          this.pendingRequests.delete(requestId)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch {
        res.writeHead(400)
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
  }

  private handleStatus(_req: http.IncomingMessage, res: http.ServerResponse, path: string): void {
    const requestId = path.split('/').pop()!
    const pending = this.pendingRequests.get(requestId)
    if (!pending) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'timeout' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: pending.status }))
  }

  // ── 文件上传处理 ──

  private handleUpload(req: http.IncomingMessage, res: http.ServerResponse, path: string): void {
    const parts = path.split('/')
    const requestId = parts[2]
    const fileIndex = parseInt(parts[3], 10)
    const fileName = sanitizeFileName(req.headers['x-file-name'] as string || `file_${fileIndex}`)

    const pending = this.pendingRequests.get(requestId)
    if (!pending || pending.status !== 'accepted') {
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'Request not accepted' }))
      return
    }

    const saveDir = pending.saveDir || this.getSaveDir()
    if (!existsSync(saveDir)) {
      mkdirSync(saveDir, { recursive: true })
    }
    const savePath = resolveFileNameConflict(saveDir, fileName)
    const writeStream = createWriteStream(savePath)

    // 查找或创建接收记录
    const record = this.records.find((r) =>
      r.direction === 'received' && r.peerAddress === pending!.senderAddress && r.status === 'transferring'
    )

    req.on('data', (chunk: Buffer) => {
      const canContinue = writeStream.write(chunk)
      if (!canContinue) {
        req.pause()
        writeStream.once('drain', () => req.resume())
      }
      // 更新记录进度
      if (record) {
        record.transferredBytes += chunk.length
        this.broadcast('broadcast:transfer-records-updated', this.getRecords())
      }
    })

    req.on('end', () => {
      writeStream.end()
      // 记录完成
      if (record && record.transferredBytes >= record.totalBytes) {
        record.status = 'completed'
        record.completedAt = Date.now()
        this.broadcast('broadcast:transfer-records-updated', this.getRecords())
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    })

    req.on('error', () => {
      writeStream.end()
      if (record) {
        record.status = 'failed'
        record.errorMessage = '传输中断'
        this.broadcast('broadcast:transfer-records-updated', this.getRecords())
      }
    })
  }

  // ── 发送方逻辑 ──

  async sendRequest(target: DeviceInfo, files: FileEntry[]): Promise<string> {
    // 先 ping 验证在线
    const online = await this.pingDevice(target)
    if (!online) throw new Error('设备不在线或不可达')

    // 发起请求
    const response = await this.doPost(target, '/request', {
      files: files.map((f) => ({ name: f.name, size: f.size })),
      senderName: this.getDeviceName()
    })
    const requestId = response.requestId

    // 创建发送记录
    const totalBytes = files.reduce((s, f) => s + f.size, 0)
    const record: TransferRecord = {
      id: generateId(),
      direction: 'sent',
      peerName: target.name,
      peerAddress: target.address,
      files: files.map((f) => ({ name: f.name, size: f.size })),
      totalBytes,
      transferredBytes: 0,
      status: 'pending',
      createdAt: Date.now()
    }
    this.records.push(record)
    this.broadcast('broadcast:transfer-records-updated', this.getRecords())

    // 轮询等待接受
    const accepted = await this.pollStatus(target, requestId)
    if (!accepted) {
      record.status = 'rejected'
      this.broadcast('broadcast:transfer-records-updated', this.getRecords())
      return requestId
    }

    // 逐个上传文件
    record.status = 'transferring'
    this.broadcast('broadcast:transfer-records-updated', this.getRecords())

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      await this.uploadFile(target, requestId, i, file)
      record.transferredBytes += file.size
      this.broadcast('broadcast:transfer-records-updated', this.getRecords())
    }

    record.status = 'completed'
    record.completedAt = Date.now()
    this.broadcast('broadcast:transfer-records-updated', this.getRecords())

    return requestId
  }

  private async pollStatus(target: DeviceInfo, requestId: string): Promise<boolean> {
    const startTime = Date.now()
    while (Date.now() - startTime < ACCEPT_TIMEOUT_MS) {
      await this.sleep(500)
      try {
        const res = await this.doGet(target, `/status/${requestId}`)
        if (res.status === 'accepted') return true
        if (res.status === 'rejected' || res.status === 'timeout') return false
      } catch {
        // 网络错误，继续轮询
      }
    }
    return false
  }

  private async uploadFile(target: DeviceInfo, requestId: string, index: number, file: FileEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      const { address, port } = target
      const req = http.request({
        hostname: address,
        port,
        path: `/upload/${requestId}/${index}`,
        method: 'POST',
        headers: {
          'X-File-Name': encodeURIComponent(basename(file.path)),
          'X-File-Index': String(index),
          'Content-Length': String(file.size)
        }
      }, (res) => {
        if (res.statusCode === 200) resolve()
        else reject(new Error(`Upload failed: ${res.statusCode}`))
      })
      req.on('error', reject)
      const readStream = createReadStream(file.path)
      readStream.pipe(req)
      readStream.on('error', reject)
    })
  }

  // ── HTTP 客户端辅助方法 ──

  private doGet(target: DeviceInfo, path: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://${target.address}:${target.port}${path}`, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => {
          try { resolve(JSON.parse(data)) }
          catch { resolve(data) }
        })
      })
      req.setTimeout(HTTP_TIMEOUT_MS, () => { req.destroy(); reject(new Error('超时')) })
      req.on('error', reject)
    })
  }

  private doPost(target: DeviceInfo, path: string, body: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify(body)
      const req = http.request({
        hostname: target.address,
        port: target.port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(bodyStr)) }
      }, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => {
          try { resolve(JSON.parse(data)) }
          catch { resolve(data) }
        })
      })
      req.setTimeout(HTTP_TIMEOUT_MS, () => { req.destroy(); reject(new Error('超时')) })
      req.on('error', reject)
      req.write(bodyStr)
      req.end()
    })
  }

  private async pingDevice(target: DeviceInfo): Promise<boolean> {
    try {
      const res = await this.doGet(target, '/ping')
      return res.ok === true
    } catch {
      return false
    }
  }

  private showConfirmPopup(info: TransferRequestInfo): void {
    // 使用动态 require 避免对 TransferConfirmFrame 的编译期依赖
    // TransferConfirmFrame 将在 Task 3 创建，Task 5 清理此临时方案
    const TransferConfirmFrame = require('../frame/TransferConfirmFrame').default
    popupManager.showPermissionNotice(
      () => {
        const frame = new TransferConfirmFrame()
        frame.setRequestInfo(info)
        return frame.create()
      },
      { type: 'permission' as any, width: 420, height: 300 },
      (win) => {
        win.webContents.send('to-renderer-TransferConfirm:show', info)
        // 手动发送入场动画到 TransferConfirm 的频道
        // PopupManager 的 playAnimation 会发送到 PermissionNoticeFrame 频道，此处补充
        win.webContents.send('to-renderer-TransferConfirm:animate', { action: 'enter' })
      }
    )
  }

  respondToRequest(requestId: string, action: 'accept' | 'reject', saveDir: string): void {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) return
    // 获取发送方端口（从 pending 中恢复，实际上我们需要在 request 中存下来）
    // 简化处理：直接用 pending.senderAddress 发起 HTTP 请求
    // 由于发送方在 /request 时会带上端口信息，此处简化
    if (action === 'accept') {
      pending.status = 'accepted'
      pending.saveDir = saveDir || this.getSaveDir()
    } else if (action === 'reject') {
      pending.status = 'rejected'
      this.pendingRequests.delete(requestId)
    }
    this.doPostByAddress(pending.senderAddress, '/respond', { requestId, action, saveDir }).catch((err) => {
      log.error('[FileTransfer] respond 失败:', err)
    })
  }

  private doPostByAddress(address: string, path: string, body: unknown): Promise<any> {
    // 需要目标端口，从 devices map 中查找
    const device = Array.from(this.devices.values()).find((d) => d.address === address)
    if (!device) return Promise.reject(new Error('Device not found'))
    return this.doPost({ name: '', address: device.address, port: device.port, version: '' }, path, body)
  }

  async pickFiles(): Promise<FileEntry[]> {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      title: '选择要发送的文件'
    })
    if (canceled || filePaths.length === 0) return []
    return filePaths.map((p) => {
      const stats = statSync(p)
      return { name: basename(p), path: p, size: stats.size }
    })
  }

  async pickDirectory(): Promise<string | null> {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择接收文件保存目录'
    })
    if (canceled || filePaths.length === 0) return null
    return filePaths[0]
  }

  cancelTransfer(recordId: string): void {
    const record = this.records.find((r) => r.id === recordId)
    if (record && record.status === 'transferring') {
      record.status = 'failed'
      record.errorMessage = '用户取消'
      this.broadcast('broadcast:transfer-records-updated', this.getRecords())
    }
  }

  private getSaveDir(): string {
    const dir = settingsService.getAll().transferSaveDir
    if (dir) return dir
    return app.getPath('downloads')
  }

  /** 获取当前配置的扫描网段列表 */
  private getScanSubnets(): string[] {
    return settingsService.getAll().scanSubnets || []
  }

  /**
   * 手动添加一个已知 IP:Port 的设备到扫描设备列表
   * @returns true 表示添加成功（新设备），false 表示已存在
   */
  private async addScannedDevice(address: string, port: number): Promise<boolean> {
    const key = `${address}:${port}`
    if (this.scannedDevices.has(key)) return false
    // 立即探针验证
    const info = await this.probeDevice(address, port)
    if (info) {
      this.scannedDevices.set(key, { ...info, lastSeen: Date.now() })
      this.broadcast('broadcast:transfer-devices-updated', this.getDevices())
      return true
    }
    // 探针失败也添加，让后续扫描验证
    this.scannedDevices.set(key, {
      name: `未知 (${address})`,
      address,
      port,
      version: '',
      lastSeen: Date.now()
    })
    this.broadcast('broadcast:transfer-devices-updated', this.getDevices())
    return true
  }

  // ── TCP 发现服务器（固定端口，用于跨子网发现） ──

  /**
   * 启动 TCP 发现服务器
   * 监听固定端口 17862，仅响应 GET /ping，返回设备信息和文件传输 HTTP 端口
   */
  private async startDiscoveryServer(): Promise<void> {
    return new Promise((resolve) => {
      const tryBind = (attempt: number): void => {
        if (attempt > MAX_DISCOVERY_PORT_ATTEMPTS) {
          log.warn('[FileTransfer] 发现服务器端口绑定失败，已重试', MAX_DISCOVERY_PORT_ATTEMPTS, '次')
          resolve()
          return
        }
        const port = DISCOVERY_PORT + attempt
        this.discoveryServer = http.createServer((req, res) => {
          if (req.method === 'GET' && req.url === '/ping') {
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            })
            res.end(JSON.stringify({
              ok: true,
              name: this.getDeviceName(),
              port: this.port,
              version: app.getVersion()
            }))
          } else {
            res.writeHead(404)
            res.end('Not Found')
          }
        })
        this.discoveryServer!.listen(port, '0.0.0.0', () => {
          this.discoveryPort = port
          log.info('[FileTransfer] TCP 发现服务器启动，端口:', port)
          resolve()
        })
        this.discoveryServer!.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            log.warn('[FileTransfer] 发现端口', port, '被占用，尝试下一个')
            tryBind(attempt + 1)
          } else {
            log.error('[FileTransfer] 发现服务器启动失败:', err)
            resolve()
          }
        })
      }
      tryBind(0)
    })
  }

  /** 停止 TCP 发现服务器 */
  private stopDiscoveryServer(): void {
    if (this.discoveryServer) {
      this.discoveryServer.close()
      this.discoveryServer = null
      this.discoveryPort = 0
      log.info('[FileTransfer] TCP 发现服务器已停止')
    }
  }

  /** 获取发现服务器端口（0 = 未启动） */
  getDiscoveryPort(): number {
    return this.discoveryPort
  }

  // ── TCP 子网扫描（跨子网设备发现） ──

  /** 启动子网 TCP 扫描定时器 */
  private startSubnetScanner(): void {
    // 首次扫描延迟 3 秒，给 mDNS 先发现同子网设备
    setTimeout(() => {
      this.scanAllSubnets()
    }, 3_000)

    this.subnetScanTimer = setInterval(() => {
      this.scanAllSubnets()
    }, SUBNET_SCAN_INTERVAL_MS)

    log.info('[FileTransfer] 子网 TCP 扫描已启动，间隔:', SUBNET_SCAN_INTERVAL_MS / 1000, '秒')
  }

  /** 停止子网 TCP 扫描 */
  private stopSubnetScanner(): void {
    if (this.subnetScanTimer) {
      clearInterval(this.subnetScanTimer)
      this.subnetScanTimer = null
      this.isScanning = false
    }
  }

  /** 扫描所有配置的子网 */
  private async scanAllSubnets(): Promise<void> {
    if (this.isScanning) return
    this.isScanning = true

    try {
      // 1. 自动检测本机子网（/24）
      const autoSubnets = this.getAutoSubnets()

      // 2. 从设置获取用户配置的额外子网
      const configSubnets = this.getScanSubnets()

      // 3. 合并去重
      const allSubnets = [...new Set([...autoSubnets, ...configSubnets])]

      if (allSubnets.length === 0) {
        this.isScanning = false
        return
      }

      log.info('[FileTransfer] 开始 TCP 子网扫描，网段数:', allSubnets.length)

      // 4. 扫描所有子网
      for (const cidr of allSubnets) {
        await this.scanRange(cidr)
      }

      // 5. 清理过期扫描设备（连续 3 次扫描间隔未更新）
      const now = Date.now()
      for (const [key, dev] of this.scannedDevices) {
        if (now - dev.lastSeen > SUBNET_SCAN_INTERVAL_MS * 3) {
          this.scannedDevices.delete(key)
          log.info('[FileTransfer] 扫描设备离线（超时）:', dev.name)
        }
      }

      this.broadcast('broadcast:transfer-devices-updated', this.getDevices())
      log.info('[FileTransfer] TCP 子网扫描完成')
    } catch (err) {
      log.error('[FileTransfer] TCP 子网扫描出错:', err)
    } finally {
      this.isScanning = false
    }
  }

  /**
   * 自动推导本机所在子网（/24）
   * 从本机 IP 反推出 10.15.66.0/24 这样的 CIDR
   */
  private getAutoSubnets(): string[] {
    const ips = getLocalIPs()
    const subnets: string[] = []
    for (const ip of ips) {
      const parts = ip.split('.')
      if (parts.length === 4) {
        subnets.push(`${parts[0]}.${parts[1]}.${parts[2]}.0/24`)
      }
    }
    return subnets
  }

  /**
   * 扫描一个 CIDR 子网
   * 对范围内每个 IP 尝试 TCP 连接发现端口进行探针
   */
  private async scanRange(cidr: string): Promise<void> {
    const range = cidrToRange(cidr)
    if (!range) {
      log.warn('[FileTransfer] 无效的 CIDR:', cidr)
      return
    }

    // 生成 IP 列表
    const ips: string[] = []
    for (let i = range.start; i <= range.end; i++) {
      ips.push(intToIP(i))
    }

    if (ips.length === 0) return

    // 按并发数分批扫描
    for (let i = 0; i < ips.length; i += SCAN_CONCURRENCY) {
      const batch = ips.slice(i, i + SCAN_CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map((ip) => this.probeDevice(ip, DISCOVERY_PORT))
      )

      // 先探默认发现端口；若失败则尝试备选端口
      for (let j = 0; j < batch.length; j++) {
        const result = results[j]
        let info: DeviceInfo | null = null
        if (result.status === 'fulfilled') {
          info = result.value
        }

        // 默认端口失败，尝试 17863
        if (!info) {
          info = await this.probeDevice(batch[j], DISCOVERY_PORT + 1)
        }
        if (!info) {
          info = await this.probeDevice(batch[j], DISCOVERY_PORT + 2)
        }

        if (info) {
          const key = `${batch[j]}:${info.port}`
          this.scannedDevices.set(key, {
            name: info.name,
            address: batch[j],
            port: info.port,
            version: info.version,
            lastSeen: Date.now()
          })
        }
      }
    }
  }

  /**
   * 探针：TCP 连接目标 IP:端口 → GET /ping
   * @returns 设备信息（成功）或 null（失败）
   */
  private probeDevice(ip: string, port: number): Promise<DeviceInfo | null> {
    return new Promise((resolve) => {
      const req = http.get(`http://${ip}:${port}/ping`, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            if (parsed.ok === true) {
              resolve({
                name: parsed.name || ip,
                address: ip,
                port: parsed.port || port,
                version: parsed.version || ''
              })
            } else {
              resolve(null)
            }
          } catch {
            resolve(null)
          }
        })
      })
      req.setTimeout(PROBE_TIMEOUT_MS, () => {
        req.destroy()
        resolve(null)
      })
      req.on('error', () => resolve(null))
    })
  }

  // ── mDNS 广播 + 扫描 ──

  private startMDNS(): void {
    const mdns = this.multicastDNS()
    this.mdnsAdvertiser = mdns

    // 宣告服务
    const advertise = (): void => {
      mdns.on('query', (query: any) => {
        for (const q of query.questions || []) {
          if (q.name === MDNS_SERVICE_TYPE) {
            mdns.respond({
              answers: [{
                name: MDNS_SERVICE_TYPE,
                type: 'PTR',
                class: 1,
                ttl: 120,
                data: `${this.getDeviceName()}.${MDNS_SERVICE_TYPE}`
              }, {
                name: `${this.getDeviceName()}.${MDNS_SERVICE_TYPE}`,
                type: 'SRV',
                class: 1,
                ttl: 120,
                data: { port: this.port, target: hostname() + '.local' }
              }, {
                name: `${this.getDeviceName()}.${MDNS_SERVICE_TYPE}`,
                type: 'TXT',
                class: 1,
                ttl: 120,
                data: Buffer.from(`name=${this.getDeviceName()} port=${this.port} version=${app.getVersion()}`)
              }]
            })
          }
        }
      })
      log.info('[FileTransfer] mDNS 服务已宣告:', MDNS_SERVICE_TYPE)
    }
    advertise()
  }

  private startScanning(): void {
    const mdnsBrowser = this.multicastDNS()
    this.mdnsBrowser = mdnsBrowser

    this.scanTimer = setInterval(() => {
      mdnsBrowser.query(MDNS_SERVICE_TYPE, 'PTR')
    }, SCAN_INTERVAL_MS)

    mdnsBrowser.on('response', (response: any) => {
      for (const answer of response.answers || []) {
        if (answer.type === 'PTR' && answer.name === MDNS_SERVICE_TYPE) {
          this.processMDNSResponse(response)
        }
      }
    })

    // 立即触发首次扫描
    mdnsBrowser.query(MDNS_SERVICE_TYPE, 'PTR')
    log.info('[FileTransfer] mDNS 扫描已启动')
  }

  private processMDNSResponse(response: any): void {
    const answers = response.answers || []
    let name = ''
    let port = 0
    let version = ''

    for (const a of answers) {
      if (a.type === 'TXT' && a.data) {
        const txt = a.data.toString()
        const nameMatch = txt.match(/name=([^ ]+)/)
        const portMatch = txt.match(/port=(\d+)/)
        const verMatch = txt.match(/version=([^ ]+)/)
        if (nameMatch) name = nameMatch[1]
        if (portMatch) port = parseInt(portMatch[1], 10)
        if (verMatch) version = verMatch[1]
      }
    }

    if (!name || !port) return

    // 排除自己
    const localIPs = getLocalIPs()

    // 从响应中提取 IP
    for (const a of answers) {
      if (a.type === 'A' && a.data) {
        const ip = a.data
        if (!localIPs.includes(ip)) {
          const key = `${name}-${ip}:${port}`
          const existing = this.devices.get(key)
          if (existing) {
            existing.lastSeen = Date.now()
            existing.missCount = 0
          } else {
            this.devices.set(key, {
              name,
              address: ip,
              port,
              version,
              lastSeen: Date.now(),
              missCount: 0
            })
            log.info('[FileTransfer] 发现设备:', name, ip, port)
          }
        }
      }
    }

    // 检查离线
    for (const [key, device] of this.devices) {
      if (Date.now() - device.lastSeen > SCAN_INTERVAL_MS * 2) {
        device.missCount++
        if (device.missCount >= OFFLINE_THRESHOLD) {
          this.devices.delete(key)
          log.info('[FileTransfer] 设备离线:', device.name)
        }
      }
    }

    this.broadcast('broadcast:transfer-devices-updated', this.getDevices())
  }

  private stopMDNS(): void {
    if (this.mdnsAdvertiser) {
      this.mdnsAdvertiser.destroy()
      this.mdnsAdvertiser = null
    }
    if (this.mdnsBrowser) {
      this.mdnsBrowser.destroy()
      this.mdnsBrowser = null
    }
  }

  private stopScanning(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer)
      this.scanTimer = null
    }
  }

  // ── 广播 + 工具方法 ──

  private broadcast(channel: string, data: unknown): void {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    })
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export const fileTransferService = new FileTransferService()
