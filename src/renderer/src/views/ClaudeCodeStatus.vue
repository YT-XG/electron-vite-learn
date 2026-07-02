<template>
  <div class="status-container" :class="{ 'fade-in': isVisible, 'fade-out': isHiding }">
    <div class="status-card">
      <div class="status-inner">
<!--        <span class="status-icon">{{ icon }}</span>-->
        <span class="status-text">{{ displayText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

/** 状态类型 */
type ClaudeCodeStatus =
  | 'running'
  | 'thinking'
  | 'executing'
  | 'waiting_permission'
  | 'completed'

/** 状态图标 */
const icon = ref('🟢')

/** 显示文本 */
const displayText = ref('Claude Code 会话运行中')

/** 是否可见（触发淡入动画） */
const isVisible = ref(false)

/** 是否正在隐藏（触发淡出动画） */
const isHiding = ref(false)

onMounted(() => {
  // 通知主进程渲染已就绪
  window.electron.ipcRenderer.send('to-main-ClaudeCodeStatusFrame:ready')

  // 监听状态更新
  window.electron.ipcRenderer.on(
    'to-renderer-ClaudeCodeStatusFrame:updateStatus',
    (_e, _status: ClaudeCodeStatus, statusIcon: string, text: string) => {
      icon.value = statusIcon
      displayText.value = text
    }
  )

  // 监听显示指令
  window.electron.ipcRenderer.on('to-renderer-ClaudeCodeStatusFrame:show', () => {
    isHiding.value = false
    nextTick(() => {
      isVisible.value = true
    })
  })

  // 监听隐藏指令
  window.electron.ipcRenderer.on('to-renderer-ClaudeCodeStatusFrame:hide', () => {
    isHiding.value = true
    // 动画结束后重置状态
    setTimeout(() => {
      isVisible.value = false
      isHiding.value = false
    }, 300)
  })
})
</script>

<style scoped>
.status-container {
  width: 65%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: none;
}

/* 渐变边框容器 */
.status-card {
  position: relative;
  width: 300px;
  height: 40px;
  border-radius: 20px;
  overflow: hidden;
  pointer-events: auto;
  padding: 2px;

  /* 入场初始状态：透明 */
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 0.3s ease-out,
    transform 0.3s ease-out;
}

/* 渐变边框伪元素 */
.status-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: conic-gradient(
    from var(--border-angle),
    #3d8bff,
    #78b4ff,
    #a0d0ff,
    #d4a8c0,
    #e879a0,
    #c4607a,
    #3d8bff
  );
  animation: border-spin 3s linear infinite;
}

/* 淡入动画触发 */
.status-container.fade-in .status-card {
  opacity: 1;
  transform: translateY(0);
}

/* 淡出动画触发 */
.status-container.fade-out .status-card {
  opacity: 0;
  transform: translateY(20px);
}

/* 白色卡片主体 */
.status-inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  background: var(--bg-primary, #ffffff);
  border-radius: 18px;
  padding: 0 16px;
  box-shadow:
    0 4px 20px var(--shadow-color, rgba(0, 0, 0, 0.1)),
    0 2px 8px rgba(255, 106, 176, 0.15);
}

/* 状态图标 */
.status-icon {
  font-size: 16px;
}

/* 状态文本 */
.status-text {
  color: var(--text-primary, #333);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.3px;
}

/* 渐变角度动画 */
@property --border-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

@keyframes border-spin {
  from {
    --border-angle: 0deg;
  }
  to {
    --border-angle: 360deg;
  }
}
</style>
