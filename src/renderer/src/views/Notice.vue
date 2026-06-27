<template>
  <div class="flex items-center justify-center w-full h-full cursor-grab select-none" @mousedown="dragMouseDown" @mouseup="isKeyDown = false">
    <div class="w-[340px] h-[190px] bg-gradient-to-br from-white to-gray-50 rounded-2xl flex flex-col overflow-hidden shadow-lg border border-white/60">
      <!-- 顶部栏：蓝粉渐变分割线 -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-indigo-100">
        <span class="text-sm font-semibold text-gray-700">📋 通知</span>
        <button
          class="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-red-400 transition-all duration-200 text-xs"
          @click.stop="handleClose"
        >
          ✕
        </button>
      </div>
      <!-- 内容区 -->
      <div class="flex-1 px-4 py-3 overflow-y-auto">
        <p class="text-sm leading-relaxed text-gray-600 break-all m-0">{{ noticeStore.text }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useNoticeStore } from '@renderer/store/noticeStore'

const router = useRouter()
const noticeStore = useNoticeStore()

const isKeyDown = ref(false)
const dinatesX = ref(0)
const dinatesY = ref(0)

/** 关闭通知，跳转回悬浮球（窗口恢复由 Home.vue onMounted 处理） */
const handleClose = () => {
  noticeStore.hideNotice()
  router.push('/')
}

/** 拖拽移动窗口 */
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

<!-- 全局样式：确保通知窗口透明背景 -->
<style>
html,
body {
  background: transparent !important;
}
</style>
