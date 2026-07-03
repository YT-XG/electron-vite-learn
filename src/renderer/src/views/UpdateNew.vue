<template>
  <div class="update-container" :class="{ 'update-visible': isVisible }">
    <div class="update-card">
      <!-- 顶部渐变装饰条（蓝→粉） -->
      <div class="accent-bar" />

      <!-- 关闭按钮 -->
      <button class="close-btn" @click="handleClose">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M1 1L11 11M1 11L11 1"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>

      <!-- 内容区 -->
      <div class="update-body">
        <!-- 图标：蓝粉渐变圆环 + 向上箭头 -->
        <div class="update-icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="13" stroke="url(#iconGrad)" stroke-width="1.5" />
            <path
              d="M14 8V18M10 14L14 10L18 14"
              stroke="url(#iconGrad)"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <defs>
              <linearGradient id="iconGrad" x1="0" y1="0" x2="28" y2="28">
                <stop offset="0%" stop-color="#3b82f6" />
                <stop offset="100%" stop-color="#06b6d4" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <h2 class="update-title">发现新版本</h2>
        <p class="update-version">v{{ version }}</p>

        <!-- 错误提示 -->
        <p v-if="errorMsg" class="update-error">{{ errorMsg }}</p>

        <!-- 下载进度条 -->
        <div v-if="downloadStatus === 'downloading'" class="progress-wrap">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${progress}%` }" />
          </div>
          <span class="progress-text">{{ progress }}%</span>
        </div>

        <!-- 操作按钮 -->
        <div class="update-actions">
          <button class="btn btn-secondary" @click="handleClose">
            {{ downloadStatus === 'installing' ? '取消' : '稍后再说' }}
          </button>

          <!-- 空闲状态：显示立即更新按钮 -->
          <button
            v-if="downloadStatus === 'idle'"
            class="btn btn-primary"
            @click="handleDownload"
          >
            立即更新
          </button>

          <!-- 下载中：显示下载中按钮（禁用） -->
          <button v-else-if="downloadStatus === 'downloading'" class="btn btn-primary" disabled>
            下载中...
          </button>

          <!-- 下载完成：显示安装按钮 -->
          <button
            v-else-if="downloadStatus === 'downloaded'"
            class="btn btn-install"
            @click="handleInstall"
          >
            立即安装
          </button>

          <!-- 安装中：显示安装中按钮（禁用） -->
          <button v-else-if="downloadStatus === 'installing'" class="btn btn-primary" disabled>
            安装中...
          </button>
        </div>
      </div>

      <!-- 底部装饰环 -->
      <div class="ring-deco ring-1" />
      <div class="ring-deco ring-2" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

/** 当前版本号 */
const version = ref('')

/** 更新说明 */
const description = ref('')

/** 下载状态：idle-空闲, downloading-下载中, downloaded-下载完成, installing-安装中 */
type DownloadStatus = 'idle' | 'downloading' | 'downloaded' | 'installing'
const downloadStatus = ref<DownloadStatus>('idle')

/** 下载进度 */
const progress = ref(0)

/** 错误信息 */
const errorMsg = ref('')

/** 页面入场动画状态 */
const isVisible = ref(false)

/**
 * 处理下载按钮点击
 * @description 通知主进程开始下载更新
 */
const handleDownload = (): void => {
  if (downloadStatus.value !== 'idle') return
  downloadStatus.value = 'downloading'
  progress.value = 0
  errorMsg.value = ''
  window.electron.ipcRenderer.send('to-main-UpdateNewFrame:download')
}

/**
 * 处理安装按钮点击
 * @description 通知主进程启动安装程序
 */
const handleInstall = (): void => {
  if (downloadStatus.value !== 'downloaded') return
  downloadStatus.value = 'installing'
  window.electron.ipcRenderer.send('to-main-UpdateNewFrame:install')
}

/**
 * 处理关闭按钮点击
 * @description 播放关闭动画后通知主进程隐藏窗口
 */
const handleClose = (): void => {
  isVisible.value = false
  setTimeout(() => {
    window.electron.ipcRenderer.send('to-main-UpdateNewFrame:destroy')
  }, 300)
}

/**
 * 监听主进程发送的更新信息
 * @description 接收版本号和更新说明
 */
const handleUpdateInfo = (
  _event: Electron.IpcRendererEvent,
  data: { version: string; description: string }
): void => {
  version.value = data.version
  description.value = data.description
}

/**
 * 监听下载进度
 * @description 安全处理进度值，clamp 到 0-100 范围
 */
const handleProgress = (_event: Electron.IpcRendererEvent, data: { percent: number }): void => {
  const p = Math.round(data.percent)
  progress.value = Math.max(0, Math.min(100, isNaN(p) ? 0 : p))
}

/**
 * 监听下载完成
 */
const handleDownloaded = (
  _event: Electron.IpcRendererEvent,
  _data: { path: string }
): void => {
  console.log('下载完成，准备安装')
  downloadStatus.value = 'downloaded'
  progress.value = 100
}

/**
 * 监听下载错误
 * @description 在更新窗口内显示错误信息，不弹出系统错误框
 */
const handleError = (
  _event: Electron.IpcRendererEvent,
  data: { message: string }
): void => {
  console.error('下载失败:', data.message)
  downloadStatus.value = 'idle'
  progress.value = 0
  errorMsg.value = data.message.includes('连接已断开') || data.message.includes('网络连接失败')
    ? '下载失败，请检查网络连接后重试'
    : `更新失败: ${data.message}`
  // 5 秒后自动清除错误信息
  setTimeout(() => {
    errorMsg.value = ''
  }, 5000)
}

/**
 * 监听主进程的动画控制指令
 * @description 控制入场/退场动画的显示状态
 */
const handleAnimate = (
  _event: Electron.IpcRendererEvent,
  data: { type: 'show' | 'hide' }
): void => {
  isVisible.value = data.type === 'show'
}

onMounted(() => {
  // 入场动画：下一帧触发，确保初始 opacity:0 生效后再切换
  requestAnimationFrame(() => {
    isVisible.value = true
  })

  // 注册 IPC 监听器
  window.electron.ipcRenderer.on('to-renderer-UpdateNewFrame:animate', handleAnimate)
  window.electron.ipcRenderer.on('to-renderer-UpdateNewFrame:info', handleUpdateInfo)
  window.electron.ipcRenderer.on('to-renderer-UpdateNewFrame:progress', handleProgress)
  window.electron.ipcRenderer.on('to-renderer-UpdateNewFrame:downloaded', handleDownloaded)
  window.electron.ipcRenderer.on('to-renderer-UpdateNewFrame:error', handleError)

  // 通知主进程：渲染进程已就绪，可以发送数据了
  window.electron.ipcRenderer.send('to-main-UpdateNewFrame:ready')
})

onUnmounted(() => {
  // 清理 IPC 监听器
  window.electron.ipcRenderer.removeListener('to-renderer-UpdateNewFrame:animate', handleAnimate)
  window.electron.ipcRenderer.removeListener('to-renderer-UpdateNewFrame:info', handleUpdateInfo)
  window.electron.ipcRenderer.removeListener('to-renderer-UpdateNewFrame:progress', handleProgress)
  window.electron.ipcRenderer.removeListener('to-renderer-UpdateNewFrame:downloaded', handleDownloaded)
  window.electron.ipcRenderer.removeListener('to-renderer-UpdateNewFrame:error', handleError)
})
</script>

<style scoped>
/* ─── 容器 ─── */
.update-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 20px;
  opacity: 0;
  transform: translateY(30px);
  transition:
    opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
}

.update-container.update-visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

/* ─── 卡片 ─── */
.update-card {
  position: relative;
  width: 340px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 18px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.08),
    0 2px 8px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.6);
  overflow: hidden;
}

/* ─── 顶部渐变装饰条 ─── */
.accent-bar {
  height: 3px;
  background: linear-gradient(90deg, #06b6d4 0%, #3b82f6 40%, #06b6d4 70%, #22c55e 100%);
}

/* ─── 关闭按钮 ─── */
.close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 24px;
  height: 24px;
  border: none;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  transition: all 0.2s ease;
  z-index: 1;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  color: #555;
}

/* ─── 内容区 ─── */
.update-body {
  padding: 24px 28px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* ─── 图标 ─── */
.update-icon {
  margin-bottom: 12px;
}

/* ─── 标题 ─── */
.update-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 4px;
  letter-spacing: 0.3px;
}

/* ─── 版本号 ─── */
.update-version {
  font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
  font-size: 13px;
  color: #3b82f6;
  margin: 0 0 8px;
  font-weight: 500;
}

/* ─── 说明 ─── */
.update-desc {
  font-size: 13px;
  color: #888;
  margin: 0 0 20px;
  text-align: center;
  line-height: 1.5;
}

/* ─── 错误提示 ─── */
.update-error {
  font-size: 12px;
  color: var(--danger-color, #dc2626);
  margin: 0 0 12px;
  text-align: center;
  line-height: 1.5;
  padding: 6px 12px;
  background: var(--danger-bg, #fee2e2);
  border-radius: 8px;
  animation: fadeIn 0.3s ease;
}

/* ─── 进度条 ─── */
.progress-wrap {
  width: 100%;
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: rgba(196, 96, 58, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #06b6d4);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.progress-text {
  font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
  font-size: 11px;
  color: #888;
  min-width: 32px;
  text-align: right;
}

/* ─── 按钮 ─── */
.update-actions {
  display: flex;
  gap: 10px;
  width: 100%;
}

/* 更新窗口按钮：继承共享 .btn 基类，覆盖布局 */
.update-actions .btn {
  flex: 1;
}

/* 安装按钮 - 渐变绿色，区分下载按钮 */
.btn-install {
  background: linear-gradient(135deg, var(--success-color), #15803d);
  color: #fff;
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.25);
}

.btn-install:hover {
  box-shadow: 0 4px 14px rgba(34, 197, 94, 0.35);
  transform: translateY(-1px);
}

.btn-install:active {
  transform: translateY(0);
}

/* ─── 装饰环 ─── */
.ring-deco {
  position: absolute;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 1.5px solid transparent;
  pointer-events: none;
}

.ring-1 {
  bottom: -15px;
  right: -15px;
  border-top-color: #06b6d4;
  border-right-color: #3b82f6;
  animation: update-spin 3s linear infinite;
  opacity: 0.4;
}

.ring-2 {
  bottom: -10px;
  right: -10px;
  width: 40px;
  height: 40px;
  border-bottom-color: #22c55e;
  border-left-color: #06b6d4;
  animation: update-spin-reverse 4s linear infinite;
  opacity: 0.3;
}

/* ─── 全局样式覆盖 ─── */
:global(html),
:global(body) {
  background: transparent !important;
}

@keyframes update-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes update-spin-reverse {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(-360deg);
  }
}
</style>
