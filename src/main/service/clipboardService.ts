import initSqlJs, { Database } from 'sql.js'
import { app, BrowserWindow, clipboard, ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import log from 'electron-log'
import { popupManager, NoticeNewFrame, windowFactory } from '../frame'
import { inputService } from './inputService'

/**
 * 剪贴板历史记录项
 */
export interface HistoryItem {
  id: number
  content: string
  created_at: number
}

/**
 * 收藏项
 */
export interface FavoriteItem {
  id: number
  content: string
  category: string
  description: string
  created_at: number
}

/**
 * 收藏分类
 */
export interface CategoryItem {
  name: string
  count: number
}

/**
 * 剪贴板历史服务
 * @description 使用 sql.js（纯 JS SQLite）存储剪贴板历史，支持收藏、搜索、分页
 * 数据持久化到 userData 目录下的 clipboard.db 文件
 */
class ClipboardService {
  /** SQLite 数据库实例 */
  private db: Database | null = null

  /** 数据库文件路径 */
  private dbPath: string = ''

  /** 剪贴板监控定时器 */
  private timer: ReturnType<typeof setInterval> | null = null

  /** 上次剪贴板文本（用于去重） */
  private lastText: string = ''

  /** 最大历史记录数 */
  private static readonly MAX_ITEMS = 1000

  /** 历史记录保留天数 */
  private static readonly RETENTION_DAYS = 30

  /**
   * 初始化数据库
   * @description 加载 sql.js WASM，创建/打开数据库文件，建表，启动监控
   */
  async init(): Promise<void> {
    // 数据库文件存放在 userData 目录
    const userDataPath = app.getPath('userData')
    if (!existsSync(userDataPath)) {
      mkdirSync(userDataPath, { recursive: true })
    }
    this.dbPath = join(userDataPath, 'clipboard.db')

    // 初始化 sql.js，指定 WASM 文件位置
    const SQL = await initSqlJs({
      locateFile: (file: string): string => {
        // 开发模式和打包后都能找到 WASM 文件
        return join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', file)
      }
    })

    // 如果数据库文件已存在则加载，否则新建
    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath)
      this.db = new SQL.Database(buffer)
      log.info('[ClipboardService] 已加载现有数据库')
    } else {
      this.db = new SQL.Database()
      log.info('[ClipboardService] 创建新数据库')
    }

    // 历史记录表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS clipboard_history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        content    TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `)
    this.db.run('CREATE INDEX IF NOT EXISTS idx_created_at ON clipboard_history(created_at DESC)')

    // 收藏表（独立存储，支持手动添加和分类）
    this.db.run(`
      CREATE TABLE IF NOT EXISTS favorites (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        content     TEXT NOT NULL,
        category    TEXT DEFAULT '',
        description TEXT DEFAULT '',
        created_at  INTEGER NOT NULL
      )
    `)
    this.db.run('CREATE INDEX IF NOT EXISTS idx_fav_category ON favorites(category)')
    this.db.run('CREATE INDEX IF NOT EXISTS idx_fav_created_at ON favorites(created_at DESC)')

    this.save()

    // 注册 IPC 处理器
    this.registerIPC()

    // 启动剪贴板监控
    this.start()

    // 启动时清理过期数据
    this.autoCleanup()

    log.info('[ClipboardService] 初始化完成，数据库路径:', this.dbPath)
  }

  /**
   * 将内存中的数据库写入磁盘
   */
  private save(): void {
    if (!this.db) return
    const data = this.db.export()
    writeFileSync(this.dbPath, Buffer.from(data))
  }

  /**
   * 启动剪贴板监控
   * @description 每秒检查剪贴板变化，新内容存入数据库并推送到渲染进程
   */
  private start(): void {
    this.lastText = clipboard.readText()

    this.timer = setInterval(() => {
      const currentText = clipboard.readText()
      if (currentText && currentText !== this.lastText) {
        this.lastText = currentText
        this.insert(currentText)
      }
    }, 1000)
  }

  /**
   * 插入一条剪贴板记录
   * @description 自动去重（与最近一条相同则跳过），超限时清理最旧数据
   * @param content - 剪贴板文本内容
   */
  private insert(content: string): void {
    if (!this.db) return

    // 去重：如果与最近一条内容相同，跳过
    const lastItem = this.db.exec(
      'SELECT content FROM clipboard_history ORDER BY created_at DESC LIMIT 1'
    )
    if (lastItem.length > 0 && lastItem[0].values[0][0] === content) {
      return
    }

    const now = Date.now()
    this.db.run('INSERT INTO clipboard_history (content, created_at) VALUES (?, ?)', [content, now])

    // 超出最大数量时删除最旧的
    const countResult = this.db.exec('SELECT COUNT(*) FROM clipboard_history')
    const count = countResult[0].values[0][0] as number
    if (count > ClipboardService.MAX_ITEMS) {
      this.db.run(
        `DELETE FROM clipboard_history WHERE id IN (
          SELECT id FROM clipboard_history ORDER BY created_at ASC LIMIT ?
        )`,
        [count - ClipboardService.MAX_ITEMS]
      )
    }

    this.save()

    // 推送通知给所有可见窗口
    const newItem: HistoryItem = {
      id: (this.db.exec('SELECT last_insert_rowid()')?.[0]?.values[0]?.[0] as number) || 0,
      content,
      created_at: now
    }
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed() && w.isVisible()) {
        w.webContents.send('broadcast:clipboard-new', newItem)
      }
    })

    // 弹出通知弹窗（显示翻译按钮）
    popupManager.showNotice(
      () => {
        const frame = new NoticeNewFrame()
        frame.setMsg(content, true)
        return frame.create()
      },
      { type: 'notice', width: 500, height: 60 },
      { text: content, showTranslate: true, duration: 5000 }
    )

    log.info('[ClipboardService] 新增记录:', content.substring(0, 50))
  }
  /**
   * 获取历史记录（分页）
   * @param limit - 每页数量
   * @param offset - 偏移量
   * @returns 历史记录列表（按时间倒序）
   */
  getAll(limit = 50, offset = 0): HistoryItem[] {
    if (!this.db) return []
    const result = this.db.exec(
      'SELECT * FROM clipboard_history ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    )
    return this.parseResult(result)
  }

  /**
   * 获取收藏列表
   * @returns 所有收藏记录（按时间倒序）
   */
  getFavorites(): FavoriteItem[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM favorites ORDER BY created_at DESC')
    return this.parseFavoritesResult(result)
  }

  /**
   * 按分类获取收藏列表
   * @param category - 分类名称
   * @returns 指定分类的收藏记录
   */
  getFavoritesByCategory(category: string): FavoriteItem[] {
    if (!this.db) return []
    const result = this.db.exec(
      'SELECT * FROM favorites WHERE category = ? ORDER BY created_at DESC',
      [category]
    )
    return this.parseFavoritesResult(result)
  }

  /**
   * 获取所有分类及其数量
   * @returns 分类列表
   */
  getCategories(): CategoryItem[] {
    if (!this.db) return []
    const result = this.db.exec(
      'SELECT category, COUNT(*) as count FROM favorites GROUP BY category ORDER BY category'
    )
    if (!result || result.length === 0) return []
    return result[0].values.map((row) => ({
      name: (row[0] as string) || '',
      count: row[1] as number
    }))
  }

  /**
   * 添加收藏
   * @param content - 内容
   * @param category - 分类
   * @param description - 描述（可选）
   * @returns 新添加的收藏 ID
   */
  addFavorite(content: string, category: string = '', description: string = ''): number {
    if (!this.db) return 0
    const now = Date.now()
    this.db.run(
      'INSERT INTO favorites (content, category, description, created_at) VALUES (?, ?, ?, ?)',
      [content, category, description, now]
    )
    this.save()
    const id = this.db.exec('SELECT last_insert_rowid()')?.[0]?.values[0]?.[0] as number
    log.info('[ClipboardService] 新增收藏:', content.substring(0, 50))
    return id
  }

  /**
   * 更新收藏
   * @param id - 收藏 ID
   * @param content - 内容
   * @param category - 分类
   * @param description - 描述
   */
  updateFavorite(id: number, content: string, category: string, description: string): void {
    if (!this.db) return
    this.db.run('UPDATE favorites SET content = ?, category = ?, description = ? WHERE id = ?', [
      content,
      category,
      description,
      id
    ])
    this.save()
  }

  /**
   * 删除收藏
   * @param id - 收藏 ID
   */
  deleteFavorite(id: number): void {
    if (!this.db) return
    this.db.run('DELETE FROM favorites WHERE id = ?', [id])
    this.save()
  }

  /**
   * 清空所有收藏
   */
  clearAllFavorites(): void {
    if (!this.db) return
    this.db.run('DELETE FROM favorites')
    this.save()
  }

  /**
   * 搜索历史记录
   * @param keyword - 搜索关键词
   * @returns 匹配的记录列表
   */
  search(keyword: string): HistoryItem[] {
    if (!this.db) return []
    const result = this.db.exec(
      'SELECT * FROM clipboard_history WHERE content LIKE ? ORDER BY created_at DESC',
      [`%${keyword}%`]
    )
    return this.parseResult(result)
  }

  /**
   * 删除一条历史记录
   * @param id - 记录 ID
   */
  delete(id: number): void {
    if (!this.db) return
    this.db.run('DELETE FROM clipboard_history WHERE id = ?', [id])
    this.save()
  }

  /**
   * 清空所有历史记录
   */
  clearAll(): void {
    if (!this.db) return
    this.db.run('DELETE FROM clipboard_history')
    this.save()
  }

  /**
   * 清理过期数据
   * @description 删除超过保留天数的记录
   */
  private autoCleanup(): void {
    if (!this.db) return
    const cutoff = Date.now() - ClipboardService.RETENTION_DAYS * 24 * 60 * 60 * 1000
    this.db.run('DELETE FROM clipboard_history WHERE created_at < ?', [cutoff])
    this.save()
  }

  /**
   * 解析 sql.js 查询结果为 HistoryItem 数组
   * @param result - sql.js exec 返回结果
   * @returns 解析后的记录列表
   */
  private parseResult(result: ReturnType<Database['exec']>): HistoryItem[] {
    if (!result || result.length === 0) return []
    const columns = result[0].columns
    return result[0].values.map((row) => {
      const item: Record<string, unknown> = {}
      columns.forEach((col, i) => {
        item[col] = row[i]
      })
      return item as unknown as HistoryItem
    })
  }

  /**
   * 解析 sql.js 查询结果为 FavoriteItem 数组
   * @param result - sql.js exec 返回结果
   * @returns 解析后的收藏记录列表
   */
  private parseFavoritesResult(result: ReturnType<Database['exec']>): FavoriteItem[] {
    if (!result || result.length === 0) return []
    const columns = result[0].columns
    return result[0].values.map((row) => {
      const item: Record<string, unknown> = {}
      columns.forEach((col, i) => {
        item[col] = row[i]
      })
      return item as unknown as FavoriteItem
    })
  }

  /**
   * 注册 IPC 处理器
   * @description 供渲染进程请求剪贴板数据
   */
  private registerIPC(): void {
    // 获取历史记录（分页）
    ipcMain.handle(
      'to-service-ClipboardService:getHistory',
      (_event, limit?: number, offset?: number) => {
        return this.getAll(limit ?? 50, offset ?? 0)
      }
    )

    // 搜索历史记录
    ipcMain.handle('to-service-ClipboardService:searchHistory', (_event, keyword: string) => {
      return this.search(keyword)
    })

    // 删除历史记录
    ipcMain.handle('to-service-ClipboardService:deleteHistory', (_event, id: number) => {
      this.delete(id)
    })

    // 清空历史记录
    ipcMain.handle('to-service-ClipboardService:clearHistory', () => {
      this.clearAll()
    })

    // 点击历史记录项（复制并粘贴）
    ipcMain.handle('to-service-ClipboardService:clickItem', async (_event, content: string) => {
      // 写入系统剪贴板 + 同步监控缓存（避免触发通知弹窗）
      clipboard.writeText(content)
      this.syncMonitorCache()

      // 获取并隐藏主页面窗口
      const mainPageFrame = windowFactory.getMainPageFrame()
      mainPageFrame.minimizeForPaste()

      // 等待焦点切换后执行粘贴
      await new Promise((resolve) => setTimeout(resolve, 150))
      await inputService.pasteToPreviousWindow()
    })

    // 获取收藏列表
    ipcMain.handle('to-service-ClipboardService:getFavorites', () => {
      return this.getFavorites()
    })

    // 按分类获取收藏列表
    ipcMain.handle(
      'to-service-ClipboardService:getFavoritesByCategory',
      (_event, category: string) => {
        return this.getFavoritesByCategory(category)
      }
    )

    // 获取所有分类
    ipcMain.handle('to-service-ClipboardService:getCategories', () => {
      return this.getCategories()
    })

    // 添加收藏
    ipcMain.handle(
      'to-service-ClipboardService:addFavorite',
      (_event, content: string, category: string, description: string) => {
        return this.addFavorite(content, category, description)
      }
    )

    // 更新收藏
    ipcMain.handle(
      'to-service-ClipboardService:updateFavorite',
      (_event, id: number, content: string, category: string, description: string) => {
        this.updateFavorite(id, content, category, description)
      }
    )

    // 删除收藏
    ipcMain.handle('to-service-ClipboardService:deleteFavorite', (_event, id: number) => {
      this.deleteFavorite(id)
    })

    // 清空收藏
    ipcMain.handle('to-service-ClipboardService:clearFavorites', () => {
      this.clearAllFavorites()
    })
  }

  /**
   * 停止服务（清理定时器）
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.db) {
      this.save()
      this.db.close()
      this.db = null
    }
  }

  /**
   * 同步监控缓存
   * @description 在主动写入剪贴板后调用，更新 lastText 为当前内容
   * 避免剪贴板监控器将本次主动写入当作"新复制"处理，从而触发通知弹窗
   *
   * 参考 copy-creator 的 clipboard::sync_monitor_cache()
   */
  syncMonitorCache(): void {
    this.lastText = clipboard.readText()
  }
}

/** 剪贴板历史服务单例 */
export const clipboardService = new ClipboardService()
