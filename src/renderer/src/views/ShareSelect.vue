<template>
  <div class="share-select">
    <div class="share-card" @mouseenter="onCardEnter" @mouseleave="onCardLeave">
      <!-- 标题 -->
      <div class="share-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        <span>分享到联机设备</span>
      </div>

      <!-- 文本预览 -->
      <div class="text-preview">{{ shareText }}</div>

      <!-- 设备列表 -->
      <div class="device-section">
        <div class="device-section-title">在线设备 ({{ devices.length }})</div>
        <div class="device-list" v-if="devices.length > 0">
          <div
            v-for="device in devices"
            :key="device.address"
            class="device-card"
            :class="{ selected: selectedDevice?.address === device.address }"
            @click="selectDevice(device)"
          >
            <span class="device-dot online"></span>
            <div class="device-info">
              <span class="device-name">{{ device.name }}</span>
              <span class="device-ip">{{ device.address }}:{{ device.port }}</span>
            </div>
          </div>
        </div>
        <div v-else class="empty-devices">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <span>暂无在线设备</span>
        </div>
      </div>

      <!-- 状态提示 -->
      <div v-if="statusMsg" class="status-msg" :class="statusType">
        {{ statusMsg }}
      </div>

      <!-- 操作按钮 -->
      <div class="share-actions">
        <button class="btn-cancel" @click="close">取消</button>
        <button
          class="btn-send"
          :disabled="!selectedDevice || sending"
          @click="send"
        >
          {{ sending ? '发送中...' : '发送' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

interface DeviceInfo {
  name: string
  address: string
  port: number
  version: string
  offline?: boolean
}

/** 要分享的文本 */
const shareText = ref('')

/** 在线设备列表 */
const devices = ref<DeviceInfo[]>([])

/** 当前选中的设备 */
const selectedDevice = ref<DeviceInfo | null>(null)

/** 是否正在发送 */
const sending = ref(false)

/** 状态提示文本 */
const statusMsg = ref('')

/** 状态类型 */
const statusType = ref<'success' | 'error'>('success')

/**
 * 选择设备
 */
function selectDevice(device: DeviceInfo): void {
  if (device.offline) return
  selectedDevice.value = device
  statusMsg.value = ''
}

/**
 * 发送文本
 */
async function send(): Promise<void> {
  if (!selectedDevice.value || sending.value) return
  sending.value = true
  statusMsg.value = ''

  window.electron.ipcRenderer.send('to-main-ShareSelectFrame:sendText', selectedDevice.value)
}

/**
 * 关闭弹窗
 */
function close(): void {
  window.electron.ipcRenderer.send('to-main-ShareSelectFrame:close')
}

/**
 * 鼠标进入卡片区域：通知主进程关闭鼠标穿透
 */
function onCardEnter(): void {
  window.electron.ipcRenderer.send('to-main-ShareSelectFrame:mouse-enter-card')
}

/**
 * 鼠标离开卡片区域：通知主进程恢复鼠标穿透
 */
function onCardLeave(): void {
  window.electron.ipcRenderer.send('to-main-ShareSelectFrame:mouse-leave-card')
}

onMounted(() => {
  // 接收设备和文本信息
  window.electron.ipcRenderer.on(
    'to-renderer-ShareSelectFrame:show',
    (_e, data: { text: string; devices: DeviceInfo[] }) => {
      shareText.value = data.text
      devices.value = data.devices
    }
  )

  // 接收发送结果
  window.electron.ipcRenderer.on(
    'to-renderer-ShareSelectFrame:sendResult',
    (_e, data: { success: boolean; error?: string }) => {
      sending.value = false
      if (data.success) {
        statusMsg.value = '✅ 已发送'
        statusType.value = 'success'
        // 1.5 秒后自动关闭
        setTimeout(() => close(), 1500)
      } else {
        statusMsg.value = `❌ ${data.error || '发送失败'}`
        statusType.value = 'error'
      }
    }
  )

  // 接收动画指令
  window.electron.ipcRenderer.on(
    'to-renderer-ShareSelectFrame:animate',
    () => {
      // 动画由 CSS transition 控制
    }
  )

  // 通知主进程已就绪
  window.electron.ipcRenderer.send('to-main-ShareSelectFrame:ready')
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners('to-renderer-ShareSelectFrame:show')
  window.electron.ipcRenderer.removeAllListeners('to-renderer-ShareSelectFrame:sendResult')
  window.electron.ipcRenderer.removeAllListeners('to-renderer-ShareSelectFrame:animate')
})
</script>

<style scoped>
.share-select {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  padding: 12px;
}

.share-card {
  width: 100%;
  height: 100%;
  background: var(--bg-elevated, #1e293b);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: auto;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    0 2px 8px rgba(0, 0, 0, 0.2);
}

.share-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #f1f5f9);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border, #334155);
}

.share-header svg {
  color: #667eea;
}

.text-preview {
  font-size: 12px;
  color: var(--text-secondary, #94a3b8);
  background: var(--bg-surface, #0f172a);
  border-radius: 8px;
  padding: 8px 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.device-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  overflow: hidden;
}

.device-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.device-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  flex: 1;
}

.device-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-surface, #0f172a);
  border: 1px solid var(--border, #334155);
  border-radius: 10px;
  cursor: pointer;
  transition: all 200ms;
}

.device-card:hover {
  border-color: var(--border-hover, #475569);
}

.device-card.selected {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
}

.device-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.device-dot.online {
  background: #22c55e;
}

.device-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.device-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #f1f5f9);
}

.device-ip {
  font-size: 11px;
  font-family: JetBrains Mono, monospace;
  color: var(--text-tertiary, #64748b);
}

.empty-devices {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  color: var(--text-tertiary, #64748b);
  font-size: 13px;
}

.status-msg {
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 8px;
  text-align: center;
}

.status-msg.success {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.status-msg.error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.share-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border, #334155);
}

.btn-cancel {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border, #334155);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary, #94a3b8);
  font-size: 13px;
  cursor: pointer;
  transition: all 200ms;
}

.btn-cancel:hover {
  background: var(--bg-surface, #0f172a);
  color: var(--text-primary, #f1f5f9);
}

.btn-send {
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 200ms;
}

.btn-send:hover {
  opacity: 0.9;
}

.btn-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
