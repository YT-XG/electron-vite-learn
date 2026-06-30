<template>
  <router-view v-slot="{ Component }">
    <Transition name="fade" mode="out-in">
      <component :is="Component" />
    </Transition>
  </router-view>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

/**
 * 初始化主题：从 localStorage 读取并应用到 HTML 元素
 */
const initTheme = () => {
  const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
  const theme = savedTheme || 'light'
  document.documentElement.setAttribute('data-theme', theme)
}

// 监听 storage 变化（其他窗口修改时同步）
const onStorageChange = (e: StorageEvent) => {
  if (e.key === 'theme') {
    initTheme()
  }
}

onMounted(() => {
  initTheme()
  window.addEventListener('storage', onStorageChange)
})

onUnmounted(() => {
  window.removeEventListener('storage', onStorageChange)
})
</script>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
