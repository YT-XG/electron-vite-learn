<template>
  <div class="search-box" @mousedown.stop>
    <!-- 搜索输入框 -->
    <div class="search-input-wrapper">
      <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
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
      <div class="input-actions">
        <span v-if="isLoading" class="loading-spinner"></span>
        <kbd class="shortcut-hint">ESC</kbd>
      </div>
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
        <span class="result-category" :class="result.category">{{ getCategoryLabel(result.category) }}</span>
      </div>
    </div>

    <!-- 空状态 -->
    <div class="empty-state" v-else-if="query && !isLoading">
      <svg class="empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
      <span class="empty-text">未找到匹配结果</span>
      <span class="empty-hint">试试其他关键词</span>
    </div>

    <!-- 底部提示 -->
    <div class="search-footer" v-if="results.length > 0">
      <span class="footer-hint">
        <kbd>↑</kbd><kbd>↓</kbd> 导航
        <kbd>↵</kbd> 选择
      </span>
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
  // 监听清空消息
  window.electron.ipcRenderer.on('to-renderer-SearchBox:clear', () => {
    query.value = ''
    results.value = []
    selectedIndex.value = 0
    inputRef.value?.focus()
  })

  inputRef.value?.focus()
})
</script>

<style scoped>
/* ========================================
 * 搜索框 - 跟随主题的毛玻璃风格
 * ======================================== */

.search-box {
  width: 100%;
  height: 100%;
  /* 亮色：实心白底；暗色：实心深底 */
  background: var(--bg-base);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  box-shadow:
    0 24px 68px -12px var(--shadow-sm),
    0 0 0 1px var(--border) inset;
}

/* ========== 输入区域 ========== */

.search-input-wrapper {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  gap: 14px;
  border-bottom: 1px solid var(--border);
  position: relative;
}

/* 输入框底部发光线条 */
.search-input-wrapper::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 20px;
  right: 20px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.search-input-wrapper:focus-within::after {
  opacity: 0.5;
}

.search-icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
  transition: color 0.2s ease;
}

.search-input-wrapper:focus-within .search-icon {
  color: var(--accent);
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 400;
  letter-spacing: -0.01em;
  caret-color: var(--accent);
}

.search-input::placeholder {
  color: var(--text-tertiary);
  font-weight: 400;
}

.input-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.shortcut-hint {
  font-size: 11px;
  font-family: inherit;
  font-weight: 500;
  color: var(--text-tertiary);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 3px 7px;
  border-radius: 6px;
  letter-spacing: 0.02em;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ========== 搜索结果 ========== */

.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.search-results::-webkit-scrollbar {
  width: 6px;
}

.search-results::-webkit-scrollbar-track {
  background: transparent;
}

.search-results::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.search-results::-webkit-scrollbar-thumb:hover {
  background: var(--border-hover);
}

.result-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  gap: 12px;
}

.result-item:hover {
  background: var(--bg-surface);
}

.result-item.active {
  background: rgba(var(--accent-rgb), 0.1);
  box-shadow: 0 0 0 1px rgba(var(--accent-rgb), 0.15) inset;
}

.result-item.active .result-icon {
  transform: scale(1.1);
}

.result-icon {
  font-size: 22px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface);
  border-radius: 10px;
  flex-shrink: 0;
  transition: transform 0.15s ease, background 0.15s ease;
}

.result-item.active .result-icon {
  background: rgba(var(--accent-rgb), 0.12);
}

.result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.result-name {
  color: var(--text-primary);
  font-size: 13.5px;
  font-weight: 500;
  letter-spacing: -0.01em;
}

.result-desc {
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-category {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-surface);
  padding: 3px 8px;
  border-radius: 6px;
  flex-shrink: 0;
  letter-spacing: 0.02em;
}

/* 分类标签颜色 */
.result-category.tool {
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
}

.result-category.clipboard {
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.1);
}

/* ========== 空状态 ========== */

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.empty-icon {
  color: var(--text-tertiary);
  margin-bottom: 4px;
  opacity: 0.4;
}

.empty-text {
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
}

.empty-hint {
  color: var(--text-tertiary);
  font-size: 12px;
}

/* ========== 底部提示 ========== */

.search-footer {
  padding: 8px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: center;
}

.footer-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.footer-hint kbd {
  font-family: inherit;
  font-size: 10px;
  font-weight: 500;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 1px 5px;
  border-radius: 4px;
  color: var(--text-secondary);
}
</style>
