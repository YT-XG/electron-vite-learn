<template>
  <div
    class="open-dialog-container"
    :class="[
      `animate-${animDirection}`,
      { 'is-closing': isClosing, 'is-opening': isOpening, 'is-open': isOpen }
    ]"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="dialog-content">
      <div class="dialog-header">
        <span class="dialog-title">Open Dialog</span>
        <button class="close-btn" @click="handleClose">×</button>
      </div>
      <div class="dialog-body">
        <p>这是一个悬浮球展开的对话框窗口</p>
        <p>鼠标移开后会自动关闭</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

/** 动画方向 */
const animDirection = ref<'left' | 'right'>('right')

/** 是否正在关闭 */
const isClosing = ref(false)

/** 是否正在打开 */
const isOpening = ref(false)

/** 是否已展开（展开后保持可见，关闭后恢复） */
const isOpen = ref(false)

/** 处理鼠标进入 */
const handleMouseEnter = () => {
  window.electron.ipcRenderer.send('to-main-OpenDialogFrame:mouseEnter')
}

/** 处理鼠标离开 */
const handleMouseLeave = () => {
  window.electron.ipcRenderer.send('to-main-OpenDialogFrame:mouseLeave')
}

/** 处理关闭按钮点击 */
const handleClose = () => {
  window.electron.ipcRenderer.send('to-main-BaseFrame:closeWindow')
}

/** 监听展开动画事件 */
const handleAnimate = (_event: Electron.IpcRendererEvent, data: { direction: 'left' | 'right' }) => {
  animDirection.value = data.direction
  isOpen.value = true
  isClosing.value = false
  isOpening.value = true

  // 动画结束后移除 opening 状态
  setTimeout(() => {
    isOpening.value = false
  }, 300)
}

/** 监听关闭动画事件 */
const handleCloseAnimate = () => {
  isOpen.value = false
  isClosing.value = true

  // 动画结束后隐藏窗口
  setTimeout(() => {
    window.electron.ipcRenderer.send('to-main-BaseFrame:closeWindow')
  }, 300)
}

onMounted(() => {
  window.electron.ipcRenderer.on('to-renderer-OpenDialogFrame:animate', handleAnimate)
  window.electron.ipcRenderer.on('to-renderer-OpenDialogFrame:close', handleCloseAnimate)
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeListener('to-renderer-OpenDialogFrame:animate', handleAnimate)
  window.electron.ipcRenderer.removeListener('to-renderer-OpenDialogFrame:close', handleCloseAnimate)
})
</script>

<style scoped>
.open-dialog-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform-origin: center center;
}

/* 从右侧展开 */
.animate-right.is-opening {
  animation: slideInRight 0.3s ease-out forwards;
}

.animate-right.is-closing {
  animation: slideOutRight 0.3s ease-in forwards;
}

/* 从左侧展开 */
.animate-left.is-opening {
  animation: slideInLeft 0.3s ease-out forwards;
}

.animate-left.is-closing {
  animation: slideOutLeft 0.3s ease-in forwards;
}

/* 展开完成后保持可见 */
.animate-right.is-open,
.animate-left.is-open {
  opacity: 1;
  transform: scale(1);
}

.dialog-content {
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.close-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  font-size: 20px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.dialog-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.dialog-body p {
  margin: 0 0 12px 0;
  color: #4b5563;
  font-size: 14px;
  line-height: 1.6;
}

.dialog-body p:last-child {
  margin-bottom: 0;
}
</style>

<!-- 全局样式：覆盖 main.css 的背景，确保窗口完全透明 -->
<style>
html,
body {
  background: transparent !important;
}
</style>

<!-- 全局 keyframes -->
<style>
@keyframes slideInRight {
  from {
    opacity: 0;
    transform: scale(0.9) translateX(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateX(0);
  }
}

@keyframes slideOutRight {
  from {
    opacity: 1;
    transform: scale(1) translateX(0);
  }
  to {
    opacity: 0;
    transform: scale(0.9) translateX(20px);
  }
}

@keyframes slideInLeft {
  from {
    opacity: 0;
    transform: scale(0.9) translateX(-20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateX(0);
  }
}

@keyframes slideOutLeft {
  from {
    opacity: 1;
    transform: scale(1) translateX(0);
  }
  to {
    opacity: 0;
    transform: scale(0.9) translateX(-20px);
  }
}
</style>
