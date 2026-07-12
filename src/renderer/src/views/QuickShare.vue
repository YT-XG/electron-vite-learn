<template>
  <div class="quick-share">
    <div class="share-card" :class="animClass" @mouseenter="onCardEnter" @mouseleave="onCardLeave">
      <!-- 标题 -->
      <div class="share-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>分享文件到联机设备</span>
        <span class="file-count">{{ files.length }} 个文件 · {{ formatTotalSize() }}</span>
      </div>

      <!-- 设备列表 -->
      <div class="device-section">
        <div class="section-label">选择目标设备</div>
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

      <!-- 文件列表 -->
      <div class="files-section" v-if="files.length > 0">
        <div class="section-label">待发送文件</div>
        <div class="file-list">
          <div v-for="(file, idx) in files" :key="idx" class="file-row">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span class="file-name">{{ file.name }}</span>
            <span class="file-size">{{ formatSize(file.size) }}</span>
          </div>
        </div>
      </div>

      <!-- 状态提示 -->
      <div v-if="statusMsg" class="status-msg" :class="statusType">{{ statusMsg }}</div>

      <!-- 操作按钮 -->
      <div class="share-actions">
        <button class="btn-cancel" @click="close">取消</button>
        <button class="btn-send" :disabled="!selectedDevice || sending" @click="send">
          {{ sending ? '发送中...' : '发送文件' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

interface FileEntry { name: string; path: string; size: number }
interface DeviceInfo { name: string; address: string; port: number; version: string; offline?: boolean }

const files = ref<FileEntry[]>([])
const devices = ref<DeviceInfo[]>([])
const selectedDevice = ref<DeviceInfo | null>(null)
const sending = ref(false)
const statusMsg = ref('')
const statusType = ref<'success' | 'error'>('success')
/** 入场/退场动画状态，对应 .anim-enter / .anim-exit CSS class */
const animClass = ref('')

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatTotalSize(): string {
  const total = files.value.reduce((s, f) => s + f.size, 0)
  return formatSize(total)
}

function selectDevice(device: DeviceInfo): void {
  selectedDevice.value = device
  statusMsg.value = ''
}

function send(): void {
  if (!selectedDevice.value || sending.value) return
  sending.value = true
  statusMsg.value = ''
  window.electron.ipcRenderer.send('to-main-QuickShareFrame:sendFiles', { ...selectedDevice.value })
}

function close(): void {
  animClass.value = 'anim-exit'
  setTimeout(() => {
    window.electron.ipcRenderer.send('to-main-QuickShareFrame:close')
  }, 300)
}

function onCardEnter(): void {
  window.electron.ipcRenderer.send('to-main-QuickShareFrame:mouse-enter-card')
}

function onCardLeave(): void {
  window.electron.ipcRenderer.send('to-main-QuickShareFrame:mouse-leave-card')
}

onMounted(() => {
  window.electron.ipcRenderer.on('to-renderer-QuickShareFrame:show', (_e, data: { files: FileEntry[]; devices: DeviceInfo[] }) => {
    files.value = data.files
    devices.value = data.devices
  })

  window.electron.ipcRenderer.on('to-renderer-QuickShareFrame:sendResult', (_e, data: { success: boolean; error?: string }) => {
    sending.value = false
    if (data.success) {
      statusMsg.value = '✅ 文件已发送'
      statusType.value = 'success'
      setTimeout(() => close(), 1500)
    } else {
      statusMsg.value = `❌ ${data.error || '发送失败'}`
      statusType.value = 'error'
    }
  })

  window.electron.ipcRenderer.on('to-renderer-QuickShareFrame:animate', (_e, data: { action: string }) => {
    // 双 requestAnimationFrame 确保窗口初始帧已绘制后，再添加动画 class
    // 第一帧 rAF → 渲染初始（无动画 class）状态
    // 第二帧 rAF → 添加动画 class，CSS @keyframes 从 from 状态开始播放
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (data.action === 'enter') {
          animClass.value = 'anim-enter'
        } else if (data.action === 'exit') {
          animClass.value = 'anim-exit'
        }
      })
    })
  })

  window.electron.ipcRenderer.send('to-main-QuickShareFrame:ready')
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners('to-renderer-QuickShareFrame:show')
  window.electron.ipcRenderer.removeAllListeners('to-renderer-QuickShareFrame:sendResult')
  window.electron.ipcRenderer.removeAllListeners('to-renderer-QuickShareFrame:animate')
})
</script>

<style scoped>
.quick-share {
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
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2);
}

.share-card.anim-enter {
  animation: quickShareEnter 250ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.share-card.anim-exit {
  animation: quickShareExit 250ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes quickShareEnter {
  from {
    opacity: 0;
    transform: scale(0.85);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes quickShareExit {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.85);
  }
}

.share-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #f1f5f9);
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border, #334155);
}

.share-header svg { color: var(--accent, #3b82f6); }
.file-count { font-size: 11px; font-weight: 400; color: var(--text-tertiary, #64748b); margin-left: auto; }

.device-section { flex: 1; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
.files-section { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; max-height: 100px; }
.section-label { font-size: 11px; font-weight: 600; color: var(--text-secondary, #94a3b8); text-transform: uppercase; letter-spacing: 0.5px; }

.device-list { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; flex: 1; }
.device-card {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  background: var(--bg-surface, #0f172a); border: 1px solid var(--border, #334155);
  border-radius: 10px; cursor: pointer; transition: all 200ms;
}
.device-card:hover { border-color: var(--border-hover, #475569); }
.device-card.selected { border-color: var(--accent, #3b82f6); background: rgba(59, 130, 246, 0.1); }

.device-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.device-dot.online { background: #22c55e; }
.device-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.device-name { font-size: 13px; font-weight: 500; color: var(--text-primary, #f1f5f9); }
.device-ip { font-size: 11px; font-family: JetBrains Mono, monospace; color: var(--text-tertiary, #64748b); }

.empty-devices {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; flex: 1; color: var(--text-tertiary, #64748b); font-size: 13px;
}

.file-list { display: flex; flex-direction: column; gap: 3px; overflow-y: auto; }
.file-row {
  display: flex; align-items: center; gap: 6px; padding: 4px 8px;
  background: var(--bg-surface, #0f172a); border-radius: 6px; font-size: 12px;
}
.file-row svg { color: var(--text-tertiary, #64748b); flex-shrink: 0; }
.file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary, #f1f5f9); }
.file-size { font-size: 10px; color: var(--text-tertiary, #64748b); flex-shrink: 0; }

.status-msg { font-size: 12px; padding: 6px 10px; border-radius: 8px; text-align: center; }
.status-msg.success { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
.status-msg.error { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

.share-actions { display: flex; gap: 8px; padding-top: 10px; border-top: 1px solid var(--border, #334155); }
.btn-cancel {
  flex: 1; padding: 8px; border: 1px solid var(--border, #334155); border-radius: 8px;
  background: transparent; color: var(--text-secondary, #94a3b8); font-size: 13px;
  cursor: pointer; transition: all 200ms;
}
.btn-cancel:hover { background: var(--bg-surface, #0f172a); color: var(--text-primary, #f1f5f9); }

.btn-send {
  flex: 1; padding: 8px; border: none; border-radius: 8px;
  background: linear-gradient(135deg, var(--accent, #3b82f6), #8b5cf6);
  color: white; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 200ms;
}
.btn-send:hover { opacity: 0.9; }
.btn-send:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
