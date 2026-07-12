<template>
  <div class="confirm-container" :class="animState" @transitionend="onAnimationEnd">
    <div
      class="confirm-card"
      @mouseenter="onMouseEnterCard"
      @mouseleave="onMouseLeaveCard"
    >
      <!-- 接受前的请求确认视图 -->
      <template v-if="mode === 'request'">
        <div class="confirm-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span class="confirm-title">文件传输请求</span>
        </div>

        <div class="confirm-body">
          <p class="sender-info">
            <strong>{{ requestInfo?.senderName }}</strong> 想要发送 {{ requestInfo?.files.length }} 个文件
          </p>

          <div class="file-list">
            <div v-for="file in requestInfo?.files" :key="file.name" class="file-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span class="file-name">{{ file.name }}</span>
              <span class="file-size">{{ formatSize(file.size) }}</span>
            </div>
          </div>

          <p class="total-size">总大小: {{ formatSize(requestInfo?.totalSize || 0) }}</p>

          <div class="save-dir">
            <span class="save-label">保存至: {{ saveDirDisplay }}</span>
            <button class="btn btn-sm btn-secondary" @click="pickDirectory">更改目录</button>
          </div>
        </div>

        <div class="confirm-actions">
          <button class="btn btn-secondary" @click="respond('reject')">拒绝</button>
          <button class="btn btn-primary" @click="respond('accept')">接受</button>
        </div>
      </template>

      <!-- 接受后的传输进度视图 -->
      <template v-else-if="mode === 'transferring'">
        <div class="confirm-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span class="confirm-title">正在接收文件...</span>
        </div>

        <div class="transfer-progress">
          <div class="progress-bar-large">
            <div class="progress-fill-large" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <p class="progress-text">{{ formatSize(progressBytes) }} / {{ formatSize(totalBytes) }}</p>
          <p class="progress-file" v-if="currentFileName">当前文件: {{ currentFileName }}</p>
        </div>
        <div class="confirm-actions">
          <button class="btn btn-secondary" @click="cancelReceive">取消</button>
        </div>
      </template>

      <!-- 传输完成视图 -->
      <template v-else-if="mode === 'completed'">
        <div class="confirm-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span class="confirm-title">传输完成</span>
        </div>
        <div class="confirm-body">
          <p class="sender-info">已接收 {{ completedCount }} 个文件（{{ formatSize(totalBytes) }}）</p>
        </div>
        <div class="confirm-actions">
          <button class="btn btn-primary" @click="closePopup">关闭</button>
        </div>
      </template>

      <!-- 传输失败/拒绝视图 -->
      <template v-else-if="mode === 'failed' || mode === 'rejected'">
        <div class="confirm-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <span class="confirm-title">{{ mode === 'rejected' ? '已拒绝' : '传输失败' }}</span>
        </div>
        <div class="confirm-body">
          <p class="sender-info">{{ mode === 'rejected' ? '已拒绝接收文件' : (errorMessage || '传输过程中出现错误') }}</p>
        </div>
        <div class="confirm-actions">
          <button class="btn btn-primary" @click="closePopup">关闭</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

interface TransferRequestInfo {
  requestId: string
  senderName: string
  senderAddress: string
  senderPort: number
  files: { name: string; size: number }[]
  totalSize: number
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

const requestInfo = ref<TransferRequestInfo | null>(null)
const saveDir = ref('')
const saveDirDisplay = computed(() => saveDir.value || '默认下载目录')
const animState = ref<'enter' | 'exit' | ''>('')

/** 当前模式 */
const mode = ref<'request' | 'transferring' | 'completed' | 'failed' | 'rejected'>('request')

/** 进度数据 */
const progressBytes = ref(0)
const totalBytes = ref(0)
const currentFileName = ref('')
const completedCount = ref(0)
const errorMessage = ref('')
const progressPercent = computed(() => totalBytes.value > 0 ? Math.min(100, Math.round(progressBytes.value / totalBytes.value * 100)) : 0)

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function onMouseEnterCard(): void {
  window.electron.ipcRenderer.send('to-main-TransferConfirmFrame:mouse-enter-card')
}

function onMouseLeaveCard(): void {
  window.electron.ipcRenderer.send('to-main-TransferConfirmFrame:mouse-leave-card')
}

function closePopup(): void {
  animState.value = 'exit'
}

/** 接收方取消接收（通知发送方停止上传） */
function cancelReceive(): void {
  if (!requestInfo.value) return
  const { senderAddress, senderPort, requestId } = requestInfo.value
  // 通知发送方取消
  window.electron.ipcRenderer.invoke(
    'to-service-FileTransferService:cancelRemoteTransfer',
    senderAddress,
    senderPort || 0,
    requestId
  )
  mode.value = 'rejected'
  setTimeout(() => {
    animState.value = 'exit'
  }, 800)
}

function respond(action: 'accept' | 'reject'): void {
  if (!requestInfo.value) return
  window.electron.ipcRenderer.send(
    'to-main-TransferConfirmFrame:respond',
    requestInfo.value.requestId,
    action,
    saveDir.value
  )
  if (action === 'accept') {
    // 接受后不关闭弹窗，切换到进度视图
    mode.value = 'transferring'
    totalBytes.value = requestInfo.value.totalSize
  }
}

async function pickDirectory(): Promise<void> {
  const dir = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:pickDirectory')
  if (dir) saveDir.value = dir
}

function onAnimationEnd(): void {
  if (animState.value === 'exit') {
    window.electron.ipcRenderer.send('to-main-TransferConfirmFrame:destroy')
  }
}

/** 从传输记录中提取进度 */
function onRecordsUpdate(_event: unknown, records: TransferRecord[]): void {
  if (mode.value !== 'transferring') return
  const record = records.find(r => r.direction === 'received' && r.status !== 'rejected')
  if (!record) return
  progressBytes.value = record.transferredBytes
  if (record.status === 'completed') {
    mode.value = 'completed'
    completedCount.value = record.files.length
  } else if (record.status === 'failed') {
    mode.value = 'failed'
    errorMessage.value = record.errorMessage || ''
  }
}

onMounted(() => {
  window.electron.ipcRenderer.send('to-main-TransferConfirmFrame:ready')

  window.electron.ipcRenderer.on('to-renderer-TransferConfirm:show', (_event: unknown, info: TransferRequestInfo) => {
    requestInfo.value = info
    animState.value = 'enter'
    mode.value = 'request'  // 重置模式，新请求来了不显示旧状态
    progressBytes.value = 0
    totalBytes.value = 0
  })

  window.electron.ipcRenderer.on('to-renderer-TransferConfirm:animate', (_event: unknown, { action }: { action: 'enter' | 'exit' }) => {
    animState.value = action
  })

  // 监听传输进度
  window.electron.ipcRenderer.on('broadcast:transfer-records-updated', onRecordsUpdate)
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeListener('broadcast:transfer-records-updated', onRecordsUpdate)
})
</script>

<style scoped>
.confirm-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 0;
}
.confirm-container.enter .confirm-card {
  transform: translateX(0);
}
.confirm-container.exit .confirm-card {
  transform: translateX(calc(100% + 16px));
}
.confirm-card {
  width: 100%;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  transition: transform 350ms cubic-bezier(0.4, 0, 0.2, 1);
  transform: translateX(calc(100% + 16px));
}
.confirm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.confirm-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.confirm-body {
  margin-bottom: 16px;
}
.sender-info {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 12px;
}
.file-list {
  max-height: 120px;
  overflow-y: auto;
  margin-bottom: 8px;
}
.file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 12px;
}
.file-name {
  flex: 1;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-size {
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.total-size {
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 12px;
}
.save-dir {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--bg-surface);
  border-radius: 8px;
  padding: 8px 12px;
}
.save-label {
  font-size: 11px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.confirm-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.confirm-actions .btn {
  min-width: 80px;
}

/* ── 传输进度 ── */
.transfer-progress {
  padding: 12px 0;
}
.progress-bar-large {
  height: 6px;
  background: var(--bg-deep);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 10px;
}
.progress-fill-large {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), #8b5cf6);
  border-radius: 3px;
  transition: width 300ms ease;
}
.progress-text {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  margin-bottom: 4px;
}
.progress-file {
  font-size: 11px;
  color: var(--text-tertiary);
  text-align: center;
}
@media (prefers-reduced-motion: reduce) {
  .progress-fill-large { transition: none; }
}
</style>
