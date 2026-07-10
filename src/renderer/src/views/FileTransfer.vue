<template>
  <div class="file-transfer">
    <!-- 顶部：选择文件 + 选择设备 -->
    <div class="transfer-top">
      <!-- 文件选择区 -->
      <div class="section file-section" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave" @drop.prevent="handleDrop">
        <div class="section-header">
          <span class="section-title">选择文件</span>
          <button class="btn-pick" @click="pickFiles">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            <span>添加文件</span>
          </button>
        </div>

        <!-- 已选文件 chips -->
        <div class="file-chips" v-if="selectedFiles.length > 0">
          <div v-for="(file, idx) in selectedFiles" :key="idx" class="file-chip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span class="file-chip-name">{{ file.name }}</span>
            <span class="file-chip-size">{{ formatSize(file.size) }}</span>
            <button class="file-chip-remove" @click="removeFile(idx)" title="移除">×</button>
          </div>
        </div>
        <!-- 空状态：提示拖入 -->
        <div v-else class="file-drop-hint" :class="{ 'drag-over': isDragging }">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="drop-icon">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span class="drop-text">拖拽文件到此处或点击「添加文件」</span>
        </div>
      </div>

      <!-- 设备选择区 -->
      <div class="section device-section">
        <div class="section-header">
          <span class="section-title">选择在线设备 ({{ onlineDevices.length }})</span>
          <button class="btn-refresh" :class="{ refreshing: isRefreshing }" @click="refreshDevices" :disabled="isRefreshing" title="刷新设备列表">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>
        <div class="device-list" v-if="onlineDevices.length > 0">
          <div
            v-for="device in onlineDevices"
            :key="device.address"
            class="device-card"
            :class="{ selected: isSelected(device) }"
            @click="toggleDevice(device)"
          >
            <span class="device-dot online"></span>
            <span class="device-card-name">{{ device.name }}</span>
            <span class="device-card-ip">{{ device.address }}:{{ device.port }}</span>
          </div>
        </div>
        <div v-else class="empty-hint">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <span>未发现在线设备，请先到「联机」页面添加</span>
        </div>
      </div>
    </div>

    <!-- 底部：传输记录 -->
    <div class="transfer-bottom">
      <div class="section-header">
        <span class="section-title">传输记录</span>
        <div class="bottom-actions">
          <span class="server-label">{{ serverInfo.name }} · {{ serverInfo.address }}:{{ serverInfo.port }}</span>
          <button class="btn-send" :disabled="!canSend" @click="sendFiles">
            {{ sending ? '发送中...' : '发送到选中设备' }}
          </button>
        </div>
      </div>
      <div class="records-list" v-if="records.length > 0">
        <div
          v-for="record in records"
          :key="record.id"
          class="record-card"
          :class="'record-' + record.status"
        >
          <div class="record-indicator"></div>
          <div class="record-content">
            <div class="record-header">
              <span class="record-files">{{ record.files.map(f => f.name).join(', ') }}</span>
              <span class="record-status-badge" :class="'badge-' + record.status">{{ statusLabel(record.status) }}</span>
            </div>
            <div class="record-meta">
              <template v-if="record.direction === 'sent'">→ 发往 {{ record.peerName }}</template>
              <template v-else>← 来自 {{ record.peerName }}</template>
            </div>
            <div class="record-progress" v-if="record.status === 'transferring'">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: (record.totalBytes > 0 ? (record.transferredBytes / record.totalBytes * 100) : 0) + '%' }"></div>
              </div>
              <span class="progress-text">{{ formatSize(record.transferredBytes) }} / {{ formatSize(record.totalBytes) }}</span>
              <button class="btn-cancel-transfer" @click="cancelRecord(record.id)" title="取消传输">取消</button>
            </div>
            <div class="record-time" v-else-if="record.completedAt">{{ formatTimeAgo(record.completedAt) }}</div>
            <div class="record-error" v-if="record.errorMessage">{{ record.errorMessage }}</div>
          </div>
        </div>
      </div>
      <div v-else class="empty-hint">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>暂无传输记录</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

interface DeviceInfo {
  name: string
  address: string
  port: number
  version: string
  offline?: boolean
}

interface FileEntry {
  name: string
  path: string
  size: number
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

// ── 状态 ──

const serverInfo = ref({ name: '', address: '', port: 0 })
const onlineDevices = ref<DeviceInfo[]>([])
const selectedDevices = ref<DeviceInfo[]>([])
const selectedFiles = ref<FileEntry[]>([])
const records = ref<TransferRecord[]>([])
const sending = ref(false)
const isDragging = ref(false)
const isRefreshing = ref(false)

// ── 计算属性 ──

const canSend = computed(() => selectedDevices.value.length > 0 && selectedFiles.value.length > 0 && !sending.value)

function isSelected(device: DeviceInfo): boolean {
  return selectedDevices.value.some(d => d.address === device.address)
}

// ── 工具函数 ──

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return new Date(timestamp).toLocaleDateString()
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '等待中', transferring: '传输中', completed: '已完成',
    rejected: '已拒绝', failed: '失败'
  }
  return map[status] || status
}

// ── 操作 ──

function toggleDevice(device: DeviceInfo): void {
  const idx = selectedDevices.value.findIndex(d => d.address === device.address)
  if (idx !== -1) selectedDevices.value.splice(idx, 1)
  else selectedDevices.value.push(device)
}

function removeFile(index: number): void {
  selectedFiles.value.splice(index, 1)
}

async function pickFiles(): Promise<void> {
  const files = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:pickFiles')
  if (files && files.length > 0) {
    for (const f of files) {
      if (!selectedFiles.value.find((sf) => sf.path === f.path)) {
        selectedFiles.value.push(f)
      }
    }
  }
}

async function sendFiles(): Promise<void> {
  if (!canSend.value) return
  sending.value = true
  const targets = [...selectedDevices.value]
  const files = selectedFiles.value.map(f => ({ ...f }))
  selectedFiles.value = []
  selectedDevices.value = []

  for (const device of targets) {
    try {
      await window.electron.ipcRenderer.invoke(
        'to-service-FileTransferService:sendRequest',
        { ...device },
        files
      )
    } catch (err: any) {
      console.error(`发送到 ${device.name} 失败:`, err.message)
    }
  }
  sending.value = false
}

function onDragOver(): void {
  isDragging.value = true
}

function onDragLeave(e: DragEvent): void {
  const target = e.currentTarget as HTMLElement
  const related = e.relatedTarget as HTMLElement
  if (!related || !target.contains(related)) {
    isDragging.value = false
  }
}

function handleDrop(e: DragEvent): void {
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  const MAX_FILES = 200
  for (let i = 0; i < Math.min(files.length, MAX_FILES); i++) {
    const file = files[i]
    const filePath = (file as any).path
    if (!filePath) continue
    if (selectedFiles.value.find(f => f.path === filePath)) continue
    selectedFiles.value.push({ name: file.name, path: filePath, size: file.size })
  }
}

async function refreshDevices(): Promise<void> {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await window.electron.ipcRenderer.invoke('to-service-FileTransferService:scanNow')
  } catch { /* ignore */ }
  setTimeout(() => { isRefreshing.value = false }, 10_000)
}

async function cancelRecord(recordId: string): Promise<void> {
  try {
    await window.electron.ipcRenderer.invoke('to-service-FileTransferService:cancelTransfer', recordId)
  } catch { /* ignore */ }
}

// ── 生命周期 ──

onMounted(async () => {
  serverInfo.value = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:getServerInfo')

  window.electron.ipcRenderer.on('broadcast:transfer-devices-updated', (_e: unknown, list: DeviceInfo[]) => {
    onlineDevices.value = list.filter(d => !d.offline)
  })
  window.electron.ipcRenderer.on('broadcast:transfer-records-updated', (_e: unknown, list: TransferRecord[]) => {
    records.value = list
  })
  window.electron.ipcRenderer.on('broadcast:transfer-scan-completed', () => {
    isRefreshing.value = false
  })

  const all = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:getDevices')
  onlineDevices.value = all.filter((d: DeviceInfo) => !d.offline)
  records.value = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:getRecords')
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners('broadcast:transfer-devices-updated')
  window.electron.ipcRenderer.removeAllListeners('broadcast:transfer-records-updated')
  window.electron.ipcRenderer.removeAllListeners('broadcast:transfer-scan-completed')
})
</script>

<style scoped>
.file-transfer {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── 顶部：文件 + 设备 ── */
.transfer-top {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  min-height: 140px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ── 文件选择区 ── */
.file-section {
  flex: 1;
  min-width: 0;
}

.btn-pick {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 4px 10px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--accent-light);
  color: var(--accent);
  cursor: pointer;
  transition: all 200ms;
}

.btn-pick:hover {
  background: var(--accent);
  color: #fff;
}

.file-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  overflow-y: auto;
  max-height: 80px;
}

.file-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
}

.file-chip-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}

.file-chip-size {
  color: var(--text-tertiary);
  font-size: 10px;
  flex-shrink: 0;
}

.file-chip-remove {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  line-height: 1;
}

.file-chip-remove:hover {
  color: var(--danger);
}

.file-drop-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1;
  border: 1.5px dashed var(--border);
  border-radius: 10px;
  padding: 16px;
  transition: all 200ms;
}

.file-drop-hint.drag-over {
  border-color: var(--accent);
  background: var(--accent-light);
}

.drop-icon {
  color: var(--text-tertiary);
}

.drop-text {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ── 设备选择区 ── */
.device-section {
  width: 260px;
  flex-shrink: 0;
}

.btn-refresh {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 200ms;
}

.btn-refresh:hover { border-color: var(--accent); color: var(--accent); }
.btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-refresh.refreshing svg { animation: spin 1s linear infinite; }

@keyframes spin {
  to { transform: rotate(360deg); }
}

.device-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  max-height: 120px;
}

.device-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 200ms;
}

.device-card:hover {
  border-color: var(--border-hover);
}

.device-card.selected {
  border-color: var(--accent);
  background: var(--accent-light);
}

.device-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.device-dot.online { background: var(--success); }

.device-card-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-card-ip {
  font-size: 10px;
  color: var(--text-tertiary);
  font-family: JetBrains Mono, monospace;
  flex-shrink: 0;
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px;
  color: var(--text-tertiary);
  font-size: 12px;
  text-align: center;
}

/* ── 底部：传输记录 ── */
.transfer-bottom {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
}

.bottom-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.server-label {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: JetBrains Mono, monospace;
}

.btn-send {
  padding: 6px 16px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent), #8b5cf6);
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 200ms;
  white-space: nowrap;
}

.btn-send:hover { opacity: 0.9; }
.btn-send:disabled { opacity: 0.4; cursor: not-allowed; }

.records-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
}

.record-card {
  display: flex;
  gap: 10px;
  background: var(--bg-surface);
  border-radius: 10px;
  padding: 10px 14px;
  border-left: 3px solid var(--border);
}

.record-card.record-transferring { border-left-color: var(--accent); }
.record-card.record-completed { border-left-color: var(--success); }
.record-card.record-rejected,
.record-card.record-failed { border-left-color: var(--danger); }

.record-content { flex: 1; min-width: 0; }

.record-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 3px;
}

.record-files {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-status-badge {
  font-size: 10px;
  padding: 1px 8px;
  border-radius: 100px;
  flex-shrink: 0;
}

.badge-transferring { background: rgba(59,130,246,0.12); color: var(--accent); }
.badge-completed { background: rgba(34,197,94,0.12); color: var(--success); }
.badge-failed, .badge-rejected { background: rgba(239,68,68,0.12); color: var(--danger); }
.badge-pending { background: rgba(245,158,11,0.12); color: var(--warning); }

.record-meta {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}

.record-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: var(--bg-deep);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), #8b5cf6);
  border-radius: 2px;
  transition: width 300ms ease;
}

.progress-text {
  font-size: 11px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.btn-cancel-transfer {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 8px;
  border: 1px solid var(--danger);
  border-radius: 4px;
  background: transparent;
  color: var(--danger);
  cursor: pointer;
  transition: all 200ms;
}

.btn-cancel-transfer:hover {
  background: var(--danger);
  color: white;
}

.record-time {
  font-size: 11px;
  color: var(--text-tertiary);
}

.record-error {
  font-size: 11px;
  color: var(--danger);
  margin-top: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .progress-fill { transition: none; }
}
</style>
