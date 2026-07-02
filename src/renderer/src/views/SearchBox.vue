<template>
  <div class="search-box" @mousedown.stop>
    <!-- 搜索输入框 -->
    <div class="search-input-wrapper">
      <span class="search-icon">🔍</span>
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        class="search-input"
        placeholder="搜索工具、剪贴板..."
        @input="onSearch"
        @keydown="onKeydown"
        autofocus
      />
      <span class="shortcut-hint">ESC</span>
    </div>

    <!-- 搜索结果 -->
    <div class="search-results" v-if="results.length > 0">
      <div
        v-for="(result, index) in results"
        :key="result.id"
        class="result-item"
        :class="{ active: selectedIndex === index }"
        @mouseenter="selectedIndex = index"
        @click="onSelect(result)"
      >
        <span class="result-icon">{{ result.icon }}</span>
        <div class="result-info">
          <span class="result-name">{{ result.name }}</span>
          <span class="result-desc">{{ result.description }}</span>
        </div>
        <span class="result-category">{{ getCategoryLabel(result.category) }}</span>
      </div>
    </div>

    <!-- 空状态 -->
    <div class="empty-state" v-else-if="query && !isLoading">
      <span class="empty-icon">🔍</span>
      <span class="empty-text">未找到匹配结果</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface SearchResult {
  id: string
  name: string
  description: string
  icon: string
  category: string
  score: number
}

const inputRef = ref<HTMLInputElement>()
const query = ref('')
const results = ref<SearchResult[]>([])
const selectedIndex = ref(0)
const isLoading = ref(false)

/**
 * 搜索
 */
const onSearch = async () => {
  if (!query.value.trim()) {
    results.value = []
    return
  }

  isLoading.value = true
  try {
    // 搜索工具
    const toolResults = await window.electron.ipcRenderer.invoke(
      'to-main-SearchBox:searchTools',
      query.value
    )

    // 如果不是 cb 开头，只搜索工具
    if (!query.value.toLowerCase().startsWith('cb ')) {
      results.value = toolResults
    } else {
      // 搜索剪贴板
      const clipboardQuery = query.value.substring(3).trim()
      const clipboardResults = await window.electron.ipcRenderer.invoke(
        'to-main-SearchBox:searchClipboard',
        clipboardQuery
      )
      results.value = [...toolResults, ...clipboardResults]
    }

    selectedIndex.value = 0
  } catch (error) {
    console.error('搜索失败:', error)
    results.value = []
  } finally {
    isLoading.value = false
  }
}

/**
 * 键盘事件处理
 */
const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, results.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (results.value[selectedIndex.value]) {
      onSelect(results.value[selectedIndex.value])
    }
  } else if (e.key === 'Escape') {
    window.electron.ipcRenderer.send('to-main-SearchBox:hide')
  }
}

/**
 * 选择搜索结果
 */
const onSelect = (result: SearchResult) => {
  if (result.category === 'clipboard') {
    // 复制剪贴板内容
    window.electron.ipcRenderer.send('to-main-SearchBox:copyClipboard', result.description)
  } else {
    // 执行工具
    window.electron.ipcRenderer.send('to-main-SearchBox:executeTool', result.id)
  }
}

/**
 * 获取分类标签
 */
const getCategoryLabel = (category: string): string => {
  const labels: Record<string, string> = {
    tool: '工具',
    clipboard: '剪贴板',
    app: '应用',
    file: '文件',
    url: '网页'
  }
  return labels[category] || category
}

onMounted(() => {
  inputRef.value?.focus()
})
</script>

<style scoped>
.search-box {
  width: 100%;
  height: 100%;
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.search-icon {
  font-size: 18px;
  margin-right: 12px;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font-size: 16px;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.shortcut-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.result-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.result-item:hover,
.result-item.active {
  background: rgba(255, 255, 255, 0.1);
}

.result-icon {
  font-size: 20px;
  margin-right: 12px;
}

.result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.result-name {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
}

.result-desc {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

.result-category {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.empty-icon {
  font-size: 32px;
  opacity: 0.3;
}

.empty-text {
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
}
</style>
