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
  /** 局域网更新服务器 UNC 路径 */
  serverUrl: string
}

/**
 * IPC 频道类型定义
 */
interface IPCChannels {
  // 历史记录
  invoke(channel: 'clipboard-history:get', limit?: number, offset?: number): Promise<HistoryItem[]>
  invoke(channel: 'clipboard-history:search', keyword: string): Promise<HistoryItem[]>
  invoke(channel: 'clipboard-history:delete', id: number): Promise<void>
  invoke(channel: 'clipboard-history:clearAll'): Promise<void>
  invoke(channel: 'clipboard-write', content: string): Promise<void>
  invoke(channel: 'clipboard:click-item', content: string): Promise<void>

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
  invoke(channel: 'settings:get'): Promise<AppSettings>
  invoke(channel: 'settings:update', settings: Partial<AppSettings>): Promise<void>

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
}

declare global {
  interface Window {
    electron: ElectronAPI & IPCChannels
    api: unknown
  }
}
