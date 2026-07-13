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
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, writeFileSync, promises as fsPromises } from 'fs'
import { basename, join } from 'path'
import { networkInterfaces, hostname } from 'os'
import log from 'electron-log'
import { popupManager } from '../frame'
import { settingsService } from './settingsService'
import { textShareService } from './textShareService'
import TransferConfirmFrame from '../frame/TransferConfirmFrame'

// ── 类型（内部使用，外部从 preload/index.d.ts 引用） ──

interface DeviceInfo {
  name: string
  address: string
  port: number
  version: string
  offline?: boolean
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
  senderPort: number
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

/** 设备在线探针间隔（毫秒） */
const HEALTH_CHECK_INTERVAL_MS = 10_000

/** 设备离线判定：连续未响应次数（1 次即判定，配合 10s 间隔 ≈ 10s 内检测离线） */
const OFFLINE_THRESHOLD = 1

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

/** 子网扫描并发数（/24 一次扫完） */
const SCAN_CONCURRENCY = 254

/** 探针 TCP 超时（毫秒）—— 局域网内 500ms 足矣 */
const PROBE_TIMEOUT_MS = 500

/** 子网重新扫描间隔（毫秒）—— 5 分钟，覆盖设备 IP 变化场景 */
const SUBNET_RESCAN_INTERVAL_MS = 5 * 60 * 1000

/**
 * 生成设备 Map key（IPv6 带方括号避免冒号与端口混淆）
 * @example deviceKey('192.168.1.1', 8080)  => '192.168.1.1:8080'
 *          deviceKey('240e::1', 8080)       => '[240e::1]:8080'
 */
function deviceKey(address: string, port: number): string {
  return address.includes(':') ? `[${address}]:${port}` : `${address}:${port}`
}

/** 局域网 IP 段 */
const LAN_RANGES = [
  { start: ipToInt('192.168.0.0'), end: ipToInt('192.168.255.255') },
  { start: ipToInt('10.0.0.0'), end: ipToInt('10.255.255.255') },
  { start: ipToInt('172.16.0.0'), end: ipToInt('172.31.255.255') }
]

/**
 * 判断是否为 IPv6 链路本地地址（fe80::/10）
 * 链路本地地址仅在同一个物理链路（局域网）内可达，不可路由
 */
function isIPv6LinkLocal(ip: string): boolean {
  return /^fe80:/i.test(ip)
}

/**
 * 判断是否为 IPv6 唯一本地地址（fc00::/7）
 * 相当于 IPv4 的私有地址段（10.0.0.0/8 等）
 */
function isIPv6UniqueLocal(ip: string): boolean {
  return /^f[cd]/i.test(ip)
}

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

/**
 * 判断 IP 是否属于局域网私有地址
 * - IPv4: 10/8, 172.16/12, 192.168/16
 * - IPv6: 链路本地 fe80::/10, 唯一本地 fc00::/7
 */
function isLANIP(ip: string): boolean {
  // IPv6 链路本地和唯一本地地址视为局域网
  if (isIPv6LinkLocal(ip) || isIPv6UniqueLocal(ip)) return true

  // IPv4 局域网范围
  const num = ipToInt(ip)
  return LAN_RANGES.some(({ start, end }) => num >= start && num <= end)
}

/** 生成简单 UUID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 获取本机局域网 IP 地址列表（排除虚拟网卡）
 * @returns [ipv4, ...ipv6] 混合列表，IPv6 地址为原始格式（无方括号）
 */
function getLocalIPs(): string[] {
  const interfaces = networkInterfaces()
  const ips: string[] = []
  for (const [name, netList] of Object.entries(interfaces)) {
    if (!netList) continue
    // 排除虚拟网卡（WSL / Hyper-V / VMware / VirtualBox / Docker 等）
    const isVirtual = /vEthernet|VMware|VirtualBox|docker/i.test(name)
    if (isVirtual) continue
    for (const net of netList) {
      if (!net.internal) {
        ips.push(net.address)
      }
    }
  }
  return ips
}

/** 清理文件名中的非法字符（跨平台安全） */
function sanitizeFileName(name: string): string {
  // macOS/Linux 允许更多字符，但 /（路径分隔符）和空字符必须过滤
  // Windows 额外过滤 <>:"|?* 以及 \（路径分隔符）
  if (process.platform === 'win32') {
    return name.replace(/[<>:"/\\|?*\x00]/g, '_')
  }
  // macOS/Linux：过滤 /（路径分隔符）和空字符，防止路径穿越
  return name.replace(/[/\x00]/g, '_')
}

/**
 * 格式化 HTTP URL，自动处理 IPv6 地址加方括号
 * @example
 * formatUrl('192.168.1.1', 8080, '/ping')  => 'http://192.168.1.1:8080/ping'
 * formatUrl('240e::1', 8080, '/ping')       => 'http://[240e::1]:8080/ping'
 */
function formatUrl(address: string, port: number, path = ''): string {
  const host = address.includes(':') ? `[${address}]` : address
  return `http://${host}:${port}${path}`
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
  private _port = 0

  /**
   * 获取 HTTP 服务器端口
   */
  get port(): number {
    return this._port
  }
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
  /** TCP 扫描到的设备（key: address:port，offline 标记手动添加但离线） */
  private scannedDevices: Map<string, DeviceInfo & { lastSeen: number; missCount: number; offline: boolean }> = new Map()
  /** 子网扫描定时器 */
  private subnetScanTimer: ReturnType<typeof setInterval> | null = null
  /** 是否正在扫描 */
  private isScanning = false
  /** 设备在线探针定时器 */
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null
  /** 活跃的上传请求（key: recordId，用于取消传输） */
  private activeUploads: Map<string, { req: http.ClientRequest; readStream: import('fs').ReadStream }> = new Map()
  /** 当前发送中的 recordId（用于中途取消） */
  private currentSendingRecordId: string | null = null

  /** 本地文件分享回调（由 index.ts 注册，避免循环依赖 QuickShareFrame） */
  private localShareHandler: ((files: { name: string; path: string; size: number }[]) => void) | null = null

  /**
   * 注册本地文件分享回调
   * @description 当 Windows 右键菜单"分享到妙妙屋"发送 HTTP 请求时调用
   */
  setLocalShareHandler(handler: (files: { name: string; path: string; size: number }[]) => void): void {
    this.localShareHandler = handler
  }

  async init(): Promise<void> {
    // 动态加载 multicast-dns（CJS 模块，避免 import 加载时阻塞）
    this.multicastDNS = require('multicast-dns')
    await this.startServer()
    this.startMDNS()
    this.startScanning()
    await this.startDiscoveryServer()
    this.startSubnetScanner()
    // 加载持久化的手动添加设备
    this.loadManualDevices()
    // 启动 10 秒间隔的设备在线探针
    this.startHealthCheck()
    this.registerIPC()

    // 应用启动后延迟 3 秒自动扫描本机网段和手动添加的网段
    // 等待 HTTP Server、mDNS、TCP 发现服务器都已就绪
    setTimeout(() => {
      this.scanAllSubnets().catch((err) => {
        log.warn('[FileTransfer] 启动后自动扫描网段失败:', err.message)
      })
    }, 3_000)

    log.info('[FileTransfer] 服务初始化完成，端口:', this.port)
  }

  destroy(): void {
    this.stopScanning()
    this.stopMDNS()
    this.stopServer()
    this.stopSubnetScanner()
    this.stopDiscoveryServer()
    this.stopHealthCheck()
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
      const allIPs = getLocalIPs()
      return {
        name: this.getDeviceName(),
        address: allIPs.find(ip => !ip.includes(':')) || '127.0.0.1',
        port: this.port,
        /** 所有 IPv4 地址 */
        ipv4: allIPs.filter(ip => !ip.includes(':')),
        /** 所有 IPv6 地址（含公网全局单播地址） */
        ipv6: allIPs.filter(ip => ip.includes(':')),
        /** 所有地址（不分协议） */
        all: allIPs
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
      log.info('[FileTransfer] setScanSubnets:', JSON.stringify(subnets))
      settingsService.update({ scanSubnets: subnets })
      // 验证是否保存成功
      const saved = settingsService.getAll().scanSubnets
      log.info('[FileTransfer] setScanSubnets 验证:', JSON.stringify(saved))
      return { ok: true }
    })

    /** 手动添加设备（port=0 时自动探针发现端口） */
    ipcMain.handle('to-service-FileTransferService:addDevice', (_event, address: string, port: number) => {
      return this.addScannedDevice(address, port)
    })

    /** 接收方向发送方发起取消 */
    ipcMain.handle('to-service-FileTransferService:cancelRemoteTransfer', async (_event, targetAddress: string, targetPort: number, requestId: string) => {
      await this.cancelRemoteTransfer(targetAddress, targetPort, requestId)
    })

    /** 获取手动添加的设备列表 */
    ipcMain.handle('to-service-FileTransferService:getManualDevices', () => {
      return this.getManualDevices()
    })

    /** 移除手动添加的设备 */
    ipcMain.handle('to-service-FileTransferService:removeManualDevice', (_event, address: string, port: number) => {
      this.removeManualDevice(address, port)
    })

    /** 立即执行一次网段扫描 */
    ipcMain.handle('to-service-FileTransferService:scanNow', () => {
      const configured = this.getScanSubnets()
      log.info('[FileTransfer] scanNow 读取配置:', JSON.stringify(configured))
      this.scanAllSubnets()
      return { ok: true }
    })
  }

  // ── 设备管理 ──

  getDevices(): DeviceInfo[] {
    const result: DeviceInfo[] = []
    const seenAddresses = new Set<string>()

    // 1. 先处理 mDNS 发现的设备
    for (const mdns of this.devices.values()) {
      if (mdns.missCount >= OFFLINE_THRESHOLD) continue

      // 检查同一 IP 是否有扫描/手动设备
      const scanned = this.findScannedByAddress(mdns.address)
      if (scanned && this.isManualDevice(mdns.address, scanned.port)) {
        // 手动设备优先：保留离线状态和自定义名称
        result.push({
          name: scanned.name,
          address: scanned.address,
          port: scanned.port,
          version: scanned.version,
          offline: scanned.offline
        })
      } else if (scanned) {
        // 普通扫描设备：用 mDNS 的更完整信息，合并离线状态
        result.push({
          name: mdns.name,
          address: mdns.address,
          port: mdns.port,
          version: mdns.version,
          offline: scanned.offline
        })
      } else {
        // 仅 mDNS 发现的设备
        result.push({
          name: mdns.name,
          address: mdns.address,
          port: mdns.port,
          version: mdns.version,
          offline: false
        })
      }
      seenAddresses.add(mdns.address)
    }

    // 2. 添加扫描/手动设备中 mDNS 未覆盖的
    for (const scanned of this.scannedDevices.values()) {
      if (seenAddresses.has(scanned.address)) continue
      result.push({
        name: scanned.name,
        address: scanned.address,
        port: scanned.port,
        version: scanned.version,
        offline: scanned.offline
      })
      seenAddresses.add(scanned.address)
    }

    return result
  }

  /** 在 scannedDevices 中按 IP 查找设备 */
  private findScannedByAddress(address: string): (DeviceInfo & { lastSeen: number; missCount: number; offline: boolean }) | undefined {
    for (const dev of this.scannedDevices.values()) {
      if (dev.address === address) return dev
    }
    return undefined
  }

  /** 在 scannedDevices 中按 IP 删除所有记录（处理同 IP 不同 key 的重复） */
  private removeScannedByAddress(address: string): void {
    for (const [key, dev] of this.scannedDevices) {
      if (dev.address === address) {
        this.scannedDevices.delete(key)
      }
    }
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
        // 随机端口 1024-65535，0 让系统自动分配；绑定 :: 开启双栈监听（同时收 IPv4 和 IPv6）
        const port = attempt === 0 ? 0 : 1024 + Math.floor(Math.random() * 64511)
        this.server!.listen(port, '::', () => {
          const addr = this.server!.address()
          this._port = typeof addr === 'object' ? addr!.port : port
          log.info('[FileTransfer] HTTP Server 启动，端口:', this.port)
          // 保存端口供 Shell 集成（右键分享）使用
          try {
            writeFileSync(join(app.getPath('temp'), 'psf-port'), String(this.port), 'utf-8')
          } catch { /* ignore */ }
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

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // 安全校验：局域网 IP 直连放行；非局域网 IP（IPv6 公网 / FRP 隧道）仅警告不拦截
    const clientIP = (req.socket.remoteAddress || '').replace(/^::ffff:/, '')
    if (!isLANIP(clientIP) && clientIP !== '127.0.0.1' && clientIP !== '::1') {
      log.warn(`[FileTransfer] 收到非局域网连接请求: ${clientIP}，已放行（手动添加设备 / IPv6 公网 / FRP 隧道）`)
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

      // POST /cancel（接收方通知发送方取消传输）
      if (req.method === 'POST' && path === '/cancel') {
        this.handleCancel(req, res)
        return
      }

      // POST /share-text（文本分享）
      if (req.method === 'POST' && path === '/share-text') {
        this.handleTextShare(req, res, clientIP)
        return
      }

      // POST /share-local-files（Windows 右键菜单"分享到妙妙屋"本地文件）
      if (req.method === 'POST' && path === '/share-local-files') {
        await this.handleLocalShareFiles(req, res)
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
    log.info(`[FileTransfer] 收到传输请求, 来自: ${clientIP}`)
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
      if (body.length > 100_000) {
        log.warn('[FileTransfer] 请求体过大')
        res.writeHead(413)
        res.end('Payload too large')
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        if (!data.files || !Array.isArray(data.files) || !data.senderName) {
          log.warn('[FileTransfer] 请求格式无效:', JSON.stringify(data))
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'Invalid request format' }))
          return
        }
        const requestId = generateId()
        const totalSize = data.files.reduce((sum: number, f: any) => sum + (f.size || 0), 0)
        log.info(`[FileTransfer] 创建请求 ${requestId}, 发送方: ${data.senderName}, 文件数: ${data.files.length}, 总大小: ${totalSize}`)

        // 暂存请求
        const pending: PendingRequest = {
          requestId,
          senderAddress: clientIP,
          senderName: data.senderName,
          files: data.files,
          status: 'pending',
          timer: setTimeout(() => {
            if (this.pendingRequests.get(requestId)?.status === 'pending') {
              log.info(`[FileTransfer] 请求 ${requestId} 超时`)
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
          senderPort: data.senderPort || 0,
          files: data.files,
          totalSize
        }
        log.info(`[FileTransfer] 准备弹出确认窗口, requestId: ${requestId}`)
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
          // 注意：接收方通过 respondToRequest 创建 'received' 记录
          // 发送方通过 sendRequest 创建 'sent' 记录
          // handleRespond 不在此创建记录
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

  /** POST /cancel — 接收方请求取消传输 */
  private handleCancel(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => {
      try {
        const { requestId } = JSON.parse(body)
        log.info('[FileTransfer] 收到取消请求, requestId:', requestId)

        // 在活跃上传中查找并中止
        for (const [recordId, upload] of this.activeUploads) {
          upload.readStream.destroy()
          upload.req.destroy()
          this.activeUploads.delete(recordId)
        }
        // 标记发送记录为取消
        const record = this.records.find((r) => r.id && r.status === 'transferring' && r.direction === 'sent')
        if (record) {
          record.status = 'failed'
          record.errorMessage = '对方已取消传输'
          this.broadcast('broadcast:transfer-records-updated', this.getRecords())
        }
        this.currentSendingRecordId = null

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

  // ── 文本分享处理 ──

  /**
   * 处理文本分享请求
   * @description 接收来自局域网设备的文本分享，转发给 textShareService
   */
  private handleTextShare(req: http.IncomingMessage, res: http.ServerResponse, clientIP: string): void {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
      // 防止恶意大文本
      if (body.length > 100_000) {
        res.writeHead(413)
        res.end(JSON.stringify({ error: 'Payload too large' }))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        if (!data.text || !data.senderName) {
          log.warn('[FileTransfer] 文本分享: 请求格式无效')
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'Invalid request format' }))
          return
        }

        log.info(`[FileTransfer] 收到文本分享: 来自 ${data.senderName}(${clientIP}), 文本长度: ${data.text.length}`)

        // 转发给 textShareService 处理（单独 try/catch，不影响响应）
        try {
          textShareService.onReceiveText(data.text, data.senderName, clientIP)
        } catch (err: any) {
          log.error('[FileTransfer] 文本分享处理失败:', err.message)
          // 继续返回 200，文本已在发出方显示"已发送"，不应让对方看到失败
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, receivedAt: Date.now() }))
      } catch (err: any) {
        log.error('[FileTransfer] 文本分享 JSON 解析失败:', err.message)
        res.writeHead(400)
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
  }

  // ── 本地文件分享处理（Windows 右键菜单） ──

  /**
   * 处理 Windows 右键"分享到妙妙屋"的本地文件
   * @description PowerShell 通过 HTTP POST 发送文件路径列表
   */
  private async handleLocalShareFiles(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    await new Promise<void>((resolve, reject) => {
      req.on('end', resolve)
      req.on('error', reject)
    })
    try {
      const data = JSON.parse(body)
      const paths: string[] = data.paths || []
      if (paths.length === 0) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: 'No paths' }))
        return
      }

      // 验证文件路径，构建 FileEntry[]（异步 I/O，不阻塞主进程）
      const entries: { name: string; path: string; size: number }[] = []
      for (const p of paths) {
        try {
          await fsPromises.access(p)
          const stats = await fsPromises.stat(p)
          entries.push({ name: basename(p), path: p, size: stats.size })
        } catch {
          // 文件不存在或无法访问，跳过
        }
      }

      if (entries.length === 0) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: 'No valid files' }))
        return
      }

      // 通过回调通知 index.ts 显示分享弹窗
      if (this.localShareHandler) {
        this.localShareHandler(entries)
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, count: entries.length }))
    } catch {
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'Invalid JSON' }))
    }
  }

  // ── 文件上传处理 ──

  private handleUpload(req: http.IncomingMessage, res: http.ServerResponse, path: string): void {
    const parts = path.split('/')
    const requestId = parts[2]
    const fileIndex = parseInt(parts[3], 10)
    const fileName = sanitizeFileName(decodeURIComponent(req.headers['x-file-name'] as string || `file_${fileIndex}`))

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
    const writeStream = createWriteStream(savePath, { highWaterMark: 1024 * 1024 })  // 1MB 缓冲，减少磁盘写入阻塞

    // 查找或创建接收记录
    const record = this.records.find((r) =>
      r.direction === 'received' && r.peerAddress === pending!.senderAddress && r.status === 'transferring'
    )

    /** 进度广播节流：每累计 ~1MB 才广播一次 */
    let accBytes = 0
    const THROTTLE_BYTES = 1024 * 1024

    req.on('data', (chunk: Buffer) => {
      const canContinue = writeStream.write(chunk)
      if (!canContinue) {
        req.pause()
        writeStream.once('drain', () => req.resume())
      }
      // 更新记录进度（节流广播）
      if (record) {
        record.transferredBytes += chunk.length
        accBytes += chunk.length
        if (accBytes >= THROTTLE_BYTES) {
          accBytes = 0
          this.broadcast('broadcast:transfer-records-updated', this.getRecords())
        }
      }
    })

    req.on('end', () => {
      writeStream.end()
      // 记录完成（强制广播最后不足 1MB 的部分）
      if (record) {
        if (accBytes > 0) {
          this.broadcast('broadcast:transfer-records-updated', this.getRecords())
        }
        if (record.transferredBytes >= record.totalBytes) {
          record.status = 'completed'
          record.completedAt = Date.now()
          this.broadcast('broadcast:transfer-records-updated', this.getRecords())
        }
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
      // 清理挂起的请求记录，防止内存泄漏
      this.pendingRequests.delete(requestId)
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
      senderName: this.getDeviceName(),
      senderPort: this.port
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
    this.currentSendingRecordId = record.id
    this.broadcast('broadcast:transfer-records-updated', this.getRecords())

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        // 上传前广播当前进度（让 UI 显示当前在传哪个文件）
        this.broadcast('broadcast:transfer-records-updated', this.getRecords())
        // 控制进度广播频率：每 ~1MB 或文件最后一块时才广播
        let accBytes = 0
        const THROTTLE_BYTES = 1024 * 1024  // 1MB
        await this.uploadFile(target, requestId, i, file, (bytesSent) => {
          record.transferredBytes += bytesSent
          accBytes += bytesSent
          if (accBytes >= THROTTLE_BYTES) {
            accBytes = 0
            this.broadcast('broadcast:transfer-records-updated', this.getRecords())
          }
        })
        // 最后一块可能不足 THROTTLE_BYTES，强制广播确保 100%
        if (accBytes > 0) {
          this.broadcast('broadcast:transfer-records-updated', this.getRecords())
        }
      }
    } catch (err: any) {
      // uploadFile 被取消或出错时不覆盖 cancelTransfer 已设置的错误信息
      if ((record as TransferRecord).status !== 'failed') {
        record.status = 'failed'
        record.errorMessage = err.message || '传输中断'
      }
      this.currentSendingRecordId = null
      this.activeUploads.delete(record.id)
      this.broadcast('broadcast:transfer-records-updated', this.getRecords())
      return requestId
    }

    this.currentSendingRecordId = null
    this.activeUploads.delete(record.id)
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

  private async uploadFile(target: DeviceInfo, requestId: string, index: number, file: FileEntry, onProgress?: (bytes: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const { address, port } = target
      const req = http.request({
        hostname: address.includes(':') ? `[${address}]` : address,
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
      req.on('error', (err) => {
        if ((err as any)?.code === 'ECONNRESET' || err.message === 'aborted') {
          reject(new Error('用户取消'))
        } else {
          reject(err)
        }
      })
      const readStream = createReadStream(file.path, { highWaterMark: 1024 * 1024 })
      // 监听数据块发送进度
      readStream.on('data', (chunk: Buffer) => {
        if (onProgress) onProgress(chunk.length)
      })
      // 注册到活跃上传列表，供取消使用
      if (this.currentSendingRecordId) {
        this.activeUploads.set(this.currentSendingRecordId, { req, readStream })
      }
      readStream.pipe(req)
      readStream.on('error', reject)
    })
  }

  // ── HTTP 客户端辅助方法 ──

  private doGet(target: DeviceInfo, path: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = http.get(formatUrl(target.address, target.port, path), (res) => {
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
      const url = new URL(formatUrl(target.address, target.port, path))
      const req = http.request({
        hostname: url.hostname,
        port: url.port || target.port,
        path: url.pathname,
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
    log.info(`[FileTransfer] showConfirmPopup: sender=${info.senderName}, files=${info.files.length}`)
    try {
      popupManager.showPermissionNotice(
        () => {
          log.info('[FileTransfer] 创建 TransferConfirmFrame 窗口')
          try {
            const frame = new TransferConfirmFrame()
            frame.setRequestInfo(info)
            const win = frame.create()
            log.info('[FileTransfer] TransferConfirmFrame 窗口创建成功')
            return win
          } catch (err) {
            log.error('[FileTransfer] 创建 TransferConfirmFrame 失败:', err)
            throw err
          }
        },
        { type: 'permission' as any, width: 420, height: 300 },
        (win) => {
          log.info('[FileTransfer] 发送 show/animate IPC 到确认窗口')
          win.webContents.send('to-renderer-TransferConfirm:show', info)
          win.webContents.send('to-renderer-TransferConfirm:animate', { action: 'enter' })
        }
      )
      log.info('[FileTransfer] showConfirmPopup 完成')
    } catch (err) {
      log.error('[FileTransfer] showConfirmPopup 异常:', err)
    }
  }

  respondToRequest(requestId: string, action: 'accept' | 'reject', saveDir: string): void {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) {
      log.warn(`[FileTransfer] respondToRequest: 请求 ${requestId} 不存在`)
      return
    }
    log.info(`[FileTransfer] respondToRequest: ${requestId}, action=${action}, saveDir=${saveDir}`)
    if (action === 'accept') {
      pending.status = 'accepted'
      pending.saveDir = saveDir || this.getSaveDir()
      // 创建接收记录（供 handleUpload 更新进度和 TransferConfirm 展示）
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
    } else if (action === 'reject') {
      pending.status = 'rejected'
      this.pendingRequests.delete(requestId)
    }
    this.doPostByAddress(pending.senderAddress, '/respond', { requestId, action, saveDir }).then(() => {
      log.info(`[FileTransfer] respond 回复成功: ${requestId}`)
    }).catch((err) => {
      log.error(`[FileTransfer] respond 回复失败:`, err.message)
    })
  }

  private doPostByAddress(address: string, path: string, body: unknown): Promise<any> {
    // 先查 mDNS 发现设备，再查 TCP 扫描发现设备
    const device = Array.from(this.devices.values()).find((d) => d.address === address)
      || Array.from(this.scannedDevices.values()).find((d) => d.address === address)
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
    // 1. 中止活跃的 HTTP 请求
    const upload = this.activeUploads.get(recordId)
    if (upload) {
      upload.readStream.destroy()
      upload.req.destroy()
      this.activeUploads.delete(recordId)
    }

    // 2. 标记发送记录
    const record = this.records.find((r) => r.id === recordId)
    if (record) {
      record.status = 'failed'
      record.errorMessage = '用户取消'
      this.broadcast('broadcast:transfer-records-updated', this.getRecords())
    }

    this.currentSendingRecordId = null
  }

  /**
   * 接收方通知发送方取消传输
   */
  private async cancelRemoteTransfer(targetAddress: string, targetPort: number, requestId: string): Promise<void> {
    try {
      await this.doPost(
        { name: '', address: targetAddress, port: targetPort, version: '' },
        '/cancel',
        { requestId }
      )
      log.info('[FileTransfer] 已向发送方发送取消请求:', targetAddress)
    } catch (err: any) {
      log.warn('[FileTransfer] 通知发送方取消失败:', err.message)
    }
    // 标记本地的接收记录
    const record = this.records.find((r) => r.direction === 'received' && r.status === 'transferring')
    if (record) {
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
   * 手动添加设备到扫描设备列表
   * - port=0 时自动探针发现端口（扫 17862-17864）
   * - port>0 时直接使用指定端口
   * @returns true 表示添加成功，false 表示已存在
   */
  private async addScannedDevice(address: string, port: number): Promise<boolean> {
    // port=0 时自动发现
    let actualPort = port
    let deviceInfo: DeviceInfo | null = null

    if (actualPort === 0) {
      // 尝试发现端口 17862-17864
      for (const p of [DISCOVERY_PORT, DISCOVERY_PORT + 1, DISCOVERY_PORT + 2]) {
        deviceInfo = await this.probeDevice(address, p)
        if (deviceInfo) {
          actualPort = deviceInfo.port  // 文件传输 HTTP 端口
          break
        }
      }
    } else {
      deviceInfo = await this.probeDevice(address, actualPort)
    }

    // 判重（以 address:port 为 key，IPv6 带方括号避免冒号混淆）
    const key = address.includes(':') ? `[${address}]:${actualPort}` : `${address}:${actualPort}`
    if (this.scannedDevices.has(key)) return false

    // 持久化到设置（存原始发现端口 17862，用于后续健康检查）
    this.persistManualDevice(address, DISCOVERY_PORT)

    // 先清理该 IP 的旧记录（手动添加可能改变端口，旧 key ip:17862 与新 key ip:HTTPPort 不同）
    this.removeScannedByAddress(address)

    if (deviceInfo) {
      this.scannedDevices.set(key, { ...deviceInfo, lastSeen: Date.now(), missCount: 0, offline: false })
      this.broadcast('broadcast:transfer-devices-updated', this.getDevices())
      return true
    }

    // 探针失败也添加，直接标红（用户知道输了一个离线 IP）
    this.scannedDevices.set(key, {
      name: address,
      address,
      port: actualPort,
      version: '',
      lastSeen: Date.now(),
      missCount: 0,
      offline: true
    })
    this.broadcast('broadcast:transfer-devices-updated', this.getDevices())
    return true
  }

  /**
   * 将手动添加的设备持久化到 settings.json
   */
  private persistManualDevice(address: string, port: number): void {
    const current = settingsService.getAll().manualDevices || []
    // 去重
    const exists = current.some((d) => d.address === address && d.port === port)
    if (!exists) {
      current.push({ address, port })
      settingsService.update({ manualDevices: current })
      log.info('[FileTransfer] 手动设备已持久化:', address, port)
    }
  }

  /**
   * 从设置中加载持久化的手动添加设备
   * @description 加载时立即标记为离线（红色）并广播，然后并发 TCP 探针验证是否在线
   *              探针成功 → 更新为在线（绿色）并再次广播
   *              防止刚启动时 QuickShare 右键菜单错误显示离线设备为在线
   */
  private loadManualDevices(): void {
    const devices = settingsService.getAll().manualDevices || []
    log.info('[FileTransfer] 加载持久化手动设备:', devices.length)
    if (devices.length === 0) return

    // 先全部标记为离线（红色），并立即广播
    for (const d of devices) {
      const key = deviceKey(d.address, d.port)
      if (!this.scannedDevices.has(key)) {
        this.scannedDevices.set(key, {
          name: d.address,
          address: d.address,
          port: d.port,
          version: '',
          lastSeen: Date.now(),
          missCount: 0,
          offline: true  // 启动时默认离线，探针成功后再变绿
        })
      }
    }
    this.broadcast('broadcast:transfer-devices-updated', this.getDevices())

    // 并发 TCP 探针所有手动设备，探针成功则更新为在线
    for (const d of devices) {
      this.probeDevice(d.address, DISCOVERY_PORT).then((info) => {
        if (info) {
          const key = deviceKey(d.address, d.port)
          this.scannedDevices.set(key, {
            ...info,
            address: d.address,
            lastSeen: Date.now(),
            missCount: 0,
            offline: false  // 探针成功 → 标记在线
          })
          log.info(`[FileTransfer] 手动设备探针在线: ${info.name} (${d.address})`)
          this.broadcast('broadcast:transfer-devices-updated', this.getDevices())
        }
      })
    }
  }

  /**
   * 获取手动添加的设备列表（纯地址端口对）
   */
  private getManualDevices(): { address: string; port: number }[] {
    return settingsService.getAll().manualDevices || []
  }

  /**
   * 移除一个手动添加的设备（从内存和持久化中删除）
   */
  private removeManualDevice(address: string, _port: number): void {
    // 从内存中删除该 IP 下的所有条目（端口可能因探针更新而变化）
    for (const [key, dev] of this.scannedDevices) {
      if (dev.address === address) {
        this.scannedDevices.delete(key)
        break
      }
    }

    // 从持久化中移除
    const current = (settingsService.getAll().manualDevices || []).filter(
      (d) => d.address !== address
    )
    settingsService.update({ manualDevices: current })
    this.broadcast('broadcast:transfer-devices-updated', this.getDevices())
    log.info('[FileTransfer] 手动设备已移除:', address)
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
        this.discoveryServer!.listen(port, '::', () => {
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

  /**
   * 启动子网 TCP 扫描定时器
   * @description 每 5 分钟重新扫描一次手动配置的跨网段，消灭因 IP 变化产生的永久标红设备
   */
  private startSubnetScanner(): void {
    this.subnetScanTimer = setInterval(() => {
      this.scanAllSubnets().catch((err) => {
        log.warn('[FileTransfer] 定时子网扫描失败:', err.message)
      })
    }, SUBNET_RESCAN_INTERVAL_MS)
    log.info(`[FileTransfer] 子网扫描定时器已启动，间隔: ${SUBNET_RESCAN_INTERVAL_MS / 1000}s`)
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
  async scanAllSubnets(): Promise<void> {
    if (this.isScanning) {
      log.warn('[FileTransfer] 扫描已在进行中，忽略本次请求')
      return
    }
    this.isScanning = true

    try {
      // 1. 优先探针已有设备（刷新在线状态）
      log.info('[FileTransfer] 开始探针已有设备...')
      await this.probeAllExistingDevices()

      // 2. 收集要扫描的网段：手动配置的 + 自动检测的本机子网
      //    mDNS 负责实时发现同网段设备，TCP 扫描作为兜底（部分网络封锁组播）
      const manualSubnets = this.getScanSubnets()
      const allSubnets = [...manualSubnets]

      // 自动添加本机所在子网（/24），作为 mDNS 失效时的兜底
      const localIPs = getLocalIPs()
      for (const ip of localIPs) {
        const parts = ip.split('.')
        if (parts.length === 4) {
          const localCidr = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
          if (!allSubnets.includes(localCidr)) {
            allSubnets.push(localCidr)
          }
        }
      }

      if (allSubnets.length > 0) {
        log.info('[FileTransfer] 开始 TCP 子网扫描，网段数:', allSubnets.length)

        // 3. 扫描所有子网
        for (const cidr of allSubnets) {
          log.info('[FileTransfer] 扫描网段:', cidr)
          await this.scanRange(cidr)
        }
      } else {
        log.info('[FileTransfer] 无扫描网段，跳过 TCP 扫描')
      }

      this.broadcast('broadcast:transfer-devices-updated', this.getDevices())
      this.broadcast('broadcast:transfer-scan-completed', null)
      log.info('[FileTransfer] TCP 子网扫描完成')
    } catch (err) {
      log.error('[FileTransfer] TCP 子网扫描出错:', err)
    } finally {
      this.isScanning = false
    }
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

    // 过滤本机 IP，避免探针扫到自身
    const localIPs = getLocalIPs()
    const filteredIPs = ips.filter((ip) => !localIPs.includes(ip))
    const skipCount = ips.length - filteredIPs.length
    if (skipCount > 0) {
      log.info(`[FileTransfer] 跳过 ${skipCount} 个本机 IP`)
    }

    if (filteredIPs.length === 0) return

    // 清理该网段内已离线的旧记录
    // 解决设备 IP 变化后旧 IP 永久标红的问题：扫描前清空本段离线设备，扫描会重新发现活着的
    const ipSet = new Set(filteredIPs)
    for (const [key, dev] of this.scannedDevices) {
      if (dev.offline && ipSet.has(dev.address)) {
        if (!this.isManualDevice(dev.address, dev.port)) {
          this.scannedDevices.delete(key)
        }
      }
    }

    log.info(`[FileTransfer] 扫描范围 ${cidr}: ${filteredIPs.length} 个 IP`)
    let foundCount = 0

    // 按并发数分批扫描
    for (let i = 0; i < filteredIPs.length; i += SCAN_CONCURRENCY) {
      const batch = filteredIPs.slice(i, i + SCAN_CONCURRENCY)

      // 对批次内每个 IP 探测发现端口 17862
      const batchInfos = await Promise.all(
        batch.map(async (ip) => {
          const info = await this.probeDevice(ip, DISCOVERY_PORT)
          return info
        })
      )

      for (let j = 0; j < batch.length; j++) {
        const info = batchInfos[j]
        if (info) {
          foundCount++
          log.info(`[FileTransfer] 探针发现设备: ${batch[j]}:${info.port} (${info.name})`)
          const key = deviceKey(batch[j], info.port)
          // 如该 IP 已存在（手动添加的），先删除旧记录再添加，避免 Map 中同 IP 不同 key 的重复
          this.removeScannedByAddress(batch[j])
          this.scannedDevices.set(key, {
            name: info.name,
            address: batch[j],
            port: info.port,
            version: info.version,
            lastSeen: Date.now(),
            missCount: 0,
            offline: false
          })
        }
      }
    }
    log.info(`[FileTransfer] 网段 ${cidr} 扫描完成，发现 ${foundCount} 台设备`)
  }

  /**
   * 启动设备在线探针，每 10 秒检测一次所有已知设备是否在线
   * 连续 OFFLINE_THRESHOLD 次无响应则标记为离线

  /**
   * 探针：TCP 连接目标 IP:端口 → GET /ping
   * @returns 设备信息（成功）或 null（失败）
   */
  private probeDevice(ip: string, port: number): Promise<DeviceInfo | null> {
    return new Promise((resolve) => {
      const req = http.get(formatUrl(ip, port, '/ping'), (res) => {
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
    try {
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
                  class: 'IN',
                  ttl: 120,
                  data: `${this.getDeviceName()}.${MDNS_SERVICE_TYPE}`
                }, {
                  name: `${this.getDeviceName()}.${MDNS_SERVICE_TYPE}`,
                  type: 'SRV',
                  class: 'IN',
                  ttl: 120,
                  data: { port: this.port, target: hostname().replace(/\.local$/, '') + '.local' }
                }, {
                  name: `${this.getDeviceName()}.${MDNS_SERVICE_TYPE}`,
                  type: 'TXT',
                  class: 'IN',
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
    } catch (error) {
      log.error('[FileTransfer] mDNS 服务启动失败:', error)
      this.mdnsAdvertiser = null
    }
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
        /** dns-packet 解码 TXT 记录时 data 为 Buffer 数组，需合并 */
        const txt = (Array.isArray(a.data) ? Buffer.concat(a.data) : a.data).toString()
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
          const key = `${name}-${deviceKey(ip, port)}`
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

  // ── 设备在线探针 ──

  /**
   * 手动刷新时探针所有已有设备，无响应的立即处理
   * - 手动添加设备 → 标红（offline=true）
   * - 扫描发现的设备 → 也标红保留，不删除
   */
  private async probeAllExistingDevices(): Promise<void> {
    const probes: Promise<void>[] = []

    // 探针 scannedDevices 中的所有设备
    for (const [, dev] of this.scannedDevices) {
      const probe = this.probeDevice(dev.address, DISCOVERY_PORT).then((info) => {
        if (info) {
          // 在线：更新状态
          dev.lastSeen = Date.now()
          if (info.port !== dev.port) dev.port = info.port
          dev.missCount = 0
          dev.offline = false
        } else {
          // 无响应：标红保留，设备重新上线后健康检查会恢复
          dev.offline = true
          dev.missCount = 0
          log.info('[FileTransfer] 刷新探针: 设备离线（标红）:', dev.name, dev.address)
        }
      })
      probes.push(probe)
    }

    // 也探针 mDNS 发现的设备
    for (const [key, dev] of this.devices) {
      const probe = this.probeDevice(dev.address, DISCOVERY_PORT).then((info) => {
        if (info) {
          dev.lastSeen = Date.now()
          dev.missCount = 0
        } else {
          dev.missCount++
          if (dev.missCount >= OFFLINE_THRESHOLD) {
            this.devices.delete(key)
            log.info('[FileTransfer] 刷新探针: mDNS 设备离线（已删除）:', dev.name, dev.address)
          }
        }
      })
      probes.push(probe)
    }

    await Promise.allSettled(probes)
    this.broadcast('broadcast:transfer-devices-updated', this.getDevices())
    log.info('[FileTransfer] 刷新探针完成')
  }

  /**
   * 启动设备在线探针，每 10 秒检测一次所有已知设备是否在线
   * 连续 OFFLINE_THRESHOLD 次无响应则标记为离线并广播更新
   */
  private startHealthCheck(): void {
    // 立即执行一次，然后每 10 秒轮询
    this.healthCheckTimer = setInterval(() => {
      this.probeAllDevices()
    }, HEALTH_CHECK_INTERVAL_MS)
    log.info('[FileTransfer] 设备在线探针已启动，间隔:', HEALTH_CHECK_INTERVAL_MS, 'ms')
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  /**
   * 探针所有已知设备的 /ping 端点，等待所有探针完成后统一广播
   * - 单次探针超时 500ms，所有设备并发，一轮完后再广播
   * - 避免 setTimeout 与异步回调之间的竞态
   * - OFFLINE_THRESHOLD=1，一次无响应即判定离线，+10s 间隔 ≈ 10s 内检测
   */
  private probeAllDevices(): void {
    const probes: Promise<boolean>[] = []

    for (const [, dev] of this.scannedDevices) {
      // 始终探针固定发现端口（17862），发现端口不变，文件传输端口随重启变化
      const probe = this.probeDevice(dev.address, DISCOVERY_PORT).then((info) => {
        if (info) {
          // 设备在线：更新 lastSeen，重置 missCount，清除离线标记
          dev.lastSeen = Date.now()
          // 对方重启后文件传输端口可能变了，从探针响应中更新
          if (info.port !== dev.port) {
            dev.port = info.port
          }
          if (dev.missCount > 0 || dev.offline) {
            dev.missCount = 0
            dev.offline = false
            return true // 状态变化
          }
        } else {
          // 设备无响应
          // 已标红的手动设备不再累加 missCount，静默等恢复
          if (dev.offline) return false

          dev.missCount++
          log.info(`[FileTransfer] 设备探针无响应: ${dev.name}(${dev.address}), missCount=${dev.missCount}`)
          if (dev.missCount >= OFFLINE_THRESHOLD) {
            if (this.isManualDevice(dev.address, dev.port)) {
              dev.offline = true
              log.info('[FileTransfer] 手动设备离线（标红保留）:', dev.name, dev.address)
              return true
            } else {
              // 扫描发现的设备也标红保留，不删除
              // 否则设备重新上线后无法被健康检查重新发现
              dev.offline = true
              dev.missCount = 0
              log.info('[FileTransfer] 扫描设备离线（标红保留）:', dev.name, dev.address)
              return true
            }
          }
        }
        return false // 无变化
      })
      probes.push(probe)
    }

    // 等所有探针结果确定后再广播，避免竞态
    Promise.allSettled(probes).then((results) => {
      const changed = results.some((r) => r.status === 'fulfilled' && r.value === true)
      if (changed) {
        this.broadcast('broadcast:transfer-devices-updated', this.getDevices())
      }
    })
  }

  /**
   * 判断设备是否手动添加（持久化在 settings 中）
   */
  private isManualDevice(address: string, _port: number): boolean {
    const manual = settingsService.getAll().manualDevices || []
    // 仅按 IP 匹配（探针后端口会从 17862 更新为文件传输 HTTP 端口）
    return manual.some((d) => d.address === address)
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
