<template>
  <div class="snippet-picker" @mousedown.stop>
    <!-- 搜索输入框 -->
    <div class="picker-input-wrapper">
      <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        class="picker-input"
        placeholder="搜索片段..."
        @input="onSearch"
        @keydown="onKeydown"
        autofocus
      />
      <div class="input-actions">
        <kbd class="shortcut-hint">ESC</kbd>
      </div>
    </div>

    <!-- ====== 变量输入模式 ====== -->
    <div v-if="showVariableForm" class="variable-form">
      <div class="variable-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 3 21 3 21 8"/>
          <line x1="4" y1="20" x2="21" y2="3"/>
          <polyline points="21 16 21 21 16 21"/>
          <line x1="15" y1="15" x2="21" y2="21"/>
          <line x1="4" y1="4" x2="9" y2="9"/>
        </svg>
        <span>填写变量</span>
      </div>
      <div class="variable-hint">{{ selectedSnippetContent }}</div>
      <div
        v-for="(_, varName) in variableValues"
        :key="varName"
        class="variable-field"
      >
        <label :for="'var-' + varName">{{ varName }}</label>
        <input
          :id="'var-' + varName"
          v-model="variableValues[varName]"
          type="text"
          class="variable-input"
          :placeholder="'输入 ' + varName"
          @keydown="onVariableKeydown($event, Object.keys(variableValues), varName)"
        />
      </div>
      <div class="variable-actions">
        <button class="btn btn-cancel" @click="cancelVariableForm">取消</button>
        <button class="btn btn-confirm" @click="confirmVariableForm" :disabled="!allVariablesFilled">
          确定
        </button>
      </div>
    </div>

    <!-- ====== 搜索结果 ====== -->
    <template v-else>
      <!-- 分类过滤 -->
      <div class="category-bar" v-if="categories.length > 0 && results.length > 0">
        <button
          class="cat-chip"
          :class="{ active: selectedCategory === '' }"
          @click="selectedCategory = ''"
        >
          全部
        </button>
        <button
          v-for="cat in categories"
          :key="cat"
          class="cat-chip"
          :class="{ active: selectedCategory === cat }"
          @click="selectedCategory = cat"
        >
          {{ cat || '未分类' }}
        </button>
      </div>

      <!-- 结果列表 -->
      <div ref="resultsRef" class="picker-results" v-if="filteredResults.length > 0">
        <div
          v-for="(item, index) in filteredResults"
          :key="item.source + '-' + item.id"
          class="result-item"
          :class="[{ active: selectedIndex === index }, 'source-' + item.source]"
          @mouseenter="selectedIndex = index"
          @click="onSelect(item)"
        >
          <!-- 历史记录图标 -->
          <div class="result-icon" v-if="item.source === 'history'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <!-- 片段图标 -->
          <div class="result-icon" v-else>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <div class="result-info">
            <span class="result-content">{{ item.content }}</span>
            <div class="result-meta">
              <!-- 片段：显示分类标签和描述 -->
              <template v-if="item.source === 'favorite'">
                <span class="result-category">{{ item.category || '未分类' }}</span>
                <span class="result-desc" v-if="item.description">{{ item.description }}</span>
              </template>
              <!-- 历史记录：显示来源标记 -->
              <template v-else>
                <span class="result-source">剪贴板</span>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div class="empty-state" v-else-if="query && !searching">
        <svg class="empty-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <span class="empty-text">未找到匹配片段</span>
        <span class="empty-hint">试试其他关键词，或在剪贴板管理中添加片段</span>
      </div>

      <!-- 初始提示 -->
      <div class="empty-state" v-else-if="!query">
        <svg class="empty-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
        </svg>
        <span class="empty-text">输入关键词搜索片段</span>
        <span class="empty-hint">按 ↑↓ 导航，↵ 粘贴，ESC 关闭</span>
      </div>

      <!-- 底部提示 -->
      <div class="picker-footer" v-if="filteredResults.length > 0">
        <span class="footer-hint">
          <kbd>↑</kbd><kbd>↓</kbd> 导航
          <kbd>↵</kbd> 粘贴
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

/**
 * 搜索结果项类型（支持剪贴板历史和收藏片段）
 */
interface SearchResultItem {
  id: number
  content: string
  category?: string
  description?: string
  created_at: number
  source: 'history' | 'favorite'
}

const inputRef = ref<HTMLInputElement>()
const resultsRef = ref<HTMLDivElement>()
const query = ref('')
const results = ref<SearchResultItem[]>([])
const selectedIndex = ref(0)
const searching = ref(false)
const selectedCategory = ref('')

/** 变量模板相关 */
const showVariableForm = ref(false)
const selectedSnippetContent = ref('')
const variableValues = ref<Record<string, string>>({})

/**
 * 按分类过滤后的结果（历史记录始终显示，片段按分类过滤）
 */
const filteredResults = computed(() => {
  if (!selectedCategory.value) return results.value
  return results.value.filter(
    (item) => item.source === 'history' || item.category === selectedCategory.value
  )
})

/**
 * 从片段结果中提取去重的分类列表（历史记录不参与分类过滤）
 */
const categories = computed(() => {
  const cats = new Set(
    results.value
      .filter((item) => item.source === 'favorite' && item.category)
      .map((item) => item.category!)
  )
  return Array.from(cats)
})

/**
 * 所有变量是否已填写
 */
const allVariablesFilled = computed(() => {
  return Object.values(variableValues.value).every((v) => v.trim().length > 0)
})

/**
 * 搜索片段
 */
const onSearch = async () => {
  if (!query.value.trim()) {
    await loadRecentHistory()
    return
  }

  searching.value = true
  try {
    const list = await window.electron.ipcRenderer.invoke(
      'to-main-SnippetPicker:search',
      query.value
    )
    results.value = list || []
    selectedCategory.value = ''
    selectedIndex.value = 0
  } catch (error) {
    console.error('搜索片段失败:', error)
    results.value = []
  } finally {
    searching.value = false
  }
}

/**
 * 加载最近剪贴板历史（搜索框为空时展示）
 */
const loadRecentHistory = async () => {
  searching.value = true
  try {
    const list = await window.electron.ipcRenderer.invoke(
      'to-main-SnippetPicker:getRecentHistory'
    )
    results.value = list || []
    selectedCategory.value = ''
    selectedIndex.value = 0
  } catch (error) {
    console.error('获取最近记录失败:', error)
    results.value = []
  } finally {
    searching.value = false
  }
}

/**
 * 选中项变化时自动滚动到可见区域
 */
watch(selectedIndex, (index) => {
  if (!resultsRef.value || index < 0) return
  const activeItem = resultsRef.value.children[index] as HTMLElement | undefined
  if (!activeItem) return
  activeItem.scrollIntoView({ block: 'nearest', behavior: 'instant' })
})

/**
 * 键盘事件处理
 */
const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, filteredResults.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (filteredResults.value[selectedIndex.value]) {
      onSelect(filteredResults.value[selectedIndex.value])
    }
  } else if (e.key === 'Escape') {
    if (showVariableForm.value) {
      cancelVariableForm()
    } else {
      window.electron.ipcRenderer.send('to-main-SnippetPicker:hide')
    }
  }
}

/**
 * 提取内容中的变量名
 * @param content - 片段内容
 * @returns 变量名数组
 */
const extractVariables = (content: string): string[] => {
  const regex = /\{\{(\w+)\}\}/g
  const vars: string[] = []
  let match
  while ((match = regex.exec(content)) !== null) {
    if (!vars.includes(match[1])) {
      vars.push(match[1])
    }
  }
  return vars
}

/**
 * 选中一条结果
 */
const onSelect = (item: SearchResultItem) => {
  const vars = extractVariables(item.content)
  if (vars.length > 0) {
    // 有变量 → 显示变量输入表单
    selectedSnippetContent.value = item.content
    const values: Record<string, string> = {}
    vars.forEach((v) => (values[v] = ''))
    variableValues.value = values
    showVariableForm.value = true
  } else {
    // 无变量 → 直接粘贴
    window.electron.ipcRenderer.send('to-main-SnippetPicker:paste', item.content)
  }
}

/**
 * 变量输入中的键盘导航
 */
const onVariableKeydown = (
  e: KeyboardEvent,
  keys: string[],
  currentKey: string
) => {
  if (e.key === 'Escape') {
    cancelVariableForm()
    return
  }
  if (e.key !== 'Enter') return
  e.preventDefault()

  const currentIndex = keys.indexOf(currentKey)
  if (currentIndex < keys.length - 1) {
    // 跳到下一个变量输入框
    const nextKey = keys[currentIndex + 1]
    const nextInput = document.getElementById('var-' + nextKey)
    nextInput?.focus()
  } else {
    // 最后一个变量，确认
    confirmVariableForm()
  }
}

/**
 * 取消变量输入
 */
const cancelVariableForm = () => {
  showVariableForm.value = false
  selectedSnippetContent.value = ''
  variableValues.value = {}
}

/**
 * 确认变量替换并粘贴
 */
const confirmVariableForm = () => {
  let content = selectedSnippetContent.value
  // 替换所有 {{变量名}} 为用户输入的值
  Object.entries(variableValues.value).forEach(([key, value]) => {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  })
  window.electron.ipcRenderer.send('to-main-SnippetPicker:paste', content)
  // 重置状态
  cancelVariableForm()
}

/**
 * 监听显示信号（清空状态 + 聚焦 + 加载最近记录）
 */
const onShowSignal = (): void => {
  query.value = ''
  selectedCategory.value = ''
  selectedIndex.value = 0
  showVariableForm.value = false
  selectedSnippetContent.value = ''
  variableValues.value = {}
  inputRef.value?.focus()
  loadRecentHistory()
}

onMounted(() => {
  window.electron.ipcRenderer.on('to-renderer-SnippetPicker:show', onShowSignal)

  inputRef.value?.focus()
  loadRecentHistory()
})

onUnmounted(() => {
  // 卸载时清理 IPC 监听器，避免监听器泄漏
  window.electron.ipcRenderer.removeListener('to-renderer-SnippetPicker:show', onShowSignal)
})
</script>

<style scoped>
/* ========================================
 * 片段选择器 - 跟随主题的毛玻璃风格
 * ======================================== */

.snippet-picker {
  width: 100%;
  height: 100%;
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

.picker-input-wrapper {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  gap: 14px;
  border-bottom: 1px solid var(--border);
  position: relative;
}

.picker-input-wrapper::after {
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

.picker-input-wrapper:focus-within::after {
  opacity: 0.5;
}

.search-icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
  transition: color 0.2s ease;
}

.picker-input-wrapper:focus-within .search-icon {
  color: var(--accent);
}

.picker-input {
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

.picker-input::placeholder {
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

/* ========== 分类过滤芯片 ========== */

.category-bar {
  display: flex;
  gap: 6px;
  padding: 10px 20px 0;
  overflow-x: auto;
  flex-shrink: 0;
}

.category-bar::-webkit-scrollbar {
  height: 0;
}

.cat-chip {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-base);
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.cat-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.cat-chip.active {
  background: var(--accent);
  border-color: transparent;
  color: #fff;
}

/* ========== 搜索结果 ========== */

.picker-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.picker-results::-webkit-scrollbar {
  width: 6px;
}

.picker-results::-webkit-scrollbar-track {
  background: transparent;
}

.picker-results::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.picker-results::-webkit-scrollbar-thumb:hover {
  background: var(--border-hover);
}

.result-item {
  display: flex;
  align-items: flex-start;
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

.result-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface);
  border-radius: 8px;
  flex-shrink: 0;
  color: var(--text-secondary);
  margin-top: 2px;
}

.result-item.active .result-icon {
  background: rgba(var(--accent-rgb), 0.12);
  color: var(--accent);
}

.result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.result-content {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.4;
  /* 单行省略 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-category {
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
  padding: 2px 7px;
  border-radius: 6px;
  flex-shrink: 0;
}

.result-desc {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-source {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid var(--border);
  flex-shrink: 0;
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

.picker-footer {
  padding: 8px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: center;
  flex-shrink: 0;
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

/* ========== 变量输入表单 ========== */

.variable-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  gap: 12px;
  overflow-y: auto;
}

.variable-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent);
  font-size: 14px;
  font-weight: 600;
}

.variable-hint {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-surface);
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  line-height: 1.5;
  max-height: 60px;
  overflow-y: auto;
  word-break: break-all;
}

.variable-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.variable-field label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  text-transform: none;
  letter-spacing: 0.01em;
}

.variable-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-surface);
  outline: none;
  transition: all 0.15s ease;
  box-sizing: border-box;
}

.variable-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.08);
}

.variable-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-cancel {
  background: var(--bg-surface);
  color: var(--text-secondary);
}

.btn-cancel:hover {
  background: var(--border);
}

.btn-confirm {
  background: var(--accent);
  color: #fff;
  box-shadow: 0 2px 8px rgba(var(--accent-rgb), 0.2);
}

.btn-confirm:hover {
  box-shadow: 0 4px 14px rgba(var(--accent-rgb), 0.3);
  transform: translateY(-1px);
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
</style>
