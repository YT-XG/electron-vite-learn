<template>
  <div class="update-container">
    <div class="update-header">
      <h1>软件更新</h1>
      <p class="version">当前版本: {{ currentVersion }}</p>
    </div>

    <!-- 检查更新状态 -->
    <div v-if="status === 'checking'" class="status-section">
      <div class="loading-spinner"></div>
      <p>正在检查更新...</p>
    </div>

    <!-- 没有可用更新 -->
    <div v-else-if="status === 'not-available'" class="status-section success">
      <div class="icon">✓</div>
      <p>当前已是最新版本</p>
      <p class="sub-text">版本: {{ latestVersion }}</p>
      <button class="btn btn-primary" @click="checkForUpdates">再次检查</button>
    </div>

    <!-- 发现新版本 -->
    <div v-else-if="status === 'available'" class="status-section">
      <div class="icon">!</div>
      <p>发现新版本</p>
      <p class="sub-text">新版本: {{ newVersion }}</p>
      <div v-if="releaseNotes" class="release-notes">
        <p class="notes-title">更新内容:</p>
        <div class="notes-content">{{ releaseNotes }}</div>
      </div>
      <div class="button-group">
        <button class="btn btn-primary" @click="startDownload">开始下载</button>
        <button class="btn btn-secondary" @click="skipUpdate">稍后更新</button>
      </div>
    </div>

    <!-- 下载中 -->
    <div v-else-if="status === 'downloading'" class="status-section">
      <p>正在下载更新...</p>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progress + '%' }"></div>
      </div>
      <p class="progress-text">{{ progress.toFixed(1) }}%</p>
      <p class="sub-text">{{ downloadSpeed }}</p>
      <button class="btn btn-secondary" @click="cancelDownload">取消下载</button>
    </div>

    <!-- 下载完成 -->
    <div v-else-if="status === 'downloaded'" class="status-section success">
      <div class="icon">✓</div>
      <p>更新下载完成</p>
      <p class="sub-text">新版本已准备就绪，点击安装并重启应用</p>
      <div class="button-group">
        <button class="btn btn-primary" @click="installUpdate">立即安装</button>
        <button class="btn btn-secondary" @click="skipUpdate">稍后安装</button>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="status === 'error'" class="status-section error">
      <div class="icon">✗</div>
      <p>更新检查失败</p>
      <p class="sub-text">{{ errorMessage }}</p>
      <button class="btn btn-primary" @click="checkForUpdates">重试</button>
    </div>

    <!-- 底部信息 -->
    <div class="footer">
      <p>更新服务由 electron-updater 提供支持</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

/** 更新状态类型 */
type UpdateStatus = 'checking' | 'not-available' | 'available' | 'downloading' | 'downloaded' | 'error'

/** 当前版本 */
const currentVersion = ref('1.0.0')

/** 最新版本 */
const latestVersion = ref('')

/** 新版本号 */
const newVersion = ref('')

/** 更新说明 */
const releaseNotes = ref('')

/** 更新状态 */
const status = ref<UpdateStatus>('checking')

/** 下载进度 */
const progress = ref(0)

/** 下载速度 */
const downloadSpeed = ref('')

/** 错误信息 */
const errorMessage = ref('')

/**
 * 检查更新
 */
const checkForUpdates = () => {
  status.value = 'checking'
  window.electron.ipcRenderer.invoke('check-for-updates')
}

/**
 * 开始下载更新
 */
const startDownload = () => {
  status.value = 'downloading'
  progress.value = 0
  window.electron.ipcRenderer.invoke('start-download')
}

/**
 * 取消下载
 */
const cancelDownload = () => {
  window.electron.ipcRenderer.invoke('cancel-update')
  status.value = 'available'
}

/**
 * 安装更新
 */
const installUpdate = () => {
  window.electron.ipcRenderer.invoke('install-update')
}

/**
 * 跳过更新
 */
const skipUpdate = () => {
  window.electron.ipcRenderer.send('close-window')
}

/**
 * 格式化文件大小
 * @param bytes - 字节数
 * @returns 格式化后的字符串
 */
const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 设置 IPC 事件监听器
 */
const setupIPCListeners = () => {
  // 正在检查更新
  window.electron.ipcRenderer.on('update-checking', () => {
    status.value = 'checking'
  })

  // 发现可用更新
  window.electron.ipcRenderer.on('update-available', (_event, data) => {
    status.value = 'available'
    newVersion.value = data.version
    releaseNotes.value = data.releaseNotes || ''
  })

  // 没有可用更新
  window.electron.ipcRenderer.on('update-not-available', (_event, data) => {
    status.value = 'not-available'
    latestVersion.value = data.version
  })

  // 下载进度
  window.electron.ipcRenderer.on('update-progress', (_event, data) => {
    progress.value = data.percent
    const transferred = formatSize(data.transferred)
    const total = formatSize(data.total)
    const speed = formatSize(data.bytesPerSecond) + '/s'
    downloadSpeed.value = `${transferred} / ${total} (${speed})`
  })

  // 更新下载完成
  window.electron.ipcRenderer.on('update-downloaded', () => {
    status.value = 'downloaded'
  })

  // 更新错误
  window.electron.ipcRenderer.on('update-error', (_event, data) => {
    status.value = 'error'
    errorMessage.value = data.message || '未知错误'
  })
}

/**
 * 移除 IPC 事件监听器
 */
const removeIPCListeners = () => {
  window.electron.ipcRenderer.removeAllListeners('update-checking')
  window.electron.ipcRenderer.removeAllListeners('update-available')
  window.electron.ipcRenderer.removeAllListeners('update-not-available')
  window.electron.ipcRenderer.removeAllListeners('update-progress')
  window.electron.ipcRenderer.removeAllListeners('update-downloaded')
  window.electron.ipcRenderer.removeAllListeners('update-error')
}

onMounted(() => {
  console.log('更新窗口已加载')
  setupIPCListeners()
})

onUnmounted(() => {
  removeIPCListeners()
})
</script>

<style scoped>
.update-container {
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  color: #333;
}

.update-header {
  text-align: center;
  margin-bottom: 30px;
  color: white;
}

.update-header h1 {
  margin: 0 0 10px 0;
  font-size: 28px;
  font-weight: 600;
}

.version {
  margin: 0;
  font-size: 14px;
  opacity: 0.9;
}

.status-section {
  background: white;
  border-radius: 12px;
  padding: 30px;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.status-section.success {
  border-top: 4px solid #10b981;
}

.status-section.error {
  border-top: 4px solid #ef4444;
}

.icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: bold;
  margin-bottom: 20px;
}

.success .icon {
  background: #d1fae5;
  color: #10b981;
}

.error .icon {
  background: #fee2e2;
  color: #ef4444;
}

.status-section p {
  margin: 0 0 10px 0;
  font-size: 18px;
  font-weight: 500;
}

.sub-text {
  color: #6b7280;
  font-size: 14px !important;
  font-weight: normal !important;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e5e7eb;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
  margin: 20px 0 10px 0;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 24px !important;
  font-weight: 600;
  color: #667eea;
  margin: 10px 0 !important;
}

.release-notes {
  width: 100%;
  text-align: left;
  margin: 20px 0;
  padding: 15px;
  background: #f9fafb;
  border-radius: 8px;
}

.notes-title {
  font-weight: 600;
  margin-bottom: 10px !important;
}

.notes-content {
  font-size: 14px;
  line-height: 1.6;
  color: #4b5563;
  white-space: pre-wrap;
}

.button-group {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: #f3f4f6;
  color: #4b5563;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

.footer {
  text-align: center;
  margin-top: 20px;
  color: rgba(255, 255, 255, 0.7);
}

.footer p {
  margin: 0;
  font-size: 12px;
}
</style>
