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
          <div class="section-title section-title-row">
            <span>在线设备 ({{ devices.length }})</span>
            <button class="btn-refresh" :class="{ refreshing: isRefreshing }" @click="refreshScan" :disabled="isRefreshing" title="重新扫描网段">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              <span v-if="!isRefreshing">刷新</span>
              <span v-else>扫描中...</span>
            </button>
          </div>
          <div class="device-list" v-if="devices.length > 0">
            <div
              v-for="device in devices"
              :key="device.address + ':' + device.port"
              class="device-card"
              :class="{
                selected: selectedDevice?.address === device.address && selectedDevice?.port === device.port,
                offline: device.offline
              }"
              @click="selectDevice(device)"
            >
              <div class="device-card-top">
                <span class="device-dot" :class="device.offline ? 'offline' : 'online'"></span>
                <span class="device-card-name">{{ device.name }}</span>
                <span class="device-card-offline" v-if="device.offline">离线</span>
              </div>
              <div class="device-card-bottom">
                <span class="device-card-ip">{{ device.address }}:{{ device.port }}</span>
                <span class="device-card-selected" v-if="selectedDevice?.address === device.address && selectedDevice?.port === device.port">已选</span>
              </div>
            </div>
          </div>
          <EmptyState v-else icon="search" text="扫描中..." hint="正在搜索局域网内的妙妙屋设备" />
        </div>

        <!-- 手动添加设备 -->
        <div class="section">
          <div class="section-title manual-add-toggle" @click="showManualAdd = !showManualAdd">
            <span>手动添加设备</span>
            <span class="toggle-arrow" :class="{ open: showManualAdd }">▶</span>
          </div>
          <Transition name="slide">
            <div v-if="showManualAdd">
              <div class="manual-add-row">
                <input
                  v-model="manualIP"
                  type="text"
                  class="manual-input"
                  placeholder="IP 地址"
                  spellcheck="false"
                  @keydown.enter="manualAddDevice"
                />
                <input
                  v-model="manualPort"
                  type="number"
                  class="manual-input manual-port"
                  placeholder="端口"
                  @keydown.enter="manualAddDevice"
                />
                <button class="btn btn-ghost btn-add-device" @click="manualAddDevice" :disabled="!manualIP.trim()">添加</button>
              </div>
              <!-- 已持久化的手动设备列表 -->
              <div class="manual-device-tags" v-if="manualDevices.length > 0">
                <div v-for="(dev, idx) in manualDevices" :key="idx" class="manual-device-tag">
                  <span>{{ dev.address }}:{{ dev.port }}</span>
                  <button class="tag-remove" @click="removeManualDevice(dev.address, dev.port)" title="移除">×</button>
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <!-- 添加扫描网段 -->
        <div class="section">
          <div class="section-title manual-add-toggle" @click="showAddSubnet = !showAddSubnet">
            <span>添加扫描网段</span>
            <span class="toggle-arrow" :class="{ open: showAddSubnet }">▶</span>
          </div>
          <Transition name="slide">
            <div v-if="showAddSubnet" class="subnet-config">
              <div class="scan-subnet-tags" v-if="scanSubnets.length > 0">
                <div v-for="(subnet, idx) in scanSubnets" :key="idx" class="scan-subnet-tag">
                  <span>{{ subnet }}</span>
                  <button class="tag-remove" @click="removeSubnet(idx)" title="移除">×</button>
                </div>
              </div>
              <div class="manual-add-row">
                <input
                  v-model="newSubnet"
                  type="text"
                  class="manual-input"
                  placeholder="10.15.66.0/24"
                  spellcheck="false"
                  @keydown.enter="addSubnet"
                />
                <button class="btn btn-ghost btn-add-device" @click="addSubnet" :disabled="!newSubnet.trim()">添加</button>
              </div>
              <p class="scan-hint">支持 10.15.66.xx、10.15.66 等简写，点"刷新"按钮立即扫描</p>
            </div>
          </Transition>
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
const devices = ref<DeviceInfo[]>([])
const selectedDevice = ref<DeviceInfo | null>(null)
const selectedFiles = ref<FileEntry[]>([])
const records = ref<TransferRecord[]>([])
const sending = ref(false)

/** 手动添加设备 */
const showManualAdd = ref(true)
const manualIP = ref('')
const manualPort = ref(17862)

/** 扫描网段 */
const showAddSubnet = ref(true)
const newSubnet = ref('')
const scanSubnets = ref<string[]>([])
const isRefreshing = ref(false)

/** 手动添加的设备列表 */
const manualDevices = ref<{ address: string; port: number }[]>([])

// ── 计算属性 ──

const canSend = computed(() => selectedDevice.value !== null && !selectedDevice.value?.offline && selectedFiles.value.length > 0 && !sending.value)

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
  if (device.offline) return
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
    // 展开 Proxy 对象，避免 Electron IPC 克隆失败
    await window.electron.ipcRenderer.invoke(
      'to-service-FileTransferService:sendRequest',
      { ...selectedDevice.value },
      selectedFiles.value.map(f => ({ ...f }))
    )
    selectedFiles.value = []
  } catch (err: any) {
    console.error('发送失败:', err.message)
  } finally {
    sending.value = false
  }
}

/**
 * 手动添加设备（IP + 发现端口）
 */
async function manualAddDevice(): Promise<void> {
  const ip = manualIP.value.trim()
  if (!ip) return
  const port = manualPort.value || 17862
  try {
    await window.electron.ipcRenderer.invoke('to-service-FileTransferService:addDevice', ip, port)
    manualIP.value = ''
    // 刷新手动设备列表
    manualDevices.value = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:getManualDevices')
  } catch (err: any) {
    console.error('添加设备失败:', err.message)
  }
}

/**
 * 移除一个手动添加的设备（从持久化中删除）
 */
async function removeManualDevice(address: string, port: number): Promise<void> {
  try {
    await window.electron.ipcRenderer.invoke('to-service-FileTransferService:removeManualDevice', address, port)
    manualDevices.value = manualDevices.value.filter((d) => !(d.address === address && d.port === port))
  } catch (err: any) {
    console.error('移除设备失败:', err.message)
  }
}

/**
 * 立即重新扫描所有配置的网段
 * 扫描完成后 broadcast:transfer-devices-updated 会自动更新设备列表
 */
async function refreshScan(): Promise<void> {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await window.electron.ipcRenderer.invoke('to-service-FileTransferService:scanNow')
  } catch {
    isRefreshing.value = false
  }
  // 超时保护：60 秒后仍未收到广播则恢复按钮状态
  setTimeout(() => {
    if (isRefreshing.value) isRefreshing.value = false
  }, 60_000)
}

/**
 * 添加扫描网段（支持智能解析）
 * 输入示例：
 *   10.15.66.0/24  → 直接作为 CIDR
 *   10.15.66.xx    → 解析为 10.15.66.0/24
 *   10.15.66       → 解析为 10.15.66.0/24
 *   10.15.66.*     → 解析为 10.15.66.0/24
 *   10.15.66.0     → 解析为 10.15.66.0/24
 */
async function addSubnet(): Promise<void> {
  let raw = newSubnet.value.trim()
  console.log('[FileTransfer] addSubnet 输入:', JSON.stringify(raw))
  if (!raw) { console.log('[FileTransfer] 输入为空，忽略'); return }

  // 尝试智能解析为 CIDR
  const cidr = parseToCIDR(raw)
  if (!cidr) {
    console.log('[FileTransfer] 无法解析为网段:', raw)
    return
  }

  if (scanSubnets.value.includes(cidr)) {
    console.log('[FileTransfer] 已存在，忽略:', cidr)
    newSubnet.value = ''
    return
  }
  scanSubnets.value.push(cidr)
  newSubnet.value = ''
  console.log('[FileTransfer] 调用 setScanSubnets:', JSON.stringify(scanSubnets.value))
  // 展开数组避免 Vue Proxy 导致 Electron IPC "An object could not be cloned" 错误
  await window.electron.ipcRenderer.invoke('to-service-FileTransferService:setScanSubnets', [...scanSubnets.value])
  console.log('[FileTransfer] setScanSubnets 完成')
}

/**
 * 智能解析输入的文本为 CIDR 格式
 */
function parseToCIDR(input: string): string | null {
  // 已经是 CIDR 格式
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(input)) {
    return input
  }

  // 处理 10.15.66.xx / 10.15.66.x / 10.15.66.* / 10.15.66. 类型
  let match = input.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})[.xX*]+$/)
  if (match) {
    return `${match[1]}.0/24`
  }

  // 处理 10.15.66 类型（3 个八位组）
  match = input.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (match) {
    return `${match[1]}.0/24`
  }

  // 处理 10.15.66.0 类型（完整 IP）
  match = input.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (match) {
    const parts = match[1].split('.').map(Number)
    if (parts.some((n) => n < 0 || n > 255)) return null
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
  }

  return null
}

/**
 * 删除扫描网段
 */
async function removeSubnet(idx: number): Promise<void> {
  scanSubnets.value.splice(idx, 1)
  // 展开数组避免 Vue Proxy 导致 Electron IPC 克隆错误
  await window.electron.ipcRenderer.invoke('to-service-FileTransferService:setScanSubnets', [...scanSubnets.value])
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
  scanSubnets.value = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:getScanSubnets')
  manualDevices.value = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:getManualDevices')

  // 监听手动扫描完成
  window.electron.ipcRenderer.on('broadcast:transfer-scan-completed', () => {
    isRefreshing.value = false
  })
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeListener('broadcast:transfer-devices-updated', () => {})
  window.electron.ipcRenderer.removeListener('broadcast:transfer-records-updated', () => {})
  window.electron.ipcRenderer.removeListener('broadcast:transfer-scan-completed', () => {})
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
.device-card.offline {
  opacity: 0.55;
  cursor: not-allowed;
  border-color: var(--border);
}
.device-card.offline:hover {
  border-color: var(--border);
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
.device-dot.offline {
  background: var(--danger);
}
.device-card-offline {
  font-size: 10px;
  color: var(--danger);
  font-weight: 500;
  margin-left: auto;
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

/* ── 手动添加设备 ── */
.manual-add-toggle {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
}
.manual-add-toggle:hover {
  color: var(--accent);
}
.toggle-arrow {
  font-size: 10px;
  transition: transform 200ms;
}
.toggle-arrow.open {
  transform: rotate(90deg);
}
.manual-add-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.manual-input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  font-size: 12px;
  font-family: JetBrains Mono, monospace;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  outline: none;
}
.manual-input:focus {
  border-color: var(--accent);
}
.manual-port {
  max-width: 70px;
  flex: none;
}
.btn-add-device {
  flex-shrink: 0;
  font-size: 12px;
  padding: 4px 10px;
}

/* slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 200ms ease;
  overflow: hidden;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
}
.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 40px;
  margin-top: 8px;
}

/* ── 刷新按钮 ── */
.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  text-transform: none;
  letter-spacing: normal;
}
.btn-refresh:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-refresh.refreshing svg {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── 扫描网段配置 ── */
.subnet-config {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.scan-subnet-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.scan-subnet-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--accent-light);
  border: 1px solid var(--border);
  border-radius: 100px;
  font-size: 11px;
  color: var(--text-primary);
}
.tag-remove {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  line-height: 1;
}
.tag-remove:hover {
  color: var(--danger);
}
.scan-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin: 0;
}

/* ── 手动设备标签 ── */
.manual-device-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.manual-device-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid var(--border);
  border-radius: 100px;
  font-size: 11px;
  color: var(--text-primary);
  font-family: JetBrains Mono, monospace;
}
</style>
