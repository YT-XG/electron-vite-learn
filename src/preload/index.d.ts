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
 * IPC 频道类型定义
 */
interface IPCChannels {
  // 历史记录
  invoke(channel: 'clipboard-history:get', limit?: number, offset?: number): Promise<HistoryItem[]>
  invoke(channel: 'clipboard-history:search', keyword: string): Promise<HistoryItem[]>
  invoke(channel: 'clipboard-history:delete', id: number): Promise<void>
  invoke(channel: 'clipboard-history:clearAll'): Promise<void>
  invoke(channel: 'clipboard-write', content: string): Promise<void>

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
