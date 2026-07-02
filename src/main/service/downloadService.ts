/**
 * 下载服务
 * @description 封装下载引擎，提供全局单例、任务持久化和 IPC 接口
 */

import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import log from 'electron-log'
import {
  MultiThreadDownloadEngine,
  type DownloadTaskSnapshot,
  type StartDownloadOptions,
} from '../core/downloadEngine'

/** 最大持久化任务数 */
const MAX_PERSISTED_TASKS = 200

/** 持久化防抖间隔（毫秒） */
const PERSIST_DEBOUNCE_MS = 600

/** 检查任务状态是否合法 */
function isDownloadTaskStatus(value: unknown): value is DownloadTaskSnapshot['status'] {
  return value === 'downloading' || value === 'paused' || value === 'completed' || value === 'failed' || value === 'canceled'
}

/** 转换为可持久化的任务格式 */
function toPersistableTask(raw: unknown): DownloadTaskSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (
    typeof row.id !== 'string'
    || typeof row.url !== 'string'
    || typeof row.savePath !== 'string'
    || typeof row.fileName !== 'string'
    || typeof row.totalBytes !== 'number'
    || typeof row.downloadedBytes !== 'number'
    || typeof row.progress !== 'number'
    || typeof row.speedBytesPerSecond !== 'number'
    || (row.estimatedFinishAt !== null && typeof row.estimatedFinishAt !== 'number')
    || typeof row.threads !== 'number'
    || !isDownloadTaskStatus(row.status)
    || typeof row.createdAt !== 'number'
    || typeof row.updatedAt !== 'number'
  ) {
    return null
  }
  return {
    id: row.id,
    url: row.url,
    savePath: row.savePath,
    fileName: row.fileName,
    totalBytes: row.totalBytes,
    downloadedBytes: row.downloadedBytes,
    progress: row.progress,
    speedBytesPerSecond: row.speedBytesPerSecond,
    estimatedFinishAt: row.estimatedFinishAt,
    threads: row.threads,
    status: row.status,
    errorMessage: typeof row.errorMessage === 'string' ? row.errorMessage : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** 按创建时间倒序排列任务 */
function sortTasks(tasks: DownloadTaskSnapshot[]): DownloadTaskSnapshot[] {
  return tasks.slice().sort((a, b) => b.createdAt - a.createdAt)
}

/** 标准化加载的任务列表 */
function normalizeLoadedTasks(raw: unknown): DownloadTaskSnapshot[] {
  if (!Array.isArray(raw)) return []
  const now = Date.now()
  const list: DownloadTaskSnapshot[] = []
  const seen = new Set<string>()
  raw.forEach((item) => {
    const task = toPersistableTask(item)
    if (!task) return
    if (seen.has(task.id)) return
    seen.add(task.id)
    if (task.status === 'downloading') {
      task.status = 'failed'
      task.speedBytesPerSecond = 0
      task.estimatedFinishAt = null
      task.errorMessage = task.errorMessage || '应用重启后任务中断'
      task.updatedAt = now
    }
    list.push(task)
  })
  return sortTasks(list).slice(0, MAX_PERSISTED_TASKS)
}

/** 加载持久化的任务列表 */
function loadPersistedTasks(storePath: string): DownloadTaskSnapshot[] {
  try {
    if (!existsSync(storePath)) return []
    const content = readFileSync(storePath, 'utf-8')
    if (!content.trim()) return []
    const parsed = JSON.parse(content)
    return normalizeLoadedTasks(parsed)
  } catch (error) {
    log.error('[Download] load persisted tasks error:', error)
    return []
  }
}

/** 保存任务列表到持久化存储 */
function savePersistedTasks(storePath: string, tasks: DownloadTaskSnapshot[]): void {
  try {
    mkdirSync(dirname(storePath), { recursive: true })
    writeFileSync(storePath, JSON.stringify(sortTasks(tasks).slice(0, MAX_PERSISTED_TASKS), null, 2), 'utf-8')
  } catch (error) {
    log.error('[Download] save persisted tasks error:', error)
  }
}

/** 标准化线程数参数 */
function sanitizeThreads(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 8
  return Math.max(1, Math.min(16, Math.floor(value)))
}

/** 清洗建议的文件名 */
function sanitizeSuggestedName(input: unknown): string {
  if (typeof input !== 'string') return `download-${Date.now()}.bin`
  const safe = input.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
  return safe || `download-${Date.now()}.bin`
}

/** 标准化开始下载的参数 */
function normalizeStartPayload(payload: unknown): { url: string; savePath?: string; threads: number } {
  const row = (payload ?? {}) as { url?: unknown; savePath?: unknown; threads?: unknown }
  const url = typeof row.url === 'string' ? row.url.trim() : ''
  const savePath = typeof row.savePath === 'string' ? row.savePath.trim() : ''
  const threads = sanitizeThreads(row.threads)
  return {
    url,
    savePath: savePath || undefined,
    threads,
  }
}

/**
 * 下载服务类
 * @description 全局单例，管理下载任务的生命周期、持久化和 IPC 通信
 */
class DownloadService {
  /** 下载引擎实例 */
  private engine: MultiThreadDownloadEngine | null = null

  /** 任务存储路径 */
  private taskStorePath: string = ''

  /** 任务快照映射表 */
  private taskSnapshotMap: Map<string, DownloadTaskSnapshot> = new Map()

  /** 持久化定时器 */
  private persistTimer: NodeJS.Timeout | null = null

  /** 是否已初始化 */
  private initialized = false

  /**
   * 初始化下载服务
   * @description 注册 IPC 处理器，加载持久化任务
   */
  init(): void {
    if (this.initialized) return
    this.initialized = true

    this.taskStorePath = join(app.getPath('userData'), 'download-tasks.json')

    // 加载持久化的任务
    loadPersistedTasks(this.taskStorePath).forEach((task) => {
      this.taskSnapshotMap.set(task.id, task)
    })

    // 创建下载引擎
    this.engine = new MultiThreadDownloadEngine({
      onTaskUpdated: (task) => this.emitToRenderer(task),
    })

    // 注册 IPC 处理器
    this.registerIPC()

    log.info('[Download] 服务初始化完成，已加载', this.taskSnapshotMap.size, '个任务')
  }

  /**
   * 开始下载任务
   * @param options - 下载选项
   * @returns 任务快照
   */
  async startDownload(options: StartDownloadOptions): Promise<DownloadTaskSnapshot> {
    if (!this.engine) {
      throw new Error('下载服务未初始化')
    }
    return this.engine.startDownload(options)
  }

  /**
   * 暂停下载任务
   * @param taskId - 任务ID
   * @returns 是否成功暂停
   */
  pauseDownload(taskId: string): boolean {
    if (!this.engine) return false
    return this.engine.pauseDownload(taskId)
  }

  /**
   * 恢复下载任务
   * @param taskId - 任务ID
   * @returns 任务快照
   */
  async resumeDownload(taskId: string): Promise<DownloadTaskSnapshot> {
    if (!this.engine) {
      throw new Error('下载服务未初始化')
    }
    return this.engine.resumeDownload(taskId)
  }

  /**
   * 取消下载任务
   * @param taskId - 任务ID
   * @returns 是否成功取消
   */
  cancelDownload(taskId: string): boolean {
    if (!this.engine) return false
    return this.engine.cancelDownload(taskId)
  }

  /**
   * 移除任务
   * @param taskId - 任务ID
   * @returns 是否成功移除
   */
  removeTask(taskId: string): boolean {
    if (!this.engine) return false
    const snapshot = this.taskSnapshotMap.get(taskId)
    if (!snapshot) return false

    const removedFromEngine = this.engine.removeTask(taskId)
    if (!removedFromEngine && snapshot.status === 'downloading') {
      return false
    }

    this.taskSnapshotMap.delete(taskId)
    this.schedulePersist()
    return true
  }

  /**
   * 获取所有任务列表
   * @returns 任务快照数组
   */
  listTasks(): DownloadTaskSnapshot[] {
    return sortTasks(Array.from(this.taskSnapshotMap.values()))
  }

  /**
   * 获取单个任务详情
   * @param taskId - 任务ID
   * @returns 任务快照，不存在返回 null
   */
  getTask(taskId: string): DownloadTaskSnapshot | null {
    return this.taskSnapshotMap.get(taskId) ?? null
  }

  /**
   * 获取默认下载目录
   * @returns 下载目录路径
   */
  getDefaultDir(): string {
    return app.getPath('downloads')
  }

  /**
   * 注册 IPC 处理器
   */
  private registerIPC(): void {
    // 开始下载
    ipcMain.handle('download:start', async (_event, payload: unknown) => {
      try {
        const normalized = normalizeStartPayload(payload)
        if (!normalized.url) {
          return { ok: false, message: '下载地址不能为空' } as const
        }
        const task = await this.engine!.startDownload({
          url: normalized.url,
          savePath: normalized.savePath,
          threads: normalized.threads,
          defaultDir: this.getDefaultDir(),
        })
        this.upsertTaskSnapshot(task)
        this.schedulePersist()
        return { ok: true, task } as const
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, message } as const
      }
    })

    // 暂停下载
    ipcMain.handle('download:pause', (_event, taskId: unknown) => {
      const id = typeof taskId === 'string' ? taskId.trim() : ''
      if (!id) return false
      return this.engine!.pauseDownload(id)
    })

    // 恢复下载
    ipcMain.handle('download:resume', async (_event, taskId: unknown) => {
      try {
        const id = typeof taskId === 'string' ? taskId.trim() : ''
        if (!id) return { ok: false, message: '任务标识不能为空' } as const
        const task = await this.engine!.resumeDownload(id)
        this.upsertTaskSnapshot(task)
        this.schedulePersist()
        return { ok: true, task } as const
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, message } as const
      }
    })

    // 取消下载
    ipcMain.handle('download:cancel', (_event, taskId: unknown) => {
      const id = typeof taskId === 'string' ? taskId.trim() : ''
      if (!id) return false
      return this.engine!.cancelDownload(id)
    })

    // 移除任务
    ipcMain.handle('download:remove', (_event, taskId: unknown) => {
      const id = typeof taskId === 'string' ? taskId.trim() : ''
      if (!id) return false
      return this.removeTask(id)
    })

    // 获取任务列表
    ipcMain.handle('download:list', () => {
      return this.listTasks()
    })

    // 获取单个任务详情
    ipcMain.handle('download:get', (_event, taskId: unknown) => {
      const id = typeof taskId === 'string' ? taskId.trim() : ''
      if (!id) return null
      return this.getTask(id)
    })

    // 选择保存路径
    ipcMain.handle('download:pick-save-path', async (event, suggestedName: unknown) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()
        if (!win) return null
        const fileName = sanitizeSuggestedName(suggestedName)
        const result = await dialog.showSaveDialog(win, {
          title: '选择保存位置',
          defaultPath: join(this.getDefaultDir(), fileName),
        })
        if (result.canceled) return null
        return result.filePath ?? null
      } catch (error) {
        log.error('[Download] pick save path error:', error)
        return null
      }
    })

    // 获取默认下载目录
    ipcMain.handle('download:get-default-dir', () => {
      return this.getDefaultDir()
    })
  }

  /**
   * 更新任务快照
   * @param task - 任务快照
   */
  private upsertTaskSnapshot(task: DownloadTaskSnapshot): void {
    this.taskSnapshotMap.set(task.id, task)
    if (this.taskSnapshotMap.size <= MAX_PERSISTED_TASKS) return
    const trimmed = sortTasks(Array.from(this.taskSnapshotMap.values())).slice(0, MAX_PERSISTED_TASKS)
    this.taskSnapshotMap.clear()
    trimmed.forEach((item) => this.taskSnapshotMap.set(item.id, item))
  }

  /**
   * 推送任务更新到渲染进程
   * @param task - 任务快照
   */
  private emitToRenderer(task: DownloadTaskSnapshot): void {
    this.upsertTaskSnapshot(task)
    this.schedulePersist()
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win.isDestroyed()) return
      try {
        win.webContents.send('download:task-updated', task)
      } catch {
        // ignore
      }
    })
  }

  /**
   * 调度持久化保存
   */
  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.persistSnapshots()
    }, PERSIST_DEBOUNCE_MS)
  }

  /**
   * 执行持久化保存
   */
  private persistSnapshots(): void {
    const tasks = Array.from(this.taskSnapshotMap.values())
    savePersistedTasks(this.taskStorePath, tasks)
  }
}

/** 下载服务单例 */
export const downloadService = new DownloadService()
