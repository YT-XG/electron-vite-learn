<template>
  <div class="online-page">
    <!-- 顶部本机信息栏 -->
    <div class="online-topbar">
      <div class="server-info">
        <span class="status-dot" :class="{ online: serverInfo.port > 0 }"></span>
        <span class="device-name">{{ serverInfo.name }}</span>
        <span class="device-ip">{{ serverInfo.address }}:{{ serverInfo.port }}</span>
      </div>
      <span class="online-badge" v-if="serverInfo.port > 0">已在线</span>
    </div>

    <!-- 主体内容 -->
    <div class="online-main">
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
            :key="device.address"
            class="device-card"
            :class="{ offline: device.offline }"
          >
            <div class="device-card-top">
              <span class="device-dot" :class="device.offline ? 'offline' : 'online'"></span>
              <span class="device-card-name">{{ device.name }}</span>
              <span class="device-card-offline" v-if="device.offline">离线</span>
            </div>
            <div class="device-card-bottom">
              <span class="device-card-ip">{{ device.address }}:{{ device.port }}</span>
              <span class="device-card-version" v-if="device.version">v{{ device.version }}</span>
            </div>
          </div>
        </div>
        <EmptyState v-else icon="search" text="扫描中..." hint="正在搜索局域网内的设备" />
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
                placeholder="IP 地址（自动探针发现端口）"
                spellcheck="false"
                @keydown.enter="manualAddDevice"
              />
              <button class="btn btn-ghost btn-add-device" @click="manualAddDevice" :disabled="!manualIP.trim() || manualAdding">{{ manualAdding ? '添加中...' : '添加' }}</button>
            </div>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import EmptyState from '@renderer/components/EmptyState.vue'

interface DeviceInfo {
  name: string
  address: string
  port: number
  version: string
  offline?: boolean
}

// ── 状态 ──

const serverInfo = ref({ name: '', address: '', port: 0 })
const devices = ref<DeviceInfo[]>([])
const isRefreshing = ref(false)

/** 手动添加设备 */
const showManualAdd = ref(true)
const manualIP = ref('')
const manualAdding = ref(false)
const manualDevices = ref<{ address: string; port: number }[]>([])

/** 扫描网段 */
const showAddSubnet = ref(true)
const newSubnet = ref('')
const scanSubnets = ref<string[]>([])

// ── 操作 ──

/**
 * 手动添加设备（仅 IP，端口由探针自动发现）
 */
async function manualAddDevice(): Promise<void> {
  const ip = manualIP.value.trim()
  if (!ip || manualAdding.value) return
  manualAdding.value = true
  try {
    await window.electron.ipcRenderer.invoke('to-service-FileTransferService:addDevice', ip, 0)
    manualIP.value = ''
    manualDevices.value = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:getManualDevices')
  } catch (err: any) {
    console.error('添加设备失败:', err.message)
  } finally {
    manualAdding.value = false
  }
}

/**
 * 移除手动添加的设备
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
 */
async function refreshScan(): Promise<void> {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await window.electron.ipcRenderer.invoke('to-service-FileTransferService:scanNow')
  } catch {
    isRefreshing.value = false
  }
  setTimeout(() => {
    if (isRefreshing.value) isRefreshing.value = false
  }, 60_000)
}

/**
 * 智能解析输入的文本为 CIDR 格式
 */
function parseToCIDR(input: string): string | null {
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(input)) {
    return input
  }
  let match = input.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})[.xX*]+$/)
  if (match) {
    return `${match[1]}.0/24`
  }
  match = input.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (match) {
    return `${match[1]}.0/24`
  }
  match = input.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (match) {
    const parts = match[1].split('.').map(Number)
    if (parts.some((n) => n < 0 || n > 255)) return null
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
  }
  return null
}

/**
 * 添加扫描网段
 */
async function addSubnet(): Promise<void> {
  let raw = newSubnet.value.trim()
  if (!raw) return
  const cidr = parseToCIDR(raw)
  if (!cidr) return
  if (scanSubnets.value.includes(cidr)) {
    newSubnet.value = ''
    return
  }
  scanSubnets.value.push(cidr)
  newSubnet.value = ''
  await window.electron.ipcRenderer.invoke('to-service-FileTransferService:setScanSubnets', [...scanSubnets.value])
}

/**
 * 删除扫描网段
 */
async function removeSubnet(idx: number): Promise<void> {
  scanSubnets.value.splice(idx, 1)
  await window.electron.ipcRenderer.invoke('to-service-FileTransferService:setScanSubnets', [...scanSubnets.value])
}

// ── 生命周期 ──

onMounted(async () => {
  serverInfo.value = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:getServerInfo')

  window.electron.ipcRenderer.on('broadcast:transfer-devices-updated', (_event: unknown, list: DeviceInfo[]) => {
    devices.value = list
  })

  devices.value = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:getDevices')
  scanSubnets.value = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:getScanSubnets')
  manualDevices.value = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:getManualDevices')

  window.electron.ipcRenderer.on('broadcast:transfer-scan-completed', () => {
    isRefreshing.value = false
  })
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners('broadcast:transfer-devices-updated')
  window.electron.ipcRenderer.removeAllListeners('broadcast:transfer-scan-completed')
})
</script>

<style scoped>
.online-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.online-topbar {
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

.online-main {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

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
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

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
  transition: border-color 200ms, background 200ms;
}

.device-card:hover {
  border-color: var(--border-hover);
}

.device-card.offline {
  opacity: 0.55;
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

.device-dot.online { background: var(--success); }
.device-dot.offline { background: var(--danger); }

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

.device-card-version {
  font-size: 10px;
  color: var(--text-tertiary);
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

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

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

.btn-add-device {
  flex-shrink: 0;
  font-size: 12px;
  padding: 4px 10px;
}

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

.scan-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin: 0;
}

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

@media (prefers-reduced-motion: reduce) {
  .status-dot.online { animation: none; }
}
</style>
