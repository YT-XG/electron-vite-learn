<template>
  <div class="update-container" @mousedown="dragMouseDown">
    <div class="update-card">
      <!-- 头部 -->
      <div class="update-header">
        <div class="update-icon">🔄</div>
        <div class="update-title">
          <h3>发现新版本</h3>
          <span class="version-tag">v{{ version }}</span>
        </div>
        <button class="close-btn" @click.stop="handleClose">✕</button>
      </div>

      <!-- 内容区 -->
      <div class="update-body">
        <!-- 待确认状态 -->
        <div v-if="status === 'pending'" class="status-pending">
          <p class="update-desc">发现新版本 <strong>{{ version }}</strong>，是否立即更新？</p>
          <div v-if="releaseNotes" class="release-notes">
            <h4>更新说明：</h4>
            <p>{{ releaseNotes }}</p>
          </div>
        </div>

        <!-- 下载中状态 -->
        <div v-if="status === 'downloading'" class="status-downloading">
          <p class="downloading-text">正在下载更新...</p>
          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
            </div>
            <span class="progress-text">{{ Math.round(progress) }}%</span>
          </div>
          <p class="speed-text">{{ formatSpeed(bytesPerSecond) }}</p>
        </div>

        <!-- 下载完成状态 -->
        <div v-if="status === 'downloaded'" class="status-downloaded">
          <div class="success-icon">✅</div>
          <p class="success-text">更新下载完成！</p>
          <p class="hint-text">点击"立即重启"完成更新</p>
        </div>

        <!-- 错误状态 -->
        <div v-if="status === 'error'" class="status-error">
          <div class="error-icon">❌</div>
          <p class="error-text">更新失败</p>
          <p class="error-message">{{ errorMessage }}</p>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="update-footer">
        <button
          v-if="status === 'pending'"
          class="btn btn-cancel"
          @click="handleCancel"
        >
          稍后再说
        </button>
        <button
          v-if="status === 'pending'"
          class="btn btn-confirm"
          @click="handleConfirm"
        >
          立即更新
        </button>

        <button
          v-if="status === 'downloading'"
          class="btn btn-cancel"
          @click="handleCancel"
        >
          取消
        </button>

        <button
          v-if="status === 'downloaded'"
          class="btn btn-confirm"
          @click="handleInstall"
        >
          立即重启
        </button>

        <button
          v-if="status === 'error'"
          class="btn btn-cancel"
          @click="handleClose"
        >
          关闭
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

// 状态
const status = ref<'pending' | 'downloading' | 'downloaded' | 'error'>('pending')
const version = ref('')
const releaseNotes = ref('')
const progress = ref(0)
const bytesPerSecond = ref(0)
const errorMessage = ref('')

// 拖拽相关
const isKeyDown = ref(false)
const dinatesX = ref(0)
const dinatesY = ref(0)

/**
 * 拖拽处理
 */
const dragMouseDown = (event: MouseEvent) => {
  isKeyDown.value = true
  dinatesX.value = event.x
  dinatesY.value = event.y
  document.onmousemove = (ev: MouseEvent) => {
    if (isKeyDown.value) {
      window.electron.ipcRenderer.invoke('custom-adsorption', {
        mouseX: ev.screenX,
        mouseY: ev.screenY,
        offsetLeft: dinatesX.value,
        offsetTop: dinatesY.value,
        windowWidth: 420,
        windowHeight: 320
      })
    }
  }
  document.onmouseup = () => {
    isKeyDown.value = false
  }
}

/**
 * 格式化下载速度
 * @param bytes - 每秒字节数
 * @returns 格式化后的速度字符串
 */
const formatSpeed = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B/s`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`
}

/**
 * 关闭窗口
 */
const handleClose = () => {
  window.electron.ipcRenderer.send('close-window')
}

/**
 * 取消更新
 */
const handleCancel = () => {
  window.electron.ipcRenderer.invoke('cancel-update')
  handleClose()
}

/**
 * 确认更新（开始下载）
 */
const handleConfirm = async () => {
  status.value = 'downloading'
  await window.electron.ipcRenderer.invoke('start-download')
}

/**
 * 安装更新
 */
const handleInstall = () => {
  window.electron.ipcRenderer.invoke('install-update')
}

// IPC 事件监听
onMounted(() => {
  // 发现新版本
  window.electron.ipcRenderer.on('update-available', (_event, data) => {
    version.value = data.version
    releaseNotes.value = data.releaseNotes || ''
    status.value = 'pending'
  })

  // 下载进度
  window.electron.ipcRenderer.on('update-progress', (_event, data) => {
    progress.value = data.percent
    bytesPerSecond.value = data.bytesPerSecond
  })

  // 下载完成
  window.electron.ipcRenderer.on('update-downloaded', () => {
    status.value = 'downloaded'
  })

  // 更新错误
  window.electron.ipcRenderer.on('update-error', (_event, data) => {
    status.value = 'error'
    errorMessage.value = data.message
  })
})

onUnmounted(() => {
  // 移除事件监听器
  window.electron.ipcRenderer.removeAllListeners('update-available')
  window.electron.ipcRenderer.removeAllListeners('update-progress')
  window.electron.ipcRenderer.removeAllListeners('update-downloaded')
  window.electron.ipcRenderer.removeAllListeners('update-error')
})
</script>

<style scoped>
.update-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  user-select: none;
}

.update-container:active {
  cursor: grabbing;
}

.update-card {
  width: 400px;
  height: 300px;
  background: rgba(30, 30, 35, 0.95);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

/* 头部 */
.update-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  gap: 12px;
}

.update-icon {
  font-size: 28px;
}

.update-title {
  flex: 1;
}

.update-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.version-tag {
  font-size: 12px;
  color: rgba(100, 200, 255, 0.9);
  background: rgba(100, 200, 255, 0.15);
  padding: 2px 8px;
  border-radius: 10px;
  margin-top: 4px;
  display: inline-block;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 80, 80, 0.3);
  color: rgba(255, 255, 255, 0.9);
}

/* 内容区 */
.update-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.update-desc {
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.75);
  margin: 0 0 16px 0;
}

.release-notes {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 12px;
}

.release-notes h4 {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.release-notes p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.65);
}

/* 下载中状态 */
.status-downloading {
  text-align: center;
}

.downloading-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.75);
  margin: 0 0 16px 0;
}

.progress-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4facfe 0%, #00f2fe 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 13px;
  font-weight: 600;
  color: rgba(100, 200, 255, 0.9);
  min-width: 40px;
  text-align: right;
}

.speed-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin: 8px 0 0 0;
}

/* 下载完成状态 */
.status-downloaded {
  text-align: center;
}

.success-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.success-text {
  font-size: 16px;
  font-weight: 600;
  color: rgba(100, 255, 150, 0.9);
  margin: 0 0 8px 0;
}

.hint-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

/* 错误状态 */
.status-error {
  text-align: center;
}

.error-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.error-text {
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 100, 100, 0.9);
  margin: 0 0 8px 0;
}

.error-message {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
  word-break: break-all;
}

/* 底部按钮 */
.update-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.btn {
  flex: 1;
  height: 40px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
}

.btn-confirm {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: white;
}

.btn-confirm:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(79, 172, 254, 0.4);
}
</style>
