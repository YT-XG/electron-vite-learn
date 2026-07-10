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
            :class="{ active: currentPage === 'clipboard' }"
            @click="currentPage = 'clipboard'"
            :title="isSidebarCollapsed ? '剪切板' : ''"
          >
            <svg
              class="nav-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
            <span class="nav-label" v-if="!isSidebarCollapsed">剪切板</span>
          </button>
          <button
            class="nav-item"
            :class="{ active: currentPage === 'translate' }"
            @click="currentPage = 'translate'"
            :title="isSidebarCollapsed ? '翻译' : ''"
          >
            <svg
              class="nav-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m5 8 6 6" />
              <path d="m4 14 6-6 2-3" />
              <path d="M2 5h12" />
              <path d="M7 2h1" />
              <path d="m22 22-5-10-5 10" />
              <path d="M14 18h6" />
            </svg>
            <span class="nav-label" v-if="!isSidebarCollapsed">翻译</span>
          </button>
          <button
            class="nav-item"
            :class="{ active: currentPage === 'download' }"
            @click="currentPage = 'download'"
            :title="isSidebarCollapsed ? '下载管理' : ''"
          >
            <svg
              class="nav-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span class="nav-label" v-if="!isSidebarCollapsed">下载管理</span>
          </button>
          <button
            class="nav-item"
            :class="{ active: currentPage === 'toolbox' }"
            @click="currentPage = 'toolbox'"
            :title="isSidebarCollapsed ? '工具箱' : ''"
          >
            <svg
              class="nav-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
              />
            </svg>
            <span class="nav-label" v-if="!isSidebarCollapsed">工具箱</span>
          </button>
          <button
            class="nav-item"
            :class="{ active: currentPage === 'fileTransfer' }"
            @click="currentPage = 'fileTransfer'"
            :title="isSidebarCollapsed ? '文件互传' : ''"
          >
            <svg
              class="nav-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span class="nav-label" v-if="!isSidebarCollapsed">文件互传</span>
          </button>
          <button
            class="nav-item"
            :class="{ active: currentPage === 'online' }"
            @click="currentPage = 'online'"
            :title="isSidebarCollapsed ? '联机' : ''"
          >
            <svg
              class="nav-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
            <span class="nav-label" v-if="!isSidebarCollapsed">联机</span>
          </button>
          <button
            class="nav-item"
            :class="{ active: currentPage === 'settings' }"
            @click="currentPage = 'settings'"
            :title="isSidebarCollapsed ? '设置' : ''"
          >
            <svg
              class="nav-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
              />
            </svg>
            <span class="nav-label" v-if="!isSidebarCollapsed">设置</span>
          </button>
          <button
            class="nav-item"
            :class="{ active: currentPage === 'shortcuts' }"
            @click="currentPage = 'shortcuts'"
            :title="isSidebarCollapsed ? '快捷键' : ''"
          >
            <svg
              class="nav-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m6 8 4 4-4 4" />
              <path d="m14 8 4 4-4 4" />
            </svg>
            <span class="nav-label" v-if="!isSidebarCollapsed">快捷键</span>
          </button>
        </nav>
      </aside>
      <!-- 右侧内容区 -->
      <main class="content">
        <Transition name="page-fade" mode="out-in">
          <!-- 剪贴板管理 -->
          <ClipboardManager v-if="currentPage === 'clipboard'" key="clipboard" />
          <!-- 设置 -->
          <Settings v-else-if="currentPage === 'settings'" key="settings" />
          <!-- 快捷键 -->
          <Shortcuts v-else-if="currentPage === 'shortcuts'" key="shortcuts" />
          <!-- 翻译 -->
          <Translate
            v-else-if="currentPage === 'translate'"
            key="translate"
            @goBack="currentPage = 'clipboard'"
          />
          <!-- 下载管理 -->
          <DownloadManager v-else-if="currentPage === 'download'" key="download" />
          <!-- 工具箱 -->
          <Toolbox v-else-if="currentPage === 'toolbox'" key="toolbox" />
          <!-- 联机 -->
          <Online v-else-if="currentPage === 'online'" key="online" />
          <!-- 文件互传 -->
          <FileTransfer v-else-if="currentPage === 'fileTransfer'" key="fileTransfer" />
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
import Toolbox from './tools/Toolbox.vue'
import Online from './Online.vue'
import FileTransfer from './FileTransfer.vue'
import Shortcuts from './Shortcuts.vue'

const version = ref('')
/** 当前页面 */
const currentPage = ref<
  | 'clipboard'
  | 'settings'
  | 'shortcuts'
  | 'translate'
  | 'download'
  | 'toolbox'
  | 'online'
  | 'fileTransfer'
>('clipboard')

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
  // 直接通知主进程隐藏，不依赖 animationend（该事件在 reduced-motion 下不触发）
  setTimeout(() => {
    window.electron.ipcRenderer.send('to-main-MainPage:hideAfterAnimation')
  }, 350)
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
  if (
    [
      'clipboard',
      'settings',
      'shortcuts',
      'translate',
      'download',
      'toolbox',
      'online',
      'fileTransfer'
    ].includes(page)
  ) {
    currentPage.value = page as
      | 'clipboard'
      | 'settings'
      | 'shortcuts'
      | 'translate'
      | 'download'
      | 'toolbox'
      | 'online'
      | 'fileTransfer'
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
  background: var(--bg-base);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  -webkit-app-region: no-drag;
}

/* ========== 入场动画 ========== */
.main-page.page-visible:not(.page-hiding) {
  animation: page-show 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes page-show {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* ========== 退场动画 ========== */
.main-page.page-hiding {
  animation: page-hide 0.25s ease-in forwards;
}

@keyframes page-hide {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

/* ========== 页面切换动画 ========== */
.page-fade-enter-active,
.page-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
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
  background: linear-gradient(90deg, #3b82f6, #06b6d4, #22c55e, #06b6d4, #3b82f6);
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
  padding: 0 12px;
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
  transition: all 0.15s ease;
}

.sidebar-toggle:hover {
  background: var(--bg-surface);
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
  color: var(--text-tertiary);
  background: var(--bg-surface);
  padding: 1px 6px;
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
  transition: all 0.15s ease;
}

.control-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.control-btn:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.close-btn:hover {
  background: var(--danger-bg);
  color: var(--danger);
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
  backdrop-filter: blur(20px) saturate(1.5);
  -webkit-backdrop-filter: blur(20px) saturate(1.5);
  border-right: 1px solid var(--border);
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
  transition: all 0.15s ease;
  text-align: left;
}

.nav-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 10px;
}

.nav-item:hover {
  background: rgba(var(--accent-rgb), 0.06);
}

.nav-item.active {
  background: var(--accent-light);
  color: var(--accent);
}

.nav-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.nav-item.active .nav-icon {
  color: var(--accent);
}

.nav-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.nav-item.active .nav-label {
  color: var(--accent);
  font-weight: 600;
}

/* ========== 内容区 ========== */
.content {
  flex: 1;
  overflow: hidden;
}
</style>
