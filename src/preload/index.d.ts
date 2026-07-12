import { ElectronAPI } from '@electron-toolkit/preload'

/**
 * 历史记录项类型
 */
interface HistoryItem {
  id: number
  content: string
  created_at: number
}

/**
 * 收藏项类型
 */
interface FavoriteItem {
  id: number
  content: string
  category: string
  description: string
  created_at: number
}

/**
 * 分类项类型
 */
interface CategoryItem {
  name: string
  count: number
}

/**
 * 应用设置类型
 */
interface AppSettings {
  /** Electron accelerator 格式的全局快捷键 */
  shortcut: string
  /** 片段选择器快捷键 */
  snippetShortcut: string
  /** 搜索框快捷键 */
  searchBoxShortcut: string
  /** 局域网更新服务器路径 */
  serverUrl: string
  /** 开机自启动 */
  autoStart: boolean
  /** 翻译 API 地址（可选） */
  translateApiUrl?: string
  /** 翻译 API Key（可选） */
  translateApiKey?: string
  /** 更新源：lan（局域网）或 github */
  updateSource: 'lan' | 'github'
  /** GitHub 仓库地址 */
  githubRepo: string
  /** 下载线程数 */
  downloadThreads: number
  /** 文件互传接收目录 */
  transferSaveDir: string
  /** 文件互传设备名称 */
  transferDeviceName: string
  /** TCP 跨子网扫描网段列表 */
  scanSubnets: string[]
  /** 手动添加的设备列表 */
  manualDevices: { address: string; port: number }[]
  /** Claude Code 状态通知开关 */
  showClaudeStatus: boolean
  /** 文件资源管理器右键菜单集成 */
  shellIntegration?: boolean
  /** 剪贴板历史保留天数 */
  clipboardRetentionDays: number
}

/**
 * IPC 频道类型定义
 * @description 此接口类型化 ipcRenderer.invoke/send/on/removeListener 方法，
 *              以便在渲染进程中获得频道名和参数的类型提示。
 */
interface IPCChannels {
  // 历史记录
  invoke(channel: 'clipboard-history:get', limit?: number, offset?: number): Promise<HistoryItem[]>
  invoke(channel: 'clipboard-history:search', keyword: string): Promise<HistoryItem[]>
  invoke(channel: 'clipboard-history:delete', id: number): Promise<void>
  invoke(channel: 'clipboard-history:clearAll'): Promise<void>
  invoke(channel: 'clipboard-write', content: string): Promise<void>
  invoke(channel: 'clipboard:click-item', content: string): Promise<void>

  // 历史记录总数
  invoke(channel: 'to-service-ClipboardService:getHistoryCount'): Promise<number>

  // 收藏
  invoke(channel: 'favorites:getAll'): Promise<FavoriteItem[]>
  invoke(channel: 'favorites:getByCategory', category: string): Promise<FavoriteItem[]>
  invoke(channel: 'favorites:getCategories'): Promise<CategoryItem[]>
  invoke(channel: 'favorites:add', content: string, category: string, description: string): Promise<number>
  invoke(channel: 'favorites:update', id: number, content: string, category: string, description: string): Promise<void>
  invoke(channel: 'favorites:delete', id: number): Promise<void>
  invoke(channel: 'favorites:clearAll'): Promise<void>

  // 窗口控制
  send(channel: 'main-page:minimize'): void
  send(channel: 'close-window'): void

  // 设置
  invoke(channel: 'to-service-SettingsService:get'): Promise<AppSettings>
  invoke(channel: 'to-service-SettingsService:update', settings: Partial<AppSettings>): Promise<void>

  // Claude Code 监控
  invoke(channel: 'to-service-ClaudeCodeService:installHook'): Promise<{ success: boolean; message: string }>
  invoke(channel: 'to-service-ClaudeCodeService:uninstallHook'): Promise<{ success: boolean; message: string }>
  invoke(channel: 'to-service-ClaudeCodeService:resolvePermission', sessionId: string, decision: 'allow' | 'always' | 'deny'): Promise<void>
  invoke(channel: 'to-service-ClaudeCodeService:isInstalled'): Promise<boolean>
  invoke(channel: 'to-service-ClaudeCodeService:isRunning'): Promise<boolean>
  send(channel: 'to-main-PermissionNoticeFrame:resolve', sessionId: string, decision: 'allow' | 'always' | 'deny'): void

  // 监听
  on(channel: 'clipboard-history:new', listener: (event: unknown, item: HistoryItem) => void): void
  removeListener(channel: 'clipboard-history:new', listener: (event: unknown, item: HistoryItem) => void): void

  // 文件互传
  invoke(channel: 'to-service-FileTransferService:getDevices'): Promise<DeviceInfo[]>
  invoke(channel: 'to-service-FileTransferService:sendRequest', target: DeviceInfo, files: FileEntry[]): Promise<string>
  invoke(channel: 'to-service-FileTransferService:respondToRequest', requestId: string, action: 'accept' | 'reject', saveDir: string): Promise<void>
  invoke(channel: 'to-service-FileTransferService:getRecords'): Promise<TransferRecord[]>
  invoke(channel: 'to-service-FileTransferService:pickFiles'): Promise<FileEntry[]>
  invoke(channel: 'to-service-FileTransferService:cancelTransfer', recordId: string): Promise<void>
  invoke(channel: 'to-service-FileTransferService:cancelRemoteTransfer', targetAddress: string, targetPort: number, requestId: string): Promise<void>
  invoke(channel: 'to-service-FileTransferService:getServerInfo'): Promise<{
    name: string
    address: string
    port: number
    /** 所有 IPv4 地址 */
    ipv4: string[]
    /** 所有 IPv6 地址 */
    ipv6: string[]
    /** 所有地址（不分协议） */
    all: string[]
  }>
  invoke(channel: 'to-service-FileTransferService:pickDirectory'): Promise<string | null>
  invoke(channel: 'to-service-FileTransferService:getScanSubnets'): Promise<string[]>
  invoke(channel: 'to-service-FileTransferService:setScanSubnets', subnets: string[]): Promise<{ ok: boolean }>
  invoke(channel: 'to-service-FileTransferService:addDevice', address: string, port: number): Promise<boolean>
  invoke(channel: 'to-service-FileTransferService:getManualDevices'): Promise<{ address: string; port: number }[]>
  invoke(channel: 'to-service-FileTransferService:removeManualDevice', address: string, port: number): Promise<void>
  invoke(channel: 'to-service-FileTransferService:scanNow'): Promise<{ ok: boolean }>
  on(channel: 'broadcast:transfer-devices-updated', listener: (event: unknown, devices: DeviceInfo[]) => void): void
  on(channel: 'broadcast:transfer-records-updated', listener: (event: unknown, records: TransferRecord[]) => void): void
  on(channel: 'broadcast:transfer-request', listener: (event: unknown, request: TransferRequestInfo) => void): void
  on(channel: 'broadcast:transfer-scan-completed', listener: (event: unknown) => void): void
  removeListener(channel: 'broadcast:transfer-devices-updated', listener: (...args: unknown[]) => void): void
  removeListener(channel: 'broadcast:transfer-records-updated', listener: (...args: unknown[]) => void): void
  removeListener(channel: 'broadcast:transfer-request', listener: (...args: unknown[]) => void): void
  removeListener(channel: 'broadcast:transfer-scan-completed', listener: (...args: unknown[]) => void): void

  // 文本分享
  invoke(channel: 'to-service-TextShareService:getOnlineDevices'): Promise<DeviceInfo[]>
  invoke(channel: 'to-service-TextShareService:sendText', target: DeviceInfo, text: string): Promise<boolean>
  invoke(channel: 'to-service-TextShareService:getLastReceivedText'): Promise<ReceivedTextInfo | null>
  on(channel: 'broadcast:text-received', listener: (event: unknown, info: ReceivedTextInfo) => void): void
  removeListener(channel: 'broadcast:text-received', listener: (...args: unknown[]) => void): void

  // 通知按钮
  send(channel: 'to-main-NoticeNewFrame:share', text: string): void
  send(channel: 'to-main-NoticeNewFrame:copyReceivedText', text: string): void
  send(channel: 'to-main-NoticeNewFrame:closeReceivedText'): void

  // ShareSelect Frame
  on(channel: 'to-renderer-ShareSelectFrame:show', listener: (event: unknown, data: { text: string; devices: DeviceInfo[] }) => void): void
  on(channel: 'to-renderer-ShareSelectFrame:animate', listener: (event: unknown, data: { action: 'enter' | 'exit' }) => void): void
  on(channel: 'to-renderer-ShareSelectFrame:sendResult', listener: (event: unknown, data: { success: boolean; error?: string }) => void): void
  send(channel: 'to-main-ShareSelectFrame:ready'): void
  send(channel: 'to-main-ShareSelectFrame:sendText', target: DeviceInfo): void
  send(channel: 'to-main-ShareSelectFrame:close'): void
  send(channel: 'to-main-ShareSelectFrame:mouse-enter-card'): void
  send(channel: 'to-main-ShareSelectFrame:mouse-leave-card'): void
  removeListener(channel: 'to-renderer-ShareSelectFrame:show', listener: (...args: unknown[]) => void): void
  removeListener(channel: 'to-renderer-ShareSelectFrame:animate', listener: (...args: unknown[]) => void): void

  // QuickShare Frame
  on(channel: 'to-renderer-QuickShareFrame:show', listener: (event: unknown, data: { files: FileEntry[]; devices: DeviceInfo[] }) => void): void
  on(channel: 'to-renderer-QuickShareFrame:animate', listener: (event: unknown, data: { action: 'enter' | 'exit' }) => void): void
  on(channel: 'to-renderer-QuickShareFrame:sendResult', listener: (event: unknown, data: { success: boolean; error?: string }) => void): void
  send(channel: 'to-main-QuickShareFrame:ready'): void
  send(channel: 'to-main-QuickShareFrame:show-window'): void
  send(channel: 'to-main-QuickShareFrame:sendFiles', target: DeviceInfo): void
  send(channel: 'to-main-QuickShareFrame:mouse-enter-card'): void
  send(channel: 'to-main-QuickShareFrame:mouse-leave-card'): void
  send(channel: 'to-main-QuickShareFrame:drag-move', delta: { dx: number; dy: number }): void
  send(channel: 'to-main-QuickShareFrame:close'): void
  removeListener(channel: 'to-renderer-QuickShareFrame:show', listener: (...args: unknown[]) => void): void
  removeListener(channel: 'to-renderer-QuickShareFrame:animate', listener: (...args: unknown[]) => void): void
  removeListener(channel: 'to-renderer-QuickShareFrame:sendResult', listener: (...args: unknown[]) => void): void
}

/** ipcRenderer 在 ElectronAPI 类型基础上叠加 IPCChannels 的类型约束 */
type TypedIpcRenderer = ElectronAPI['ipcRenderer'] & {
  invoke: IPCChannels['invoke']
  send: IPCChannels['send']
  on: IPCChannels['on']
  removeListener: IPCChannels['removeListener']
}

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

interface ReceivedTextInfo {
  text: string
  senderName: string
  senderAddress: string
  timestamp: number
}

declare global {
  interface Window {
    electron: ElectronAPI & { ipcRenderer: TypedIpcRenderer }
  }
}

// 导出类型供其他文件使用
export type { HistoryItem, FavoriteItem, CategoryItem, AppSettings, DeviceInfo, FileEntry, TransferRecord, TransferRequestInfo, ReceivedTextInfo }
