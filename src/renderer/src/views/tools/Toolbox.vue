<template>
  <div class="toolbox">
    <h2 class="toolbox-title">🛠️ 工具箱</h2>
    <div class="tools-grid">
      <div
        v-for="tool in tools"
        :key="tool.id"
        class="tool-card"
        @click="openTool(tool)"
      >
        <span class="tool-icon">{{ tool.icon }}</span>
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
  description: string
}

const tools = ref<Tool[]>([
  {
    id: 'markdown-preview',
    name: 'Markdown 预览',
    icon: '📝',
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
  background: var(--bg-secondary);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.tool-card:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent-blue);
  transform: translateY(-2px);
}

.tool-icon {
  font-size: 28px;
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
