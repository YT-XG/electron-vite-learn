<template>
  <div class="file-transfer">
    <!-- 顶部本机信息栏 -->
    <div class="transfer-topbar">
      <div class="server-info">
        <span class="status-dot" :class="{ online: serverInfo.port > 0 }"></span>
        <span class="device-name">{{ serverInfo.name }}</span>
        <span class="device-ip">{{ serverInfo.address }}:{{ serverInfo.port }}</span>
      </div>
      <span class="online-badge" v-if="serverInfo.port > 0">已在线</span>
    </div>

    <!-- 主体：左栏 + 右栏 -->
    <div class="transfer-main">
      <!-- 左栏 -->
      <div class="transfer-left">
        <!-- 在线设备 -->
        <div class="section">
          <div class="section-title">
            在线设备 ({{ devices.length }})
          </div>
          <div class="device-list" v-if="devices.length > 0">
            <div
              v-for="device in devices"
              :key="device.address + ':' + device.port"
              class="device-card"
              :class="{ selected: selectedDevice?.address === device.address && selectedDevice?.port === device.port }"
              @click="selectDevice(device)"
            >
              <div class="device-card-top">
                <span class="device-dot online"></span>
                <span class="device-card-name">{{ device.name }}</span>
              </div>
              <div class="device-card-bottom">
                <span class="device-card-ip">{{ device.address }}:{{ device.port }}</span>
                <span class="device-card-selected" v-if="selectedDevice?.address === device.address && selectedDevice?.port === device.port">已选</span>
              </div>
            </div>
          </div>
          <EmptyState v-else icon="search" text="扫描中..." hint="正在搜索局域网内的妙妙屋设备" />
        </div>

        <!-- 已选文件 -->
        <div class="section" v-if="selectedFiles.length > 0">
          <div class="section-title">
            已选文件 ({{ selectedFiles.length }})
          </div>
          <div class="file-chips">
            <div v-for="(file, idx) in selectedFiles" :key="idx" class="file-chip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span class="file-chip-name">{{ file.name }}</span>
              <span class="file-chip-size">{{ formatSize(file.size) }}</span>
              <button class="file-chip-remove" @click="removeFile(idx)" title="移除">×</button>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="transfer-actions">
          <button class="btn btn-secondary" @click="pickFiles">选择文件</button>
          <button
            class="btn btn-primary btn-send"
            :disabled="!canSend"
            @click="sendFiles"
          >
            {{ sending ? '发送中...' : '发送' }}
          </button>
        </div>
      </div>

      <!-- 右栏：传输记录 -->
      <div class="transfer-right">
        <div class="section-title">传输记录</div>
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
                <span class="record-files">
                  {{ record.files.map(f => f.name).join(', ') }}
                </span>
                <span class="record-status-badge" :class="'badge-' + record.status">
                  {{ statusLabel(record.status) }}
                </span>
              </div>
              <div class="record-meta">
                <template v-if="record.direction === 'sent'">→ 发往 {{ record.peerName }}</template>
                <template v-else>← 来自 {{ record.peerName }}</template>
              </div>
              <div class="record-progress" v-if="record.status === 'transferring'">
                <div class="progress-bar">
                  <div
                    class="progress-fill"
                    :style="{ width: record.totalBytes > 0 ? (record.transferredBytes / record.totalBytes * 100) + '%' : '0%' }"
                  ></div>
                </div>
                <span class="progress-text">
                  {{ formatSize(record.transferredBytes) }} / {{ formatSize(record.totalBytes) }}
                </span>
              </div>
              <div class="record-time" v-else-if="record.completedAt">
                {{ formatTimeAgo(record.completedAt) }}
              </div>
              <div class="record-error" v-if="record.errorMessage">
                {{ record.errorMessage }}
              </div>
            </div>
          </div>
        </div>
        <EmptyState v-else icon="folder" text="暂无传输记录" hint="选择一个在线设备，然后发送文件" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import EmptyState from '@renderer/components/EmptyState.vue'

// ── 类型 ──

interface DeviceInfo {
  name: string
  address: string
  port: number
  version: string
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
const devices = ref<DeviceInfo[]>([])
const selectedDevice = ref<DeviceInfo | null>(null)
const selectedFiles = ref<FileEntry[]>([])
const records = ref<TransferRecord[]>([])
const sending = ref(false)

// ── 计算属性 ──

const canSend = computed(() => selectedDevice.value !== null && selectedFiles.value.length > 0 && !sending.value)

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
    pending: '等待中',
    transferring: '传输中',
    completed: '已完成',
    rejected: '已拒绝',
    failed: '失败'
  }
  return map[status] || status
}

// ── 操作 ──

function selectDevice(device: DeviceInfo): void {
  selectedDevice.value = device
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
  try {
    await window.electron.ipcRenderer.invoke(
      'to-service-FileTransferService:sendRequest',
      selectedDevice.value,
      selectedFiles.value
    )
    selectedFiles.value = []
  } catch (err: any) {
    console.error('发送失败:', err.message)
  } finally {
    sending.value = false
  }
}

// ── 生命周期 ──

onMounted(async () => {
  // 获取本机信息
  serverInfo.value = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:getServerInfo')

  // 监听设备更新
  window.electron.ipcRenderer.on('broadcast:transfer-devices-updated', (_event: unknown, list: DeviceInfo[]) => {
    devices.value = list
  })

  // 监听记录更新
  window.electron.ipcRenderer.on('broadcast:transfer-records-updated', (_event: unknown, list: TransferRecord[]) => {
    records.value = list
  })

  // 初始加载
  devices.value = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:getDevices')
  records.value = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:getRecords')
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeListener('broadcast:transfer-devices-updated', () => {})
  window.electron.ipcRenderer.removeListener('broadcast:transfer-records-updated', () => {})
})
</script>

<style scoped>
.file-transfer {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── 顶部信息栏 ── */
.transfer-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.server-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
}
.status-dot.online {
  background: var(--success);
  animation: pulse 2s infinite;
}
.device-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.device-ip {
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: JetBrains Mono, monospace;
}
.online-badge {
  font-size: 11px;
  color: var(--success);
  background: rgba(34, 197, 94, 0.1);
  padding: 2px 10px;
  border-radius: 100px;
}

/* ── 主体 ── */
.transfer-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── 左栏 ── */
.transfer-left {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 16px;
  gap: 16px;
}

/* ── 右栏 ── */
.transfer-right {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* ── 分区标题 ── */
.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

/* ── 设备卡片 ── */
.device-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.device-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  transition: border-color 200ms, background 200ms;
}
.device-card:hover {
  border-color: var(--border-hover);
}
.device-card.selected {
  border-color: var(--accent);
  background: var(--accent-light);
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.12);
}
.device-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.device-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.device-dot.online {
  background: var(--success);
}
.device-card-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}
.device-card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-left: 16px;
}
.device-card-ip {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: JetBrains Mono, monospace;
}
.device-card-selected {
  font-size: 10px;
  color: var(--accent);
  font-weight: 500;
}

/* ── 文件 chips ── */
.file-chips {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.file-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-surface);
  border-radius: 6px;
  font-size: 12px;
}
.file-chip-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}
.file-chip-size {
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.file-chip-remove {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 16px;
  padding: 0 2px;
  line-height: 1;
}
.file-chip-remove:hover {
  color: var(--danger);
}

/* ── 按钮 ── */
.transfer-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}
.btn-send {
  flex: 1;
  background: linear-gradient(135deg, var(--accent), #8b5cf6);
  border: none;
  color: white;
}
.btn-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── 传输记录 ── */
.records-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.record-card {
  display: flex;
  gap: 10px;
  background: var(--bg-surface);
  border-radius: 10px;
  padding: 12px 14px;
  border-left: 3px solid var(--border);
}
.record-card.record-transferring {
  border-left-color: var(--accent);
}
.record-card.record-completed {
  border-left-color: var(--success);
}
.record-card.record-rejected,
.record-card.record-failed {
  border-left-color: var(--danger);
}
.record-content {
  flex: 1;
  min-width: 0;
}
.record-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
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
  margin-bottom: 6px;
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
.record-time {
  font-size: 11px;
  color: var(--text-tertiary);
}
.record-error {
  font-size: 11px;
  color: var(--danger);
  margin-top: 2px;
}

/* ── 动画 ── */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@media (prefers-reduced-motion: reduce) {
  .progress-fill { transition: none; }
  .status-dot.online { animation: none; }
}
</style>
