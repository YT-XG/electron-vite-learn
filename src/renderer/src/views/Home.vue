<template>
  <div class="floating-ball" @mousedown="dragMouseDown">
    <div class="ball-wrapper">
      <div class="ring ring-1"></div>
      <div class="ring ring-2"></div>
      <div class="ball-content">
        <div class="time-main">{{ hours }}:{{ minutes }}</div>
        <div class="time-sec">{{ seconds }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNoticeStore } from '@renderer/store/noticeStore'

const router = useRouter()
const noticeStore = useNoticeStore()

const hours = ref('00')
const minutes = ref('00')
const seconds = ref('00')
const isKeyDown = ref(false)
const dinatesX = ref(0)
const dinatesY = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const updateTime = () => {
  const now = new Date()
  hours.value = String(now.getHours()).padStart(2, '0')
  minutes.value = String(now.getMinutes()).padStart(2, '0')
  seconds.value = String(now.getSeconds()).padStart(2, '0')
}

const dragMouseDown = (event: MouseEvent) => {
  isKeyDown.value = true
  dinatesX.value = event.x
  dinatesY.value = event.y
  document.onmousemove = (ev: MouseEvent) => {
    if (isKeyDown.value) {
      // 发送鼠标屏幕坐标和窗口内偏移量，由主进程处理位置计算和边界限制
      window.electron.ipcRenderer.invoke('custom-adsorption', {
        mouseX: ev.screenX,
        mouseY: ev.screenY,
        offsetLeft: dinatesX.value,
        offsetTop: dinatesY.value,
        windowWidth: 90,
        windowHeight: 90
      })
    }
  }
  document.onmouseup = () => {
    isKeyDown.value = false
  }
}

// 监听剪贴板变化
const handleClipboardChanged = async (_event: Electron.IpcRendererEvent, text: string): Promise<void> => {
  // 获取当前窗口位置，保存到 store 以便关闭通知时恢复
  const [currentX, currentY] = await window.electron.ipcRenderer.invoke('get-window-position')
  noticeStore.showNotice(text, [currentX, currentY])

  // 调整窗口大小（位置安全限制由主进程处理）
  window.electron.ipcRenderer.invoke('resize-window', {
    width: 350,
    height: 200,
    x: currentX,
    y: currentY
  })
  router.push('/notice')
}

onMounted(() => {
  updateTime()
  timer = setInterval(updateTime, 1000)
  window.electron.ipcRenderer.on('clipboard-changed', handleClipboardChanged)
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
  }
  window.electron.ipcRenderer.removeListener('clipboard-changed', handleClipboardChanged)
})
</script>

<style scoped>
.floating-ball {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  user-select: none;
}

.floating-ball:active {
  cursor: grabbing;
}

.ball-wrapper {
  position: relative;
  width: 70px;
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ball-content {
  width: 66px;
  height: 66px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 2;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.08),
    0 4px 16px rgba(0, 0, 0, 0.04);
}

.time-main {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 15px;
  font-weight: 700;
  color: #1a1a1a;
  letter-spacing: 1px;
  line-height: 1;
}

.time-sec {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 10px;
  font-weight: 500;
  color: #888;
  letter-spacing: 2px;
  margin-top: 2px;
  line-height: 1;
}

.ring {
  position: absolute;
  border-radius: 50%;
  border: 1.5px solid transparent;
  pointer-events: none;
}

.ring-1 {
  width: 70px;
  height: 70px;
  top: 0;
  left: 0;
  border-top-color: rgba(120, 180, 255, 0.6);
  border-right-color: rgba(120, 180, 255, 0.2);
  animation: spin 3s linear infinite;
}

.ring-2 {
  width: 70px;
  height: 70px;
  top: 0;
  left: 0;
  border-bottom-color: rgba(255, 150, 200, 0.5);
  border-left-color: rgba(255, 150, 200, 0.15);
  animation: spin-reverse 4s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes spin-reverse {
  from {
    transform: rotate(360deg);
  }
  to {
    transform: rotate(0deg);
  }
}
</style>
