<template>
  <div class="confirm-container" :class="animState" @animationend="onAnimationEnd">
    <div
      class="confirm-card"
      @mouseenter="onMouseEnterCard"
      @mouseleave="onMouseLeaveCard"
    >
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'

interface TransferRequestInfo {
  requestId: string
  senderName: string
  senderAddress: string
  files: { name: string; size: number }[]
  totalSize: number
}

const requestInfo = ref<TransferRequestInfo | null>(null)
const saveDir = ref('')
const saveDirDisplay = computed(() => saveDir.value || '默认下载目录')
const animState = ref<'enter' | 'exit' | ''>('')

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

function respond(action: 'accept' | 'reject'): void {
  if (!requestInfo.value) return
  window.electron.ipcRenderer.send(
    'to-main-TransferConfirmFrame:respond',
    requestInfo.value.requestId,
    action,
    saveDir.value
  )
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

onMounted(() => {
  window.electron.ipcRenderer.send('to-main-TransferConfirmFrame:ready')

  window.electron.ipcRenderer.on('to-renderer-TransferConfirm:show', (_event: unknown, info: TransferRequestInfo) => {
    requestInfo.value = info
    animState.value = 'enter'
  })

  window.electron.ipcRenderer.on('to-renderer-TransferConfirm:animate', (_event: unknown, { action }: { action: 'enter' | 'exit' }) => {
    animState.value = action
  })
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
</style>
