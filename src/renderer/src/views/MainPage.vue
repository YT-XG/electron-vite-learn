<template>
  <div
    class="main-page"
    :class="{ 'page-visible': isVisible, 'page-hiding': isHiding }"
    @animationend="onAnimationEnd"
  >
    <!-- 顶部渐变色条 - 品牌标识 -->
    <div class="gradient-bar"></div>

    <!-- 自定义标题栏 -->
    <div class="title-bar">
      <div class="title-bar-drag">
        <button
          class="sidebar-toggle"
          @click="toggleSidebar"
          :title="isSidebarCollapsed ? '展开菜单' : '收起菜单'"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="2" y1="3" x2="10" y2="3" stroke="currentColor" stroke-width="1.5" />
            <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.5" />
            <line x1="2" y1="9" x2="10" y2="9" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
        <span class="app-name">妙妙屋</span>
        <span class="app-version" v-if="version">v{{ version }}</span>
      </div>
      <div class="window-controls">
        <button class="control-btn minimize-btn" @click="minimize" title="最小化">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
        <button class="control-btn close-btn" @click="close" title="关闭">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.5" />
            <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 主体内容：侧边栏 + 内容区 -->
    <div class="main-body">
      <!-- 左侧菜单栏 -->
      <aside class="sidebar" :class="{ collapsed: isSidebarCollapsed }">
        <nav class="sidebar-nav">
          <button
            class="nav-item"
            :class="{ active: currentPage === 'home' }"
            @click="currentPage = 'home'"
          >
            <span class="nav-icon">🏠</span>
            <span class="nav-label" v-if="!isSidebarCollapsed">首页</span>
          </button>
          <button
            class="nav-item"
            :class="{ active: currentPage === 'clipboard' }"
            @click="currentPage = 'clipboard'"
          >
            <span class="nav-icon">📋</span>
            <span class="nav-label" v-if="!isSidebarCollapsed">剪切板</span>
          </button>
          <!-- 翻译 -->
          <button
            class="nav-item"
            :class="{ active: currentPage === 'translate' }"
            @click="currentPage = 'translate'"
          >
            <span class="nav-icon">🌐</span>
            <span class="nav-label" v-if="!isSidebarCollapsed">翻译</span>
          </button>
          <!-- 下载管理 -->
          <button
            class="nav-item"
            :class="{ active: currentPage === 'download' }"
            @click="currentPage = 'download'"
          >
            <span class="nav-icon">📥</span>
            <span class="nav-label" v-if="!isSidebarCollapsed">下载管理</span>
          </button>
          <!-- 设置 -->
          <button
            class="nav-item"
            :class="{ active: currentPage === 'settings' }"
            @click="currentPage = 'settings'"
          >
            <span class="nav-icon">⚙️</span>
            <span class="nav-label" v-if="!isSidebarCollapsed">设置</span>
          </button>
        </nav>
      </aside>

      <!-- 右侧内容区 -->
      <main class="content">
        <Transition name="page-fade" mode="out-in">
          <!-- 首页 -->
          <div v-if="currentPage === 'home'" key="home" class="home-page">
            <div class="welcome-icon">✦</div>
            <h2 class="welcome-title">妙妙屋</h2>
            <p class="welcome-desc">你的桌面效率工具</p>
          </div>

          <!-- 剪贴板管理 -->
          <ClipboardManager v-else-if="currentPage === 'clipboard'" key="clipboard" />
          <!-- 设置 -->
          <Settings v-else-if="currentPage === 'settings'" key="settings" />
          <!-- 翻译 -->
          <Translate v-else-if="currentPage === 'translate'" key="translate" @goBack="currentPage = 'home'" />
          <!-- 下载管理 -->
          <DownloadManager v-else-if="currentPage === 'download'" key="download" />
        </Transition>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import ClipboardManager from './ClipboardManager.vue'
import DownloadManager from './DownloadManager.vue'
import Settings from './Settings.vue'
import Translate from './Translate.vue'

const version = ref('')
/** 当前页面 */
const currentPage = ref<'home' | 'clipboard' | 'settings' | 'translate' | 'download'>('clipboard')

/** 页面是否可见（触发动画） */
const isVisible = ref(false)

/** 页面是否正在隐藏（退场动画） */
const isHiding = ref(false)

/** 侧边栏是否收缩 */
const isSidebarCollapsed = ref(false)

/**
 * 切换侧边栏收缩状态
 */
const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

/**
 * 最小化窗口
 */
const minimize = () => {
  window.electron.ipcRenderer.send('to-main-MainPage:minimize')
}

/**
 * 关闭窗口（播放退场动画后隐藏）
 */
const close = () => {
  isHiding.value = true
}

/**
 * 退场动画播放完毕
 */
const onAnimationEnd = (): void => {
  if (isHiding.value) {
    window.electron.ipcRenderer.send('to-main-MainPage:hideAfterAnimation')
  }
}

/**
 * 主进程请求播放退场动画
 */
const onStartHide = (): void => {
  isHiding.value = true
}

/**
 * 主进程请求重新显示（从隐藏状态恢复）
 */
const onReShow = (): void => {
  isHiding.value = false
  isVisible.value = false
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      isVisible.value = true
    })
  })
}

/**
 * 接收应用版本号
 * @param _event - IPC 事件对象
 * @param ver - 版本号字符串
 */
const onVersion = (_event: Electron.IpcRendererEvent, ver: string): void => {
  version.value = ver
}

/**
 * 接收页面切换指令
 * @param _event - IPC 事件对象
 * @param page - 目标页面名称
 */
const onSetPage = (_event: Electron.IpcRendererEvent, page: string): void => {
  if (['home', 'clipboard', 'settings', 'translate', 'download'].includes(page)) {
    currentPage.value = page as 'home' | 'clipboard' | 'settings' | 'translate' | 'download'
  }
}

onMounted(() => {
  // 通知主进程：渲染进程已准备好
  window.electron.ipcRenderer.send('to-main-MainPage:ready')

  // 监听主进程事件
  window.electron.ipcRenderer.on('to-renderer-MainPage:startHide', onStartHide)
  window.electron.ipcRenderer.on('to-renderer-MainPage:reShow', onReShow)
  window.electron.ipcRenderer.on('to-renderer-MainPage:version', onVersion)
  window.electron.ipcRenderer.on('to-renderer-MainPage:setPage', onSetPage)

  // 延迟两帧后触发动画，确保 CSS 初始状态已渲染
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      isVisible.value = true
    })
  })
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeListener('to-renderer-MainPage:startHide', onStartHide)
  window.electron.ipcRenderer.removeListener('to-renderer-MainPage:reShow', onReShow)
  window.electron.ipcRenderer.removeListener('to-renderer-MainPage:version', onVersion)
  window.electron.ipcRenderer.removeListener('to-renderer-MainPage:setPage', onSetPage)
})
</script>

<style scoped>
.main-page {
  width: 100%;
  height: 100%;
  background: var(--bg-primary);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  -webkit-app-region: no-drag;

  /* 初始状态：缩小 */
  transform: scale(0.92);
  transform-origin: center center;
}

/* ========== 入场动画 ========== */
.main-page.page-visible:not(.page-hiding) {
  animation: page-show 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes page-show {
  from {
    transform: scale(0.92);
  }
  to {
    transform: scale(1);
  }
}

/* ========== 退场动画 ========== */
.main-page.page-hiding {
  animation: page-hide 0.3s ease-in forwards;
}

@keyframes page-hide {
  from {
    transform: scale(1);
    opacity: 1;
  }
  to {
    transform: scale(0.85);
    opacity: 0;
  }
}

/* ========== 页面切换动画 ========== */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ========== 渐变色条 ========== */
.gradient-bar {
  height: 3px;
  background: linear-gradient(90deg, #3d8bff, #78b4ff, #a0d0ff, #ff96c8, #ff6ab0, #ff3d8b, #3d8bff);
  background-size: 200% 100%;
  animation: gradient-flow 3s linear infinite;
  flex-shrink: 0;
}

@keyframes gradient-flow {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 200% 50%;
  }
}

/* ========== 标题栏 ========== */
.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 12px 0 12px;
  flex-shrink: 0;
}

.title-bar-drag {
  -webkit-app-region: drag;
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sidebar-toggle {
  -webkit-app-region: no-drag;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.sidebar-toggle:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.app-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.5px;
  user-select: none;
}

.app-version {
  font-size: 10px;
  font-weight: 400;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 4px;
}

.window-controls {
  display: flex;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.control-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.close-btn:hover {
  background: var(--danger-bg);
  color: var(--danger-color);
}

/* ========== 主体布局 ========== */
.main-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ========== 侧边栏 ========== */
.sidebar {
  width: 140px;
  background: var(--bg-glass);
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
  border-right: 1px solid var(--border-color);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  padding: 8px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  transition: width 0.25s ease;
}

.sidebar.collapsed {
  width: 60px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 10px;
}

.nav-item:hover {
  background: var(--bg-secondary);
}

.nav-item.active {
  background: linear-gradient(135deg, rgba(61, 139, 255, 0.08), rgba(255, 106, 176, 0.08));
  color: var(--accent-blue);
}

.nav-icon {
  font-size: 16px;
}

.nav-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.nav-item.active .nav-label {
  color: var(--accent-blue);
  font-weight: 600;
}

/* ========== 内容区 ========== */
.content {
  flex: 1;
  overflow: hidden;
}

/* ========== 首页 ========== */
.home-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.welcome-icon {
  font-size: 32px;
  margin-bottom: 4px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.welcome-title {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(
    90deg,
    var(--accent-blue),
    var(--accent-pink),
    var(--accent-blue)
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  color: transparent;
  animation: gradient-sweep 4s ease infinite;
  margin: 0;
}

@keyframes gradient-sweep {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.welcome-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}
</style>
