/**
 * 多线程下载引擎核心实现
 */

import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, open, rename, rm, stat, unlink } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'
import { EMIT_INTERVAL_MS } from './config'
import {
  buildChunks,
  inferFileNameFromUrl,
  isAbortError,
  mergePartFiles,
  normalizeThreads,
  parseContentDispositionFileName,
  safeFileName,
  type ChunkInfo,
} from './utils'

/** 下载任务状态 */
export type DownloadTaskStatus = 'downloading' | 'paused' | 'completed' | 'failed' | 'canceled'

/** 下载任务快照 */
export interface DownloadTaskSnapshot {
  /** 任务ID */
  id: string
  /** 下载URL */
  url: string
  /** 保存路径 */
  savePath: string
  /** 文件名 */
  fileName: string
  /** 文件总大小（字节） */
  totalBytes: number
  /** 已下载字节数 */
  downloadedBytes: number
  /** 下载进度（0-1） */
  progress: number
  /** 下载速度（字节/秒） */
  speedBytesPerSecond: number
  /** 预计完成时间戳 */
  estimatedFinishAt: number | null
  /** 下载线程数 */
  threads: number
  /** 任务状态 */
  status: DownloadTaskStatus
  /** 错误信息 */
  errorMessage?: string
  /** 创建时间戳 */
  createdAt: number
  /** 更新时间戳 */
  updatedAt: number
}

/** 开始下载选项 */
export interface StartDownloadOptions {
  /** 下载URL */
  url: string
  /** 保存路径（可选，默认为 defaultDir/文件名） */
  savePath?: string
  /** 下载线程数（可选，默认为 8） */
  threads?: number
  /** 默认保存目录 */
  defaultDir: string
}

/** 下载引擎选项 */
interface DownloadEngineOptions {
  /** 任务更新回调 */
  onTaskUpdated?: (task: DownloadTaskSnapshot) => void
}

/** 下载探测结果 */
interface DownloadProbeResult {
  /** 文件名 */
  fileName: string
  /** 文件总大小（字节） */
  totalBytes: number
  /** 是否支持 Range 请求 */
  supportsRange: boolean
}

/** 内部任务结构 */
interface InternalTask extends DownloadTaskSnapshot {
  /** 临时目录 */
  tempDir: string
  /** 临时输出文件路径 */
  tempOutputPath: string
  /** 分片文件路径列表 */
  partPaths: string[]
  /** 是否支持 Range 请求 */
  supportsRange: boolean
  /** 中止控制器集合 */
  abortControllers: Set<AbortController>
  /** 上次采样时间 */
  lastSampleTime: number
  /** 上次采样已下载字节数 */
  lastSampleBytes: number
  /** 上次推送时间 */
  lastEmitTime: number
}

/**
 * 将内部任务转换为快照
 * @param task - 内部任务
 * @returns 任务快照
 */
function toTaskSnapshot(task: InternalTask): DownloadTaskSnapshot {
  return {
    id: task.id,
    url: task.url,
    savePath: task.savePath,
    fileName: task.fileName,
    totalBytes: task.totalBytes,
    downloadedBytes: task.downloadedBytes,
    progress: task.progress,
    speedBytesPerSecond: task.speedBytesPerSecond,
    estimatedFinishAt: task.estimatedFinishAt,
    threads: task.threads,
    status: task.status,
    errorMessage: task.errorMessage,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

/**
 * 多线程下载引擎
 * @description 支持多线程分片下载、暂停/恢复/取消、实时进度追踪
 */
export class MultiThreadDownloadEngine {
  /** 任务映射表 */
  private readonly tasks = new Map<string, InternalTask>()

  /** 任务更新回调 */
  private readonly onTaskUpdated?: (task: DownloadTaskSnapshot) => void

  constructor(options?: DownloadEngineOptions) {
    this.onTaskUpdated = options?.onTaskUpdated
  }

  /**
   * 获取所有任务列表
   * @returns 任务快照数组
   */
  listTasks(): DownloadTaskSnapshot[] {
    return Array.from(this.tasks.values()).map((task) => toTaskSnapshot(task))
  }

  /**
   * 获取单个任务详情
   * @param taskId - 任务ID
   * @returns 任务快照，不存在返回 null
   */
  getTask(taskId: string): DownloadTaskSnapshot | null {
    const task = this.tasks.get(taskId)
    return task ? toTaskSnapshot(task) : null
  }

  /**
   * 开始下载任务
   * @param options - 下载选项
   * @returns 任务快照
   */
  async startDownload(options: StartDownloadOptions): Promise<DownloadTaskSnapshot> {
    const normalizedUrl = String(options.url || '').trim()
    if (!normalizedUrl) {
      throw new Error('下载地址不能为空')
    }
    const parsedUrl = new URL(normalizedUrl)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('仅支持 HTTP/HTTPS 下载地址')
    }

    const probe = await this.probeRemoteFile(parsedUrl)
    const threads = normalizeThreads(options.threads)
    const savePath =
      options.savePath && options.savePath.trim()
        ? options.savePath.trim()
        : join(options.defaultDir, probe.fileName)

    await mkdir(dirname(savePath), { recursive: true })

    const taskId = randomUUID()
    const tempDir = join(dirname(savePath), `.download-${taskId}`)
    const tempOutputPath = join(tempDir, `target${extname(savePath) || '.tmp'}`)
    await mkdir(tempDir, { recursive: true })

    const now = Date.now()
    const task: InternalTask = {
      id: taskId,
      url: parsedUrl.toString(),
      savePath,
      fileName: basename(savePath),
      totalBytes: probe.totalBytes,
      downloadedBytes: 0,
      progress: 0,
      speedBytesPerSecond: 0,
      estimatedFinishAt: null,
      threads,
      status: 'downloading',
      createdAt: now,
      updatedAt: now,
      tempDir,
      tempOutputPath,
      partPaths: [],
      supportsRange: probe.supportsRange,
      abortControllers: new Set<AbortController>(),
      lastSampleTime: now,
      lastSampleBytes: 0,
      lastEmitTime: 0,
    }

    this.tasks.set(task.id, task)
    this.emitTask(task, true)

    void this.executeDownload(task, probe).catch((error) => {
      this.handleTaskFailure(task, error)
    })

    return toTaskSnapshot(task)
  }

  /**
   * 取消下载任务
   * @param taskId - 任务ID
   * @returns 是否成功取消
   */
  cancelDownload(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false
    if (task.status !== 'downloading') return false

    task.status = 'canceled'
    task.updatedAt = Date.now()
    task.abortControllers.forEach((controller) => controller.abort())
    task.abortControllers.clear()
    this.emitTask(task, true)
    return true
  }

  /**
   * 暂停下载任务
   * @param taskId - 任务ID
   * @returns 是否成功暂停
   */
  pauseDownload(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false
    if (task.status !== 'downloading') return false

    task.status = 'paused'
    task.speedBytesPerSecond = 0
    task.estimatedFinishAt = null
    task.updatedAt = Date.now()
    task.abortControllers.forEach((controller) => controller.abort())
    task.abortControllers.clear()
    this.emitTask(task, true)
    return true
  }

  /**
   * 恢复下载任务
   * @param taskId - 任务ID
   * @returns 任务快照
   */
  async resumeDownload(taskId: string): Promise<DownloadTaskSnapshot> {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error('下载任务不存在')
    }
    if (task.status !== 'paused') {
      throw new Error('仅可继续已暂停的任务')
    }

    const now = Date.now()
    const probe = await this.probeRemoteFile(new URL(task.url))

    const canResume =
      probe.supportsRange && probe.totalBytes > 0 && probe.totalBytes === task.totalBytes

    if (!canResume) {
      await this.cleanupTaskFiles(task)
      await mkdir(task.tempDir, { recursive: true })
      task.downloadedBytes = 0
      task.progress = 0
      task.partPaths = []
    }

    task.status = 'downloading'
    task.errorMessage = undefined
    task.totalBytes = probe.totalBytes
    task.supportsRange = probe.supportsRange
    task.speedBytesPerSecond = 0
    task.estimatedFinishAt = null
    task.abortControllers.clear()
    task.lastSampleTime = now
    task.lastSampleBytes = task.downloadedBytes
    task.lastEmitTime = 0
    task.updatedAt = now

    this.emitTask(task, true)
    void this.executeDownload(task, probe).catch((error) => {
      this.handleTaskFailure(task, error)
    })

    return toTaskSnapshot(task)
  }

  /**
   * 移除任务
   * @param taskId - 任务ID
   * @returns 是否成功移除
   */
  removeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false
    if (task.status === 'downloading') return false
    this.tasks.delete(taskId)
    void this.cleanupTaskFiles(task)
    return true
  }

  /**
   * 探测远程文件信息
   * @param url - 下载地址
   * @returns 探测结果
   */
  private async probeRemoteFile(url: URL): Promise<DownloadProbeResult> {
    let fileName = inferFileNameFromUrl(url)
    let totalBytes = 0
    let supportsRange = false

    try {
      const headResponse = await fetch(url.toString(), { method: 'HEAD' })
      if (headResponse.ok) {
        const contentLength = headResponse.headers.get('content-length')
        totalBytes = Number(contentLength || 0) || 0
        const acceptRanges = (headResponse.headers.get('accept-ranges') || '').toLowerCase()
        supportsRange = acceptRanges.includes('bytes')
        const disposition = headResponse.headers.get('content-disposition') || ''
        const dispositionName = parseContentDispositionFileName(disposition)
        if (dispositionName) {
          fileName = dispositionName
        }
      }
    } catch {
      // ignore head errors
    }

    return {
      fileName: safeFileName(fileName),
      totalBytes,
      supportsRange,
    }
  }

  /**
   * 执行下载任务
   * @param task - 内部任务
   * @param probe - 探测结果
   */
  private async executeDownload(task: InternalTask, probe: DownloadProbeResult): Promise<void> {
    const useMultiThread = probe.supportsRange && probe.totalBytes > 0 && task.threads > 1

    if (useMultiThread) {
      const chunks = buildChunks(probe.totalBytes, task.threads, task.tempDir)
      task.partPaths = chunks.map((chunk) => chunk.partPath)

      // Sync downloadedBytes with actual chunk file sizes on disk
      const chunkSizes = await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const fileStat = await stat(chunk.partPath)
            return fileStat.size
          } catch {
            return 0
          }
        }),
      )
      const existingBytes = chunkSizes.reduce((sum, size) => sum + size, 0)
      task.downloadedBytes = Math.min(existingBytes, probe.totalBytes)
      if (existingBytes > 0) {
        this.updateTaskProgress(task)
      }

      await Promise.all(chunks.map((chunk) => this.downloadChunk(task, chunk)))
      if (task.status === 'canceled') {
        await this.cleanupTaskFiles(task)
        return
      }
      await mergePartFiles(task.partPaths, task.tempOutputPath)
    } else {
      // Sync downloadedBytes with actual temp file size on disk
      if (probe.supportsRange && probe.totalBytes > 0) {
        try {
          const fileStat = await stat(task.tempOutputPath)
          if (fileStat.size > 0 && fileStat.size < probe.totalBytes) {
            task.downloadedBytes = fileStat.size
            this.updateTaskProgress(task)
          } else {
            task.downloadedBytes = 0
          }
        } catch {
          task.downloadedBytes = 0
        }
      } else {
        task.downloadedBytes = 0
      }

      await this.downloadSingle(task)
      if (task.status === 'canceled') {
        await this.cleanupTaskFiles(task)
        return
      }
    }

    if (existsSync(task.savePath)) {
      await unlink(task.savePath).catch(() => {})
    }
    await rename(task.tempOutputPath, task.savePath)

    if (task.totalBytes <= 0) {
      task.totalBytes = task.downloadedBytes
    }
    task.downloadedBytes = Math.max(task.downloadedBytes, task.totalBytes)
    task.progress = 1
    task.speedBytesPerSecond = 0
    task.estimatedFinishAt = null
    task.status = 'completed'
    task.updatedAt = Date.now()
    this.emitTask(task, true)

    await this.cleanupTaskFiles(task, { keepOutput: true })
  }

  /**
   * 单线程下载
   * @param task - 内部任务
   */
  private async downloadSingle(task: InternalTask): Promise<void> {
    const controller = new AbortController()
    task.abortControllers.add(controller)
    try {
      let existingSize = 0
      if (task.supportsRange && task.totalBytes > 0) {
        try {
          const fileStat = await stat(task.tempOutputPath)
          if (fileStat.size > 0 && fileStat.size < task.totalBytes) {
            existingSize = fileStat.size
          }
        } catch {
          // file doesn't exist
        }
      }

      const headers: Record<string, string> = {}
      if (existingSize > 0) {
        headers['Range'] = `bytes=${existingSize}-`
      }

      const response = await fetch(task.url, { signal: controller.signal, headers })
      if (existingSize > 0 && response.status !== 206) {
        // Server doesn't support range for this request, restart
        existingSize = 0
        task.downloadedBytes = 0
      }
      if (!existingSize && !response.ok) {
        throw new Error(`下载请求失败: HTTP ${response.status}`)
      }
      if (!response.body) {
        throw new Error(`下载请求失败: HTTP ${response.status}`)
      }
      const contentLength = Number(response.headers.get('content-length') || 0) || 0
      if (task.totalBytes <= 0 && contentLength > 0) {
        task.totalBytes = existingSize + contentLength
      }

      const fileHandle = await open(task.tempOutputPath, existingSize > 0 ? 'a' : 'w')
      try {
        const reader = response.body.getReader()
        while (true) {
          const result = await reader.read()
          if (result.done) break
          const chunk = result.value
          if (chunk && chunk.byteLength > 0) {
            await fileHandle.write(chunk)
            task.downloadedBytes += chunk.byteLength
            this.updateTaskProgress(task)
          }
        }
      } finally {
        await fileHandle.close()
      }
    } finally {
      task.abortControllers.delete(controller)
    }
  }

  /**
   * 多线程分片下载
   * @param task - 内部任务
   * @param chunk - 分片信息
   */
  private async downloadChunk(task: InternalTask, chunk: ChunkInfo): Promise<void> {
    const chunkExpectedSize = chunk.end - chunk.start + 1

    // Check existing partial data
    let existingSize = 0
    try {
      const fileStat = await stat(chunk.partPath)
      existingSize = fileStat.size
    } catch {
      // file doesn't exist
    }

    // Chunk already fully downloaded
    if (existingSize >= chunkExpectedSize) {
      return
    }

    const controller = new AbortController()
    task.abortControllers.add(controller)
    try {
      const rangeStart = chunk.start + existingSize
      const response = await fetch(task.url, {
        signal: controller.signal,
        headers: {
          Range: `bytes=${rangeStart}-${chunk.end}`,
        },
      })
      if ((response.status !== 206 && response.status !== 200) || !response.body) {
        throw new Error(`分片下载失败: HTTP ${response.status}`)
      }

      const fileHandle = await open(chunk.partPath, existingSize > 0 ? 'a' : 'w')
      try {
        const reader = response.body.getReader()
        while (true) {
          const result = await reader.read()
          if (result.done) break
          const bytes = result.value
          if (bytes && bytes.byteLength > 0) {
            await fileHandle.write(bytes)
            task.downloadedBytes += bytes.byteLength
            this.updateTaskProgress(task)
          }
        }
      } finally {
        await fileHandle.close()
      }
    } finally {
      task.abortControllers.delete(controller)
    }
  }

  /**
   * 更新任务进度
   * @param task - 内部任务
   */
  private updateTaskProgress(task: InternalTask): void {
    const now = Date.now()
    const elapsedMs = Math.max(1, now - task.lastSampleTime)
    const deltaBytes = task.downloadedBytes - task.lastSampleBytes

    task.speedBytesPerSecond = Math.max(0, Math.round((deltaBytes / elapsedMs) * 1000))
    task.lastSampleBytes = task.downloadedBytes
    task.lastSampleTime = now
    task.updatedAt = now

    if (
      task.totalBytes > 0 &&
      task.speedBytesPerSecond > 0 &&
      task.downloadedBytes < task.totalBytes
    ) {
      const remainBytes = task.totalBytes - task.downloadedBytes
      const remainSeconds = remainBytes / task.speedBytesPerSecond
      task.estimatedFinishAt = now + Math.max(0, Math.round(remainSeconds * 1000))
    } else {
      task.estimatedFinishAt = null
    }

    if (task.totalBytes > 0) {
      task.progress = Math.max(0, Math.min(1, task.downloadedBytes / task.totalBytes))
    }

    this.emitTask(task, false)
  }

  /**
   * 推送任务更新
   * @param task - 内部任务
   * @param force - 是否强制推送
   */
  private emitTask(task: InternalTask, force: boolean): void {
    const now = Date.now()
    if (!force && now - task.lastEmitTime < EMIT_INTERVAL_MS) return
    task.lastEmitTime = now
    this.onTaskUpdated?.(toTaskSnapshot(task))
  }

  /**
   * 清理任务临时文件
   * @param task - 内部任务
   * @param options - 清理选项
   */
  private async cleanupTaskFiles(
    task: InternalTask,
    options?: { keepOutput?: boolean },
  ): Promise<void> {
    if (!options?.keepOutput) {
      await rm(task.tempOutputPath, { force: true }).catch(() => {})
    }
    if (task.partPaths.length > 0) {
      await Promise.all(task.partPaths.map((path) => rm(path, { force: true }).catch(() => {})))
    }
    await rm(task.tempDir, { recursive: true, force: true }).catch(() => {})
  }

  /**
   * 处理任务失败
   * @param task - 内部任务
   * @param error - 错误对象
   */
  private handleTaskFailure(task: InternalTask, error: unknown): void {
    if (task.status === 'paused') {
      task.speedBytesPerSecond = 0
      task.estimatedFinishAt = null
      task.updatedAt = Date.now()
      this.emitTask(task, true)
      return
    }

    if (task.status === 'canceled' || isAbortError(error)) {
      task.status = 'canceled'
      task.speedBytesPerSecond = 0
      task.estimatedFinishAt = null
      task.updatedAt = Date.now()
      this.emitTask(task, true)
      void this.cleanupTaskFiles(task)
      return
    }

    task.status = 'failed'
    task.errorMessage = error instanceof Error ? error.message : String(error)
    task.speedBytesPerSecond = 0
    task.estimatedFinishAt = null
    task.updatedAt = Date.now()
    this.emitTask(task, true)
    void this.cleanupTaskFiles(task)
  }
}
