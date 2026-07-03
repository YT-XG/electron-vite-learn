<template>
  <div class="toolbox">
    <h2 class="toolbox-title">工具箱</h2>
    <div class="tools-grid">
      <div
        v-for="tool in tools"
        :key="tool.id"
        class="tool-card"
        @click="openTool(tool)"
      >
        <span class="tool-icon" v-html="tool.iconSvg"></span>
        <span class="tool-name">{{ tool.name }}</span>
        <span class="tool-desc">{{ tool.description }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Tool {
  id: string
  name: string
  icon: string
  iconSvg: string
  description: string
}

const tools = ref<Tool[]>([
  {
    id: 'markdown-preview',
    name: 'Markdown 预览',
    icon: '📝',
    iconSvg: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    description: '实时 Markdown 分屏预览'
  }
])

/**
 * 打开工具
 */
const openTool = (tool: Tool) => {
  switch (tool.id) {
    case 'markdown-preview':
      window.electron.ipcRenderer.send('to-main-MainPage:openMarkdownPreview')
      break
  }
}
</script>

<style scoped>
.toolbox {
  padding: 20px;
}

.toolbox-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 16px 0;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.tool-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-card:hover {
  border-color: var(--accent);
  background: var(--accent-light);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.tool-icon {
  color: var(--accent);
}

.tool-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.tool-desc {
  font-size: 11px;
  color: var(--text-secondary);
  text-align: center;
}
</style>
