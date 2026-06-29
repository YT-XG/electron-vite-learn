/**
 * 翻译服务
 * @description 处理翻译 API 调用和翻译历史管理
 * 使用 MyMemory API 提供免费翻译，支持自定义 API 配置
 */
import { app, ipcMain } from 'electron'
import initSqlJs, { Database } from 'sql.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import log from 'electron-log'

/**
 * 翻译历史记录项
 */
export interface TranslateHistoryItem {
  id: number
  source_lang: string
  target_lang: string
  source_text: string
  result_text: string
  created_at: number
}

/**
 * 翻译请求参数
 */
export interface TranslateParams {
  text: string
  sourceLang: string
  targetLang: string
  apiUrl?: string
  apiKey?: string
}

/**
 * 翻译结果
 */
export interface TranslateResult {
  success: boolean
  translatedText?: string
  error?: string
}

/**
 * 翻译服务类
 * @description 使用 sql.js（纯 JS SQLite）存储翻译历史，支持 MyMemory API 翻译
 * 数据持久化到 userData 目录下的 translate.db 文件
 */
class TranslateService {
  /** SQLite 数据库实例 */
  private db: Database | null = null

  /** 数据库文件路径 */
  private dbPath: string = ''

  /**
   * 初始化翻译服务
   * @description 加载 sql.js WASM，创建/打开数据库文件，建表，注册 IPC
   */
  async init(): Promise<void> {
    // 数据库文件存放在 userData 目录
    const userDataPath = app.getPath('userData')
    if (!existsSync(userDataPath)) {
      mkdirSync(userDataPath, { recursive: true })
    }
    this.dbPath = join(userDataPath, 'translate.db')

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
      log.info('[TranslateService] 已加载现有数据库')
    } else {
      this.db = new SQL.Database()
      log.info('[TranslateService] 创建新数据库')
    }

    // 翻译历史记录表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS translate_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_lang TEXT NOT NULL,
        target_lang TEXT NOT NULL,
        source_text TEXT NOT NULL,
        result_text TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `)
    this.db.run(
      'CREATE INDEX IF NOT EXISTS idx_translate_created_at ON translate_history(created_at DESC)'
    )

    this.save()
    this.registerIPC()

    log.info('[TranslateService] 初始化完成，数据库路径:', this.dbPath)
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
   * 调用翻译 API
   * @param params - 翻译请求参数
   * @returns 翻译结果
   */
  async translate(params: TranslateParams): Promise<TranslateResult> {
    const { text, sourceLang, targetLang, apiUrl, apiKey } = params

    if (!text.trim()) {
      return { success: false, error: '请输入要翻译的文本' }
    }

    try {
      const url = apiUrl || 'https://api.mymemory.translated.net/get'
      const queryParams = new URLSearchParams({
        q: text,
        langpair: `${sourceLang}|${targetLang}`
      })

      if (apiKey) {
        queryParams.append('key', apiKey)
      }

      const response = await fetch(`${url}?${queryParams.toString()}`)
      const data = await response.json()

      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        const translatedText = data.responseData.translatedText
        this.saveHistory(sourceLang, targetLang, text, translatedText)
        return { success: true, translatedText }
      } else {
        return { success: false, error: data.responseDetails || '翻译失败' }
      }
    } catch (error) {
      log.error('[TranslateService] 翻译失败:', error)
      return { success: false, error: '网络错误，请检查网络连接' }
    }
  }

  /**
   * 保存翻译历史
   * @param sourceLang - 源语言
   * @param targetLang - 目标语言
   * @param sourceText - 原文
   * @param resultText - 译文
   */
  private saveHistory(
    sourceLang: string,
    targetLang: string,
    sourceText: string,
    resultText: string
  ): void {
    if (!this.db) return
    const now = Date.now()
    this.db.run(
      'INSERT INTO translate_history (source_lang, target_lang, source_text, result_text, created_at) VALUES (?, ?, ?, ?, ?)',
      [sourceLang, targetLang, sourceText, resultText, now]
    )
    this.save()
  }

  /**
   * 获取翻译历史（分页）
   * @param limit - 每页数量
   * @param offset - 偏移量
   * @returns 翻译历史列表（按时间倒序）
   */
  getHistory(limit = 50, offset = 0): TranslateHistoryItem[] {
    if (!this.db) return []
    const result = this.db.exec(
      'SELECT * FROM translate_history ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    )
    return this.parseResult(result)
  }

  /**
   * 删除一条翻译历史
   * @param id - 记录 ID
   */
  delete(id: number): void {
    if (!this.db) return
    this.db.run('DELETE FROM translate_history WHERE id = ?', [id])
    this.save()
  }

  /**
   * 清空所有翻译历史
   */
  clearAll(): void {
    if (!this.db) return
    this.db.run('DELETE FROM translate_history')
    this.save()
  }

  /**
   * 解析 sql.js 查询结果为 TranslateHistoryItem 数组
   * @param result - sql.js exec 返回结果
   * @returns 解析后的记录列表
   */
  private parseResult(result: ReturnType<Database['exec']>): TranslateHistoryItem[] {
    if (!result || result.length === 0) return []
    const columns = result[0].columns
    return result[0].values.map((row) => {
      const item: Record<string, unknown> = {}
      columns.forEach((col, i) => {
        item[col] = row[i]
      })
      return item as unknown as TranslateHistoryItem
    })
  }

  /**
   * 注册 IPC 处理器
   * @description 供渲染进程请求翻译服务
   */
  private registerIPC(): void {
    // 翻译文本
    ipcMain.handle(
      'to-service-TranslateService:translate',
      async (_event, params: TranslateParams) => {
        return this.translate(params)
      }
    )

    // 获取翻译历史（分页）
    ipcMain.handle(
      'to-service-TranslateService:getHistory',
      (_event, limit?: number, offset?: number) => {
        return this.getHistory(limit ?? 50, offset ?? 0)
      }
    )

    // 删除翻译历史
    ipcMain.handle('to-service-TranslateService:delete', (_event, id: number) => {
      this.delete(id)
    })

    // 清空翻译历史
    ipcMain.handle('to-service-TranslateService:clearAll', () => {
      this.clearAll()
    })
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    if (this.db) {
      this.save()
      this.db.close()
      this.db = null
    }
  }
}

/** 翻译服务单例 */
export const translateService = new TranslateService()
