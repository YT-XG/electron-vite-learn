# Multi-Thread Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the multi-thread download engine from eIsland project to provide high-performance multi-thread downloading for both app updates and general-purpose downloads.

**Architecture:** Three-layer architecture: core download engine (MultiThreadDownloadEngine), service layer (DownloadService with persistence and IPC), and UI layer (DownloadManager.vue). The engine handles multi-thread chunked downloading with pause/resume support, the service manages task lifecycle and persistence, and the UI provides visual management.

**Tech Stack:** TypeScript, Electron IPC, fs/promises, path, electron dialog

## Global Constraints

- Cross-platform: Windows + macOS (use path.join(), app.getPath())
- IPC naming: `download:*` for service channels
- Persistence: userData/download-tasks.json, max 200 tasks, debounce 600ms
- Thread config: default 8, max 16, min 1
- Progress emit interval: 160ms

---

### Task 1: Create Download Engine Config

**Files:**
- Create: `src/main/core/downloadEngine/config/index.ts`

**Interfaces:**
- Produces: `DEFAULT_THREADS`, `MAX_THREADS`, `MIN_THREADS`, `EMIT_INTERVAL_MS`, `MIN_CHUNK_BYTES`

- [ ] **Step 1: Create config file**

```typescript
/**
 * 下载引擎配置常量
 */

/** 默认下载线程数 */
export const DEFAULT_THREADS = 8

/** 最大下载线程数 */
export const MAX_THREADS = 16

/** 最小下载线程数 */
export const MIN_THREADS = 1

/** 进度推送间隔（毫秒） */
export const EMIT_INTERVAL_MS = 160

/** 最小分片大小（1MB） */
export const MIN_CHUNK_BYTES = 1024 * 1024
```

- [ ] **Step 2: Verify file exists**

Run: `ls -la src/main/core/downloadEngine/config/index.ts`
Expected: File exists

- [ ] **Step 3: Commit**

```bash
git add src/main/core/downloadEngine/config/index.ts
git commit -m "feat(download): add download engine config constants"
```

---

### Task 2: Create Download Engine Utilities

**Files:**
- Create: `src/main/core/downloadEngine/utils/index.ts`

**Interfaces:**
- Consumes: `DEFAULT_THREADS`, `MAX_THREADS`, `MIN_THREADS`, `MIN_CHUNK_BYTES` from Task 1
- Produces: `ChunkInfo`, `normalizeThreads()`, `parseContentDispositionFileName()`, `inferFileNameFromUrl()`, `safeFileName()`, `isAbortError()`, `buildChunks()`, `mergePartFiles()`

- [ ] **Step 1: Create utils file**

```typescript
/**
 * 下载引擎通用工具函数
 */

import { createReadStream, createWriteStream } from 'fs'
import { rm } from 'fs/promises'
import { basename, join } from 'path'
import { pipeline } from 'stream/promises'
import { DEFAULT_THREADS, MAX_THREADS, MIN_CHUNK_BYTES, MIN_THREADS } from '../config'

/** 分片信息接口 */
export interface ChunkInfo {
  /** 分片索引 */
  index: number
  /** 起始字节位置 */
  start: number
  /** 结束字节位置 */
  end: number
  /** 分片临时文件路径 */
  partPath: string
}

/**
 * 标准化并限制下载线程数
 * @param value - 输入线程数
 * @returns 合法范围内的线程数
 */
export function normalizeThreads(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_THREADS
  return Math.max(MIN_THREADS, Math.min(MAX_THREADS, Math.floor(value)))
}

/**
 * 从 Content-Disposition 响应头中解析文件名
 * @param headerValue - 响应头原始值
 * @returns 解析后的文件名，失败时返回空字符串
 */
export function parseContentDispositionFileName(headerValue: string): string {
  const utf8Match = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(headerValue)
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim())
    } catch {
      return utf8Match[1].trim()
    }
  }
  const simpleMatch = /filename\s*=\s*"?([^";]+)"?/i.exec(headerValue)
  if (simpleMatch && simpleMatch[1]) {
    return simpleMatch[1].trim()
  }
  return ''
}

/**
 * 根据 URL 推断默认文件名
 * @param url - 下载地址
 * @returns 推断得到的文件名
 */
export function inferFileNameFromUrl(url: URL): string {
  const fromPath = basename(decodeURIComponent(url.pathname || ''))
  if (fromPath && fromPath !== '/' && fromPath !== '.') {
    return fromPath
  }
  return `download-${Date.now()}.bin`
}

/**
 * 将文件名清洗为跨平台安全格式
 * @param input - 原始文件名
 * @returns 清洗后的文件名
 */
export function safeFileName(input: string): string {
  const safe = input.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
  if (!safe) return `download-${Date.now()}.bin`
  return safe.slice(0, 180)
}

/**
 * 判断错误是否为中止下载导致的异常
 * @param error - 任意异常对象
 * @returns 是否为 AbortError
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || /aborted|abort/i.test(error.message)
}

/**
 * 按线程数将总字节数拆分为分片区间
 * @param totalBytes - 文件总字节数
 * @param threads - 线程数
 * @param tempDir - 分片临时目录
 * @returns 分片信息列表
 */
export function buildChunks(totalBytes: number, threads: number, tempDir: string): ChunkInfo[] {
  const targetThreads = Math.max(1, Math.min(threads, Math.floor(totalBytes / MIN_CHUNK_BYTES) || 1))
  const chunkSize = Math.ceil(totalBytes / targetThreads)
  const chunks: ChunkInfo[] = []
  let start = 0
  for (let index = 0; index < targetThreads; index++) {
    const end = index === targetThreads - 1 ? totalBytes - 1 : Math.min(totalBytes - 1, start + chunkSize - 1)
    chunks.push({
      index,
      start,
      end,
      partPath: join(tempDir, `chunk-${index}.part`),
    })
    start = end + 1
  }
  return chunks
}

/**
 * 合并分片文件到目标文件
 * @param partPaths - 分片文件路径列表
 * @param outputPath - 输出文件路径
 */
export async function mergePartFiles(partPaths: string[], outputPath: string): Promise<void> {
  await rm(outputPath, { force: true }).catch(() => {})
  const writeStream = createWriteStream(outputPath, { flags: 'w' })
  for (let index = 0; index < partPaths.length; index++) {
    await pipeline(createReadStream(partPaths[index]), writeStream, { end: false })
  }
  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => resolve())
    writeStream.on('error', reject)
  })
}
```

- [ ] **Step 2: Verify file exists**

Run: `ls -la src/main/core/downloadEngine/utils/index.ts`
Expected: File exists

- [ ] **Step 3: Commit**

```bash
git add src/main/core/downloadEngine/utils/index.ts
git commit -m "feat(download): add download engine utility functions"
```

---

### Task 3: Create Download Engine Core

**Files:**
- Create: `src/main/core/downloadEngine/index.ts`

**Interfaces:**
- Consumes: `normalizeThreads()`, `parseContentDispositionFileName()`, `inferFileNameFromUrl()`, `safeFileName()`, `isAbortError()`, `buildChunks()`, `mergePartFiles()`, `ChunkInfo` from Task 2; `EMIT_INTERVAL_MS` from Task 1
- Produces: `DownloadTaskStatus`, `DownloadTaskSnapshot`, `StartDownloadOptions`, `MultiThreadDownloadEngine`

- [ ] **Step 1: Create download engine file**

```typescript
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
    const savePath = options.savePath && options.savePath.trim()
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
      probe.supportsRange &&
      probe.totalBytes > 0 &&
      probe.totalBytes === task.totalBytes

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

    if (task.totalBytes > 0 && task.speedBytesPerSecond > 0 && task.downloadedBytes < task.totalBytes) {
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
  private async cleanupTaskFiles(task: InternalTask, options?: { keepOutput?: boolean }): Promise<void> {
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
```

- [ ] **Step 2: Verify file exists**

Run: `ls -la src/main/core/downloadEngine/index.ts`
Expected: File exists

- [ ] **Step 3: Commit**

```bash
git add src/main/core/downloadEngine/index.ts
git commit -m "feat(download): add multi-thread download engine core"
```

---

### Task 4: Create Download Service

**Files:**
- Create: `src/main/service/downloadService.ts`

**Interfaces:**
- Consumes: `MultiThreadDownloadEngine`, `DownloadTaskSnapshot` from Task 3
- Produces: `downloadService` (singleton)

- [ ] **Step 1: Create download service file**

```typescript
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
```

- [ ] **Step 2: Verify file exists**

Run: `ls -la src/main/service/downloadService.ts`
Expected: File exists

- [ ] **Step 3: Commit**

```bash
git add src/main/service/downloadService.ts
git commit -m "feat(download): add download service with persistence and IPC"
```

---

### Task 5: Initialize Download Service in Main Process

**Files:**
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `downloadService` from Task 4

- [ ] **Step 1: Add import and initialization**

Find the import section and add:
```typescript
import { downloadService } from './service/downloadService'
```

Find the initialization section (after settingsService.init()) and add:
```typescript
// 初始化下载服务
downloadService.init()
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(download): initialize download service in main process"
```

---

### Task 6: Create DownloadManager Vue Component

**Files:**
- Create: `src/renderer/src/views/DownloadManager.vue`

**Interfaces:**
- Consumes: `download:task-updated`, `download:list`, `download:pause`, `download:resume`, `download:cancel`, `download:remove` IPC channels

- [ ] **Step 1: Create DownloadManager.vue**

```vue
<template>
  <div class="download-manager">
    <div class="header">
      <h2 class="title">📥 下载管理</h2>
      <button class="add-btn" @click="addDownload" title="添加下载">
        <span>+</span>
      </button>
    </div>

    <!-- 空状态 -->
    <div v-if="tasks.length === 0" class="empty-state">
      <div class="empty-icon">📭</div>
      <p class="empty-text">暂无下载任务</p>
      <p class="empty-hint">点击右上角 + 添加下载</p>
    </div>

    <!-- 任务列表 -->
    <div v-else class="task-list">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="task-card"
        :class="`status-${task.status}`"
      >
        <div class="task-header">
          <span class="task-icon">📄</span>
          <span class="task-name" :title="task.fileName">{{ task.fileName }}</span>
          <span class="task-status" :class="`status-${task.status}`">
            {{ getStatusText(task.status) }}
          </span>
        </div>

        <!-- 进度条 -->
        <div class="progress-section">
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: `${task.progress * 100}%` }"
            ></div>
          </div>
          <div class="progress-info">
            <span class="progress-percent">{{ Math.round(task.progress * 100) }}%</span>
            <span v-if="task.status === 'downloading'" class="progress-speed">
              {{ formatSpeed(task.speedBytesPerSecond) }}
            </span>
            <span v-if="task.status === 'downloading' && task.estimatedFinishAt" class="progress-time">
              {{ formatRemainingTime(task.estimatedFinishAt) }}
            </span>
          </div>
        </div>

        <!-- 错误信息 -->
        <div v-if="task.errorMessage" class="error-message">
          {{ task.errorMessage }}
        </div>

        <!-- 操作按钮 -->
        <div class="task-actions">
          <template v-if="task.status === 'downloading'">
            <button class="action-btn pause-btn" @click="pauseTask(task.id)">暂停</button>
            <button class="action-btn cancel-btn" @click="cancelTask(task.id)">取消</button>
          </template>
          <template v-else-if="task.status === 'paused'">
            <button class="action-btn resume-btn" @click="resumeTask(task.id)">继续</button>
            <button class="action-btn cancel-btn" @click="cancelTask(task.id)">取消</button>
          </template>
          <template v-else-if="task.status === 'completed'">
            <button class="action-btn open-btn" @click="openFile(task.savePath)">打开文件</button>
            <button class="action-btn folder-btn" @click="openFolder(task.savePath)">打开文件夹</button>
            <button class="action-btn remove-btn" @click="removeTask(task.id)">移除</button>
          </template>
          <template v-else-if="task.status === 'failed'">
            <button class="action-btn retry-btn" @click="retryTask(task)">重试</button>
            <button class="action-btn remove-btn" @click="removeTask(task.id)">移除</button>
          </template>
          <template v-else-if="task.status === 'canceled'">
            <button class="action-btn remove-btn" @click="removeTask(task.id)">移除</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

/** 下载任务接口 */
interface DownloadTask {
  id: string
  url: string
  savePath: string
  fileName: string
  totalBytes: number
  downloadedBytes: number
  progress: number
  speedBytesPerSecond: number
  estimatedFinishAt: number | null
  threads: number
  status: 'downloading' | 'paused' | 'completed' | 'failed' | 'canceled'
  errorMessage?: string
  createdAt: number
  updatedAt: number
}

/** 任务列表 */
const tasks = ref<DownloadTask[]>([])

/**
 * 获取状态文本
 * @param status - 任务状态
 * @returns 状态文本
 */
const getStatusText = (status: DownloadTask['status']): string => {
  const statusMap: Record<DownloadTask['status'], string> = {
    downloading: '下载中',
    paused: '已暂停',
    completed: '已完成',
    failed: '失败',
    canceled: '已取消',
  }
  return statusMap[status]
}

/**
 * 格式化下载速度
 * @param bytesPerSecond - 每秒字节数
 * @returns 格式化的速度字符串
 */
const formatSpeed = (bytesPerSecond: number): string => {
  if (bytesPerSecond <= 0) return ''
  if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
}

/**
 * 格式化剩余时间
 * @param estimatedFinishAt - 预计完成时间戳
 * @returns 格式化的剩余时间字符串
 */
const formatRemainingTime = (estimatedFinishAt: number): string => {
  const remainingMs = estimatedFinishAt - Date.now()
  if (remainingMs <= 0) return ''
  const remainingSeconds = Math.ceil(remainingMs / 1000)
  if (remainingSeconds < 60) return `${remainingSeconds}s`
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  return `${minutes}m ${seconds}s`
}

/**
 * 添加下载
 */
const addDownload = async (): Promise<void> => {
  const url = prompt('请输入下载地址：')
  if (!url) return

  const result = await window.electron.ipcRenderer.invoke('download:start', { url })
  if (!result.ok) {
    alert(`下载失败: ${result.message}`)
  }
}

/**
 * 暂停任务
 * @param taskId - 任务ID
 */
const pauseTask = async (taskId: string): Promise<void> => {
  await window.electron.ipcRenderer.invoke('download:pause', taskId)
}

/**
 * 恢复任务
 * @param taskId - 任务ID
 */
const resumeTask = async (taskId: string): Promise<void> => {
  await window.electron.ipcRenderer.invoke('download:resume', taskId)
}

/**
 * 取消任务
 * @param taskId - 任务ID
 */
const cancelTask = async (taskId: string): Promise<void> => {
  await window.electron.ipcRenderer.invoke('download:cancel', taskId)
}

/**
 * 移除任务
 * @param taskId - 任务ID
 */
const removeTask = async (taskId: string): Promise<void> => {
  await window.electron.ipcRenderer.invoke('download:remove', taskId)
  tasks.value = tasks.value.filter((t) => t.id !== taskId)
}

/**
 * 重试任务
 * @param task - 任务对象
 */
const retryTask = async (task: DownloadTask): Promise<void> => {
  await window.electron.ipcRenderer.invoke('download:remove', task.id)
  tasks.value = tasks.value.filter((t) => t.id !== task.id)
  const result = await window.electron.ipcRenderer.invoke('download:start', {
    url: task.url,
    savePath: task.savePath,
    threads: task.threads,
  })
  if (!result.ok) {
    alert(`重试失败: ${result.message}`)
  }
}

/**
 * 打开文件
 * @param filePath - 文件路径
 */
const openFile = async (filePath: string): Promise<void> => {
  await window.electron.ipcRenderer.invoke('shell:openPath', filePath)
}

/**
 * 打开文件夹
 * @param filePath - 文件路径
 */
const openFolder = async (filePath: string): Promise<void> => {
  await window.electron.ipcRenderer.invoke('shell:showItemInFolder', filePath)
}

/**
 * 任务更新处理
 * @param _event - IPC 事件
 * @param task - 任务快照
 */
const onTaskUpdated = (_event: Electron.IpcRendererEvent, task: DownloadTask): void => {
  const index = tasks.value.findIndex((t) => t.id === task.id)
  if (index >= 0) {
    tasks.value[index] = task
  } else {
    tasks.value.unshift(task)
  }
}

onMounted(async () => {
  // 加载现有任务列表
  const existingTasks = await window.electron.ipcRenderer.invoke('download:list')
  tasks.value = existingTasks || []

  // 监听任务更新
  window.electron.ipcRenderer.on('download:task-updated', onTaskUpdated)
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeListener('download:task-updated', onTaskUpdated)
})
</script>

<style scoped>
.download-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.title {
  font-size: 18px;
  font-weight: 600;
  background: linear-gradient(90deg, #3d8bff, #ff6ab0);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
}

.add-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #3d8bff, #ff6ab0);
  color: white;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, box-shadow 0.2s;
}

.add-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(61, 139, 255, 0.3);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
}

.task-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-card {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.task-card:hover {
  border-color: var(--accent-blue);
}

.task-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.task-icon {
  font-size: 16px;
}

.task-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.task-status.status-downloading {
  background: rgba(61, 139, 255, 0.15);
  color: #3d8bff;
}

.task-status.status-paused {
  background: rgba(255, 193, 7, 0.15);
  color: #ffc107;
}

.task-status.status-completed {
  background: rgba(76, 175, 80, 0.15);
  color: #4caf50;
}

.task-status.status-failed {
  background: rgba(244, 67, 54, 0.15);
  color: #f44336;
}

.task-status.status-canceled {
  background: rgba(158, 158, 158, 0.15);
  color: #9e9e9e;
}

.progress-section {
  margin-bottom: 8px;
}

.progress-bar {
  height: 4px;
  background: var(--bg-tertiary);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3d8bff, #ff6ab0);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.progress-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.progress-percent {
  font-weight: 500;
}

.progress-speed {
  color: var(--accent-blue);
}

.progress-time {
  color: var(--text-tertiary);
}

.error-message {
  font-size: 11px;
  color: #f44336;
  margin-bottom: 8px;
  padding: 6px 8px;
  background: rgba(244, 67, 54, 0.1);
  border-radius: 6px;
}

.task-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.pause-btn,
.resume-btn {
  background: linear-gradient(135deg, #3d8bff, #5a9fff);
  color: white;
}

.pause-btn:hover,
.resume-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(61, 139, 255, 0.3);
}

.cancel-btn {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.cancel-btn:hover {
  background: rgba(244, 67, 54, 0.1);
  color: #f44336;
}

.open-btn,
.retry-btn {
  background: linear-gradient(135deg, #4caf50, #66bb6a);
  color: white;
}

.open-btn:hover,
.retry-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
}

.folder-btn {
  background: linear-gradient(135deg, #ff9800, #ffb74d);
  color: white;
}

.folder-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(255, 152, 0, 0.3);
}

.remove-btn {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.remove-btn:hover {
  background: rgba(244, 67, 54, 0.1);
  color: #f44336;
}
</style>
```

- [ ] **Step 2: Verify file exists**

Run: `ls -la src/renderer/src/views/DownloadManager.vue`
Expected: File exists

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/DownloadManager.vue
git commit -m "feat(download): add DownloadManager Vue component"
```

---

### Task 7: Add Download Manager Menu to MainPage

**Files:**
- Modify: `src/renderer/src/views/MainPage.vue`

**Interfaces:**
- Consumes: `DownloadManager.vue` from Task 6

- [ ] **Step 1: Add import and menu item**

Find the import section and add:
```typescript
import DownloadManager from './DownloadManager.vue'
```

Find the currentPage ref and update the type:
```typescript
const currentPage = ref<'home' | 'clipboard' | 'settings' | 'translate' | 'download'>('clipboard')
```

Add menu item in the sidebar-nav (after 翻译):
```vue
<!-- 下载管理 -->
<button
  class="nav-item"
  :class="{ active: currentPage === 'download' }"
  @click="currentPage = 'download'"
>
  <span class="nav-icon">📥</span>
  <span class="nav-label" v-if="!isSidebarCollapsed">下载管理</span>
</button>
```

Add content in the Transition section:
```vue
<!-- 下载管理 -->
<DownloadManager v-else-if="currentPage === 'download'" key="download" />
```

Update the onSetPage handler to include 'download':
```typescript
if (['home', 'clipboard', 'settings', 'translate', 'download'].includes(page)) {
  currentPage.value = page as 'home' | 'clipboard' | 'settings' | 'translate' | 'download'
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/MainPage.vue
git commit -m "feat(download): add download manager menu to MainPage"
```

---

### Task 8: Add Download Manager Route

**Files:**
- Modify: `src/renderer/src/router/routes.ts`

**Interfaces:**
- Consumes: `DownloadManager.vue` from Task 6

- [ ] **Step 1: Add route**

```typescript
{
  path: '/downloadManager',
  name: '下载管理',
  component: () => import('@renderer/views/DownloadManager.vue')
},
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/router/routes.ts
git commit -m "feat(download): add download manager route"
```

---

### Task 9: Update GitHub Update Service to Use Download Service

**Files:**
- Modify: `src/main/service/githubUpdateService.ts`

**Interfaces:**
- Consumes: `downloadService` from Task 4

- [ ] **Step 1: Add import and update downloadUpdate method**

Add import:
```typescript
import { downloadService } from './downloadService'
```

Replace the downloadUpdate method:
```typescript
/**
 * 下载更新包
 * @param info - 更新信息
 * @param onProgress - 进度回调
 * @returns 下载后的本地文件路径
 */
async downloadUpdate(
  info: GitHubUpdateInfo,
  onProgress?: (percent: number) => void
): Promise<string> {
  const localPath = join(this.cacheDir, `update-${info.version}-${info.file}`)

  // 检查本地缓存
  if (fs.existsSync(localPath)) {
    log.info('[GitHubUpdate] 使用本地缓存:', localPath)
    onProgress?.(100)
    return localPath
  }

  // 确保缓存目录存在
  if (!fs.existsSync(this.cacheDir)) {
    fs.mkdirSync(this.cacheDir, { recursive: true })
  }

  log.info('[GitHubUpdate] 开始下载:', info.downloadUrl)

  // 使用多线程下载服务
  const task = await downloadService.startDownload({
    url: info.downloadUrl,
    savePath: localPath,
    threads: 4, // 更新下载用 4 线程即可
  })

  // 等待下载完成
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      const currentTask = downloadService.getTask(task.id)
      if (!currentTask) {
        clearInterval(checkInterval)
        reject(new Error('任务不存在'))
        return
      }

      if (currentTask.status === 'completed') {
        clearInterval(checkInterval)
        onProgress?.(100)
        resolve(localPath)
      } else if (currentTask.status === 'failed' || currentTask.status === 'canceled') {
        clearInterval(checkInterval)
        reject(new Error(currentTask.errorMessage || '下载失败'))
      } else if (currentTask.status === 'downloading') {
        onProgress?.(Math.round(currentTask.progress * 100))
      }
    }, 500)
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/main/service/githubUpdateService.ts
git commit -m "feat(download): update githubUpdateService to use download service"
```

---

### Task 10: Update CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- N/A

- [ ] **Step 1: Add download service documentation**

Add to the 模块说明 section:
```markdown
### 下载服务 (src/main/service/downloadService.ts)
- **职责**: 封装下载引擎，提供全局单例、任务持久化和 IPC 接口
- **功能**:
  - 多线程分片下载（默认 8 线程，最大 16）
  - 暂停/恢复/取消下载任务
  - 任务持久化（保存到 userData/download-tasks.json）
  - IPC 接口：download:start, download:pause, download:resume, download:cancel, download:remove, download:list, download:get, download:pick-save-path
  - 进度广播到所有可见窗口
- **依赖**: downloadEngine
```

Add to the 目录索引:
```
├── core/
│   ├── downloadEngine/
│   │   ├── index.ts              # MultiThreadDownloadEngine 类
│   │   ├── config/
│   │   │   └── index.ts          # 配置常量
│   │   └── utils/
│   │       └── index.ts          # 工具函数
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with download service documentation"
```

---

### Task 11: Build and Verify

**Files:**
- N/A

**Interfaces:**
- N/A

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Test in dev mode**

Run: `npm run dev`
Expected: Application starts without errors

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-02-multi-thread-download.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
