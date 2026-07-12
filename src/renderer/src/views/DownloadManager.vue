<template>
  <div class="download-manager">
    <div class="header">
      <h2 class="title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        下载管理
      </h2>
      <div class="header-actions">
        <!-- 线程数设置 -->
        <div class="threads-setting">
          <span class="threads-label">线程数:</span>
          <select v-model="downloadThreads" class="threads-select" @change="saveThreads">
            <option v-for="n in 16" :key="n" :value="n">{{ n }}</option>
          </select>
        </div>
        <button class="add-btn" @click="showAddDialog = true" title="添加下载">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>

    <!-- 通用错误提示 -->
    <div v-if="generalError" class="general-error" @click="generalError = ''">
      <span class="error-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </span>
      <span class="error-text">{{ generalError }}</span>
      <span class="error-dismiss">✕</span>
    </div>

    <!-- 添加下载对话框 -->
    <div v-if="showAddDialog" class="dialog-overlay" @click.self="showAddDialog = false">
      <div class="dialog">
        <h3 class="dialog-title">添加下载</h3>
        <input
          v-model="downloadUrl"
          class="dialog-input"
          type="url"
          placeholder="请输入下载地址"
          @keyup.enter="confirmAddDownload"
          ref="urlInput"
        />
        <div class="dialog-actions">
          <button class="dialog-btn cancel" @click="showAddDialog = false">取消</button>
          <button class="dialog-btn confirm" @click="confirmAddDownload" :disabled="!downloadUrl.trim()">确定</button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="tasks.length === 0" class="empty-state">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
      </div>
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
          <span class="task-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          </span>
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
            <button class="action-btn remove-btn" @click="removeTask(task.id)">移除</button>
          </template>
          <template v-else-if="task.status === 'paused'">
            <button class="action-btn resume-btn" @click="resumeTask(task.id)">继续</button>
            <button class="action-btn cancel-btn" @click="cancelTask(task.id)">取消</button>
            <button class="action-btn remove-btn" @click="removeTask(task.id)">移除</button>
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
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'

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

/** 是否显示添加下载对话框 */
const showAddDialog = ref(false)

/** 下载地址输入 */
const downloadUrl = ref('')

/** URL 输入框引用 */
const urlInput = ref<HTMLInputElement | null>(null)

/** 是否正在添加下载（防抖） */
const isAdding = ref(false)

/** 下载线程数 */
const downloadThreads = ref(8)

/** 通用错误提示 */
const generalError = ref('')

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
 * 确认添加下载
 */
const confirmAddDownload = async (): Promise<void> => {
  const url = downloadUrl.value.trim()
  if (!url || isAdding.value) return

  isAdding.value = true
  try {
    // 立即关闭弹窗，提升响应速度
    showAddDialog.value = false
    downloadUrl.value = ''

    const result = await window.electron.ipcRenderer.invoke('download:start', {
      url,
      threads: downloadThreads.value
    })
    if (!result.ok) {
      generalError.value = `下载失败: ${result.message}`
      setTimeout(() => { generalError.value = '' }, 5000)
    }
  } finally {
    isAdding.value = false
  }
}

/**
 * 保存线程数设置
 */
const saveThreads = async (): Promise<void> => {
  await window.electron.ipcRenderer.invoke('to-service-SettingsService:update', {
    downloadThreads: downloadThreads.value
  })
}

// 监听对话框显示，自动聚焦输入框
watch(showAddDialog, async (newVal) => {
  if (newVal) {
    await nextTick()
    urlInput.value?.focus()
  }
})

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
    generalError.value = `重试失败: ${result.message}`
    setTimeout(() => { generalError.value = '' }, 5000)
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

  // 加载线程数设置
  const settings = await window.electron.ipcRenderer.invoke('to-service-SettingsService:get')
  if (settings?.downloadThreads) {
    downloadThreads.value = settings.downloadThreads
  }

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
  background: linear-gradient(90deg, var(--accent), var(--accent-hover));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.threads-setting {
  display: flex;
  align-items: center;
  gap: 6px;
}

.threads-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.threads-select {
  width: 60px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
}

.threads-select:focus {
  border-color: var(--accent);
}

.add-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s, box-shadow 0.15s, background-color 0.15s;
}

.add-btn:hover {
  background: var(--accent-hover);
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(var(--accent-rgb), 0.3);
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
  opacity: 0.3;
  color: var(--text-tertiary);
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
  background: var(--bg-surface);
  border-radius: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  transition: border-color 0.15s;
}

.task-card:hover {
  border-color: var(--accent);
}

.task-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.task-icon {
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
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
  background: rgba(var(--accent-rgb), 0.12);
  color: var(--accent);
}

.task-status.status-paused {
  background: var(--warning-bg);
  color: var(--warning);
}

.task-status.status-completed {
  background: var(--success-bg);
  color: var(--success);
}

.task-status.status-failed {
  background: var(--danger-bg);
  color: var(--danger);
}

.task-status.status-canceled {
  background: rgba(var(--text-tertiary-rgb), 0.12);
  color: var(--text-tertiary);
}

.progress-section {
  margin-bottom: 8px;
}

.progress-bar {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-hover));
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
  color: var(--accent);
}

.progress-time {
  color: var(--text-tertiary);
}

.error-message {
  font-size: 11px;
  color: var(--danger);
  margin-bottom: 8px;
  padding: 6px 8px;
  background: var(--danger-bg);
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
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.pause-btn,
.resume-btn {
  background: var(--accent);
  color: white;
}

.pause-btn:hover,
.resume-btn:hover {
  background: var(--accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(var(--accent-rgb), 0.3);
}

.cancel-btn {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.cancel-btn:hover {
  background: var(--danger-bg);
  color: var(--danger);
  border-color: var(--danger);
}

.open-btn,
.retry-btn {
  background: var(--success);
  color: white;
}

.open-btn:hover,
.retry-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(var(--success-rgb), 0.3);
}

.folder-btn {
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.folder-btn:hover {
  background: var(--border);
  border-color: var(--border-hover);
}

.remove-btn {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.remove-btn:hover {
  background: var(--danger-bg);
  color: var(--danger);
  border-color: var(--danger);
}

/* 减弱动效 */
@media (prefers-reduced-motion: reduce) {
  .action-btn {
    transition: none;
  }
  .action-btn:hover {
    transform: none;
  }
}

/* 对话框样式 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  width: 320px;
  box-shadow: var(--shadow-lg);
}

.dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 16px 0;
}

.dialog-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.dialog-input:focus {
  border-color: var(--accent);
}

.dialog-input::placeholder {
  color: var(--text-tertiary);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.dialog-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.dialog-btn.cancel {
  background: var(--bg-base);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.dialog-btn.cancel:hover {
  background: var(--border);
}

.dialog-btn.confirm {
  background: var(--accent);
  color: white;
}

.dialog-btn.confirm:hover {
  background: var(--accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(var(--accent-rgb), 0.3);
}

.dialog-btn.confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* ========== 通用错误提示 ========== */
.general-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  margin: 0 16px 12px;
  background: var(--danger-bg);
  border: 1px solid var(--danger);
  border-radius: 8px;
  font-size: 13px;
  color: var(--danger);
  cursor: pointer;
  animation: error-slide-in 0.25s ease-out;
}

@keyframes error-slide-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.error-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.error-text {
  flex: 1;
}

.error-dismiss {
  flex-shrink: 0;
  opacity: 0.6;
  font-size: 12px;
}

.error-dismiss:hover {
  opacity: 1;
}
</style>
