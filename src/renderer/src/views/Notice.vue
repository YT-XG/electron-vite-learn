<template>
  <div class="notice-container" @mousedown="dragMouseDown">
    <div class="notice-card">
      <div class="notice-header">
        <span class="notice-title">📋 通知</span>
        <button class="close-btn" @click.stop="handleClose">✕</button>
      </div>
      <div class="notice-body">
        <p class="notice-text">{{ noticeStore.text }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useNoticeStore } from '@renderer/store/noticeStore'

const router = useRouter()
const noticeStore = useNoticeStore()

const isKeyDown = ref(false)
const dinatesX = ref(0)
const dinatesY = ref(0)

import { ref } from 'vue'

const handleClose = () => {
  // 恢复到弹出通知前的位置
  const [x, y] = noticeStore.savedPosition
  noticeStore.hideNotice()
  window.electron.ipcRenderer.invoke('resize-window', { width: 90, height: 90, x, y })
  router.push('/')
}

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
        windowWidth: 350,
        windowHeight: 200
      })
    }
  }
  document.onmouseup = () => {
    isKeyDown.value = false
  }
}
</script>

<style scoped>
.notice-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  user-select: none;
}

.notice-container:active {
  cursor: grabbing;
}

.notice-card {
  width: 340px;
  height: 190px;
  background: rgba(30, 30, 35, 0.92);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.notice-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.notice-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
}

.close-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 80, 80, 0.3);
  color: rgba(255, 255, 255, 0.9);
}

.notice-body {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.notice-text {
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.75);
  word-break: break-all;
  margin: 0;
}
</style>
