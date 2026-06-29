<template>
  <div class="floating-ball" @mousedown="dragMouseDown" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
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
      window.electron.ipcRenderer.invoke('to-main-BallFrame:customAdsorption', {
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

/** 鼠标进入悬浮球 */
const handleMouseEnter = () => {
  window.electron.ipcRenderer.send('to-main-BallFrame:openDialogShow')
}

/** 鼠标离开悬浮球 */
const handleMouseLeave = () => {
  window.electron.ipcRenderer.send('to-main-BallFrame:openDialogHide')
}

onMounted(() => {
  updateTime()
  timer = setInterval(updateTime, 1000)
  window.electron.ipcRenderer.send('to-main-BallFrame:windowShow')
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
  }
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
  border-top-color: #78b4ff;
  border-right-color: #3d8bff;
  animation: home-spin 3s linear infinite;
}

.ring-2 {
  width: 70px;
  height: 70px;
  top: 0;
  left: 0;
  border-bottom-color: #ff96c8;
  border-left-color: #ff6ab0;
  animation: home-spin-reverse 4s linear infinite;
}
</style>

<!-- 全局样式：覆盖 main.css 的背景，确保悬浮球窗口完全透明 -->
<style>
html,
body {
  background: transparent !important;
}
</style>

<!-- 全局 keyframes，避免 TailwindCSS v4 preflight 层干扰 scoped 动画 -->
<style>
@keyframes home-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes home-spin-reverse {
  from {
    transform: rotate(360deg);
  }
  to {
    transform: rotate(0deg);
  }
}
</style>
