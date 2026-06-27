<template>
  <div class="flex items-center justify-center w-full h-full cursor-grab select-none" @mousedown="dragMouseDown" @mouseup="isKeyDown = false">
    <div class="w-[300px] h-[100px] bg-gradient-to-br from-white to-gray-50 rounded-xl flex flex-col overflow-hidden shadow-lg border border-white/60">
      <!-- 顶部栏：只有关闭按钮 -->
      <div class="flex items-center justify-end px-3 py-2">
        <button
          class="w-5 h-5 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-red-400 transition-all duration-200 text-xs"
          @click.stop="handleClose"
        >
          ✕
        </button>
      </div>
      <!-- 剪贴板内容区：最多显示两行，超出用...省略 -->
      <div class="flex-1 px-4 pb-3 overflow-hidden">
        <p class="text-sm leading-relaxed text-gray-700 break-all m-0 line-clamp-2">{{ noticeStore.text }}</p>
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

const isKeyDown = ref(false)
const dinatesX = ref(0)
const dinatesY = ref(0)

// 自动关闭定时器
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 关闭通知，跳转回悬浮球
 */
const handleClose = () => {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer)
    autoCloseTimer = null
  }
  noticeStore.hideNotice()
  router.push('/')
}

/**
 * 拖拽移动窗口
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
        windowWidth: 310,
        windowHeight: 110
      })
    }
  }
  document.onmouseup = () => {
    isKeyDown.value = false
  }
}

onMounted(() => {
  // 10秒后自动关闭
  autoCloseTimer = setTimeout(() => {
    handleClose()
  }, 10000)
})

onUnmounted(() => {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer)
  }
})
</script>

<!-- 全局样式：确保通知窗口透明背景 -->
<style>
html,
body {
  background: transparent !important;
}

/* 文本两行截断，超出用...省略 */
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
