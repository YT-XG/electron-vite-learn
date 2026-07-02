<template>
  <div class="download-manager">
    <div class="header">
      <h2 class="title">📥 下载管理</h2>
      <div class="header-actions">
        <!-- 线程数设置 -->
        <div class="threads-setting">
          <span class="threads-label">线程数:</span>
          <select v-model="downloadThreads" class="threads-select" @change="saveThreads">
            <option v-for="n in 16" :key="n" :value="n">{{ n }}</option>
          </select>
        </div>
        <button class="add-btn" @click="showAddDialog = true" title="添加下载">
          <span>+</span>
        </button>
      </div>
    </div>

    <!-- 通用错误提示 -->
    <div v-if="generalError" class="general-error" @click="generalError = ''">
      <span class="error-icon">⚠️</span>
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
  await window.electron.ipcRenderer.invoke('settings:update', {
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
  const settings = await window.electron.ipcRenderer.invoke('settings:get')
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
  background: linear-gradient(90deg, var(--accent), var(--accent-secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
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
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  outline: none;
}

.threads-select:focus {
  border-color: var(--accent);
}

.add-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent), var(--accent-secondary));
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
  box-shadow: 0 4px 12px rgba(196, 96, 58, 0.3);
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
  border-color: var(--accent);
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
  background: rgba(196, 96, 58, 0.15);
  color: var(--accent);
}

.task-status.status-paused {
  background: rgba(224, 160, 96, 0.15);
  color: #e0a060;
}

.task-status.status-completed {
  background: rgba(22, 163, 74, 0.15);
  color: var(--success-color);
}

.task-status.status-failed {
  background: rgba(220, 38, 38, 0.15);
  color: var(--danger-color);
}

.task-status.status-canceled {
  background: rgba(150, 150, 150, 0.15);
  color: var(--text-tertiary);
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
  background: linear-gradient(90deg, var(--accent), var(--accent-secondary));
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
  color: var(--danger-color);
  margin-bottom: 8px;
  padding: 6px 8px;
  background: rgba(220, 38, 38, 0.1);
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
  transition: all 0.15s ease;
}

.action-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.pause-btn,
.resume-btn {
  background: linear-gradient(135deg, var(--accent), var(--accent-secondary));
  color: white;
}

.pause-btn:hover,
.resume-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(196, 96, 58, 0.3);
}

.cancel-btn {
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.cancel-btn:hover {
  background: var(--danger-bg);
  color: var(--danger-color);
  border-color: var(--danger-color);
}

.open-btn,
.retry-btn {
  background: linear-gradient(135deg, var(--success-color), #22c55e);
  color: white;
}

.open-btn:hover,
.retry-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(22, 163, 74, 0.3);
}

.folder-btn {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.folder-btn:hover {
  background: var(--border-color);
  border-color: var(--border-color-hover);
}

.remove-btn {
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.remove-btn:hover {
  background: var(--danger-bg);
  color: var(--danger-color);
  border-color: var(--danger-color);
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
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  background: var(--bg-primary);
  border-radius: 12px;
  padding: 20px;
  width: 320px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
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
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
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
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.dialog-btn.cancel {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.dialog-btn.cancel:hover {
  background: rgba(0, 0, 0, 0.1);
}

.dialog-btn.confirm {
  background: linear-gradient(135deg, var(--accent), var(--accent-secondary));
  color: white;
}

.dialog-btn.confirm:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(196, 96, 58, 0.3);
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
  border: 1px solid var(--danger-color);
  border-radius: 8px;
  font-size: 13px;
  color: var(--danger-color);
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
