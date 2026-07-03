<template>
  <!-- 右键菜单窗口 -->
  <div class="context-menu" ref="menuRef">
    <template v-for="(item, index) in menuItems" :key="index">
      <!-- 菜单项 -->
      <div
        v-if="!item.separator"
        class="ctx-item"
        @click="onItemClick(item)"
      >
        <span class="ctx-icon">{{ item.icon }}</span>
        <span class="ctx-label">{{ item.label }}</span>
        <span class="ctx-shortcut" v-if="item.shortcut">{{ item.shortcut }}</span>
      </div>
      <!-- 分隔线 -->
      <div v-else class="ctx-separator"></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'

interface MenuItem {
  icon: string
  label: string
  shortcut?: string
  separator?: boolean
  action?: string
}

const menuRef = ref<HTMLDivElement>()
const menuItems = ref<MenuItem[]>([])

/**
 * 显示菜单并调整窗口高度
 */
const showMenu = async (_event: unknown, items: MenuItem[], maxHeight: number) => {
  menuItems.value = items

  // 等待 DOM 更新后计算实际高度
  await nextTick()
  if (menuRef.value) {
    const actualHeight = menuRef.value.scrollHeight + 12 // 加上 padding 6*2
    // 通知主进程调整窗口高度（限制在最大高度内）
    window.electron.ipcRenderer.send(
      'to-main-ContextMenu:resize',
      Math.min(actualHeight, maxHeight)
    )
  }
}

/**
 * 菜单项点击
 */
const onItemClick = (item: MenuItem) => {
  if (item.action) {
    window.electron.ipcRenderer.send('to-main-ContextMenu:click', item.action)
  }
}

onMounted(() => {
  // 监听菜单数据
  window.electron.ipcRenderer.on('to-renderer-ContextMenu:show', showMenu)
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeListener('to-renderer-ContextMenu:show', showMenu)
})
</script>

<style scoped>
/* 右键菜单样式 */
.context-menu {
  position: fixed;
  top: 0;
  left: 0;
  min-width: 180px;
  max-height: 100vh;
  overflow-y: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px;
  box-shadow:
    0 8px 30px -4px var(--shadow-xl),
    0 2px 8px -2px var(--shadow-xl);
  animation: ctx-fade-in 0.12s ease-out;
}

@keyframes ctx-fade-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.ctx-item {
  display: flex;
  align-items: center;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  gap: 10px;
  transition: background 0.1s ease;
  font-size: 13px;
  color: var(--text-primary);
}

.ctx-item:hover {
  background: var(--bg-secondary);
}

.ctx-separator {
  height: 1px;
  background: var(--border);
  margin: 4px 6px;
}

/* 最后一个分隔线不显示（避免底部圆角被遮挡） */
.ctx-separator:last-child {
  display: none;
}

.ctx-icon {
  width: 20px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.ctx-label {
  flex: 1;
}

.ctx-shortcut {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: inherit;
}
</style>

<style>
/* 全局样式 */
html, body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: transparent;
}
</style>
