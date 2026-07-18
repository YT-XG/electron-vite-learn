<template>
  <div class="json-tree-view">
    <!-- 搜索栏 -->
    <div class="tree-search-bar">
      <div class="search-input-wrapper">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          class="search-input"
          type="text"
          placeholder="搜索键或值..."
          @input="onSearchInput"
          @keydown.enter.prevent="onSearchEnter"
          @keydown.escape="clearSearch"
        />
        <button v-if="searchQuery" class="search-clear" @click="clearSearch" title="清除搜索">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div v-if="searchQuery" class="search-matches">
        <span class="match-count">{{ currentMatchIndex + 1 }}/{{ matchPaths.length }} 匹配</span>
        <button class="match-nav-btn" @click="navigateMatch(-1)" :disabled="matchPaths.length === 0" title="上一个匹配">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <button class="match-nav-btn" @click="navigateMatch(1)" :disabled="matchPaths.length === 0" title="下一个匹配">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
        <button class="match-nav-btn" @click="toggleCaseSensitive" :class="{ active: caseSensitive }" title="大小写敏感">
          <span class="case-text">Aa</span>
        </button>
      </div>
      <div class="tree-actions">
        <button class="tree-action-btn" @click="expandAll" title="全部展开">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 13 12 18 17 13" /><polyline points="7 6 12 11 17 6" /></svg>
          全部展开
        </button>
        <button class="tree-action-btn" @click="collapseAll" title="全部折叠">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 11 12 6 7 11" /><polyline points="17 18 12 13 7 18" /></svg>
          全部折叠
        </button>
      </div>
    </div>

    <!-- 树内容 -->
    <div class="tree-content">
      <!-- 空状态 -->
      <div v-if="!hasData" class="tree-empty">
        <EmptyState icon="tool" text="没有可显示的 JSON 数据" hint="请先在文本编辑器中输入并格式化 JSON" />
      </div>

      <!-- 搜索无结果 -->
      <div v-else-if="searchQuery && displayItems.length === 0" class="tree-empty">
        <EmptyState icon="search" text="未找到匹配结果" :hint="`没有包含「${searchQuery}」的键或值`" />
      </div>

      <!-- 树节点列表 -->
      <div v-else class="tree-node-list">
        <div
          v-for="item in displayItems"
          :key="item.path"
          :ref="(el) => registerNodeRef(el, item.path)"
          class="tree-node"
          :class="{
            'is-search-match': item.isMatch,
            'is-current-match': item.isCurrentMatch,
            'is-clickable': item.canExpand,
            'is-collapsed': item.canExpand && !item.isExpanded
          }"
          :style="{ paddingLeft: 8 + item.depth * 18 + 'px' }"
          @click="onNodeClick(item)"
          @dblclick="onNodeDblClick(item)"
        >
          <!-- 展开/折叠箭头 -->
          <span v-if="item.canExpand" class="node-arrow" :class="{ expanded: item.isExpanded }">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </span>
          <span v-else class="node-arrow-placeholder"></span>

          <!-- 键名 -->
          <span class="node-key">{{ item.displayKey }}</span>

          <!-- 分隔符 / 值 -->
          <template v-if="item.canExpand && item.isExpanded">
            <!-- 展开状态：对象/数组，只显示开括号 -->
            <span class="node-bracket">{{ item.type === 'array' ? '[' : '{' }}</span>
            <span class="node-summary">{{ item.childCount }} 项</span>
            <span class="node-bracket end-bracket">{{ item.type === 'array' ? ']' : '}' }}</span>
          </template>
          <template v-else-if="item.canExpand && !item.isExpanded">
            <!-- 折叠状态：显示一行摘要 -->
            <span class="node-bracket">{{ item.type === 'array' ? '[' : '{' }}</span>
            <span class="node-summary">{{ item.childCount }} 项</span>
            <span class="node-bracket">{{ item.type === 'array' ? ']' : '}' }}</span>
          </template>
          <template v-else>
            <!-- 叶子节点：分隔符 + 值 -->
            <span class="node-sep">: </span>
            <template v-if="editingPath === item.path">
              <!-- 内联编辑输入框 -->
              <input
                :ref="setEditInputRef"
                v-model="editValue"
                class="edit-input"
                :class="`edit-${item.type}`"
                :type="item.type === 'number' ? 'number' : 'text'"
                @keydown.enter.prevent="confirmEdit"
                @keydown.escape.prevent="cancelEdit"
                @blur="confirmEdit"
              />
            </template>
            <template v-else>
              <span v-if="item.type === 'string'" class="node-value node-string" :class="{ 'has-match': item.isMatch }">
                <span v-if="item.isMatch" v-html="highlightMatch(String(item.value))"></span>
                <template v-else>"{{ item.value }}"</template>
              </span>
              <span v-else-if="item.type === 'number'" class="node-value node-number">{{ item.value }}</span>
              <span v-else-if="item.type === 'boolean'" class="node-value node-boolean">{{ item.value }}</span>
              <span v-else-if="item.type === 'null'" class="node-value node-null">null</span>
            </template>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import EmptyState from '../../components/EmptyState.vue'

/** JSON 树形视图组件 - 递归渲染可折叠的 JSON 树 */
defineOptions({ name: 'JsonTreeView' })

const props = defineProps<{
  jsonData: unknown
}>()

const emit = defineEmits<{
  'node-click': [path: string, displayKey: string, depth: number]
  'value-change': [path: string, newValue: string, valueType: 'string' | 'number' | 'boolean' | 'null']
}>()

// ── 树节点类型 ──
interface TreeNodeItem {
  path: string
  displayKey: string
  depth: number
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'
  value: unknown
  canExpand: boolean
  isExpanded: boolean
  childCount: number
}

// ── 状态 ──
const expanded = ref<Set<string>>(new Set())
const searchQuery = ref('')
const caseSensitive = ref(false)
const currentMatchIndex = ref(0)
const searchInputRef = ref<HTMLInputElement | null>(null)

/** 当前正在编辑值的节点路径（null = 未编辑） */
const editingPath = ref<string | null>(null)
/** 编辑中的临时输入值 */
const editValue = ref('')
/** 编辑输入框元素引用（不在 v-for 中使用 string ref） */
const editingInputEl = ref<HTMLInputElement | null>(null)

/**
 * 编辑输入框的 ref 回调（v-for 中必须用函数 ref 而非 string ref）
 */
const setEditInputRef = (el: unknown): void => {
  if (el instanceof HTMLInputElement) {
    editingInputEl.value = el
  }
}

/** 双击检测定时器 */
let clickTimer: ReturnType<typeof setTimeout> | null = null

// 节点 DOM 引用映射
const nodeRefs = new Map<string, HTMLElement>()

function registerNodeRef(el: unknown, path: string): void {
  if (el instanceof HTMLElement) {
    nodeRefs.set(path, el)
  }
}

// ── 展开/折叠 ──
function toggleExpand(path: string): void {
  const s = new Set(expanded.value)
  if (s.has(path)) {
    s.delete(path)
  } else {
    s.add(path)
  }
  expanded.value = s
}

function expandAll(): void {
  const s = new Set<string>()
  function collect(data: unknown, path: string): void {
    if (data === null || typeof data !== 'object') return
    s.add(path)
    // 统一使用 Object.entries，数组的索引会被转换为字符串键
    const entries = Object.entries(data)
    for (const [k, v] of entries) {
      // 必须与 treeItems walk() 中 ${path}.${k} 的路径格式完全一致
      // 根节点 path='' 时子节点路径为 .key 而非 key
      collect(v, `${path}.${k}`)
    }
  }
  collect(props.jsonData, '$')
  expanded.value = s
}

function collapseAll(): void {
  expanded.value = new Set()
}

// ── 搜索匹配路径（必须展开的祖先路径） ──
const matchPaths = computed<string[]>(() => {
  const q = searchQuery.value.trim()
  if (!q) return []

  const results: string[] = []

  function walk(data: unknown, path: string, key: string): void {
    const lowerQ = caseSensitive.value ? q : q.toLowerCase()

    // 匹配键名
    const keyStr = caseSensitive.value ? key : key.toLowerCase()
    if (keyStr.includes(lowerQ)) {
      results.push(path)
    }

    // 匹配字符串值
    if (typeof data === 'string') {
      const valStr = caseSensitive.value ? data : data.toLowerCase()
      if (valStr.includes(lowerQ)) {
        results.push(path)
      }
    }

    // 递归对象/数组
    if (data !== null && typeof data === 'object') {
      const entries = Object.entries(data)
      for (const [k, v] of entries) {
        // 统一使用 ${path}.${k} 格式，根路径 '$' 保证 path 始终为 truthy
        walk(v, `${path}.${k}`, k)
      }
    }
  }

  walk(props.jsonData, '$', 'root')
  return results
})

/** 搜索匹配到的祖先路径集合（需要自动展开的路径） */
const matchAncestorPaths = computed<Set<string>>(() => {
  const set = new Set<string>()
  if (!searchQuery.value.trim()) return set

  for (const p of matchPaths.value) {
    const parts = p.split('.')
    // 添加所有祖先路径（从 $ 开始，不包括自身）
    for (let i = 1; i < parts.length; i++) {
      set.add(parts.slice(0, i).join('.'))
    }
  }
  return set
})

/** 当前匹配路径（用于导航高亮） */
const currentMatchPath = computed<string | null>(() => {
  if (matchPaths.value.length === 0) return null
  const idx = Math.min(currentMatchIndex.value, matchPaths.value.length - 1)
  return matchPaths.value[idx] || null
})

// ── 可见节点列表（搜索时自动展开匹配路径的祖先） ──
const visibleItems = computed<TreeNodeItem[]>(() => {
  const q = searchQuery.value.trim()

  // 确定最终的展开状态
  let finalExpanded: Set<string>
  if (q) {
    finalExpanded = new Set(expanded.value)
    for (const p of matchAncestorPaths.value) {
      finalExpanded.add(p)
    }
  } else {
    finalExpanded = expanded.value
  }

  // 使用 finalExpanded 从原始数据重新构建树
  const result: TreeNodeItem[] = []

  function walk(data: unknown, path: string, displayKey: string, depth: number): void {
    if (data === null) {
      result.push({ path, displayKey, depth, type: 'null', value: null, canExpand: false, isExpanded: false, childCount: 0 })
      return
    }

    if (Array.isArray(data)) {
      const isExpanded = finalExpanded.has(path)
      result.push({ path, displayKey, depth, type: 'array', value: data, canExpand: true, isExpanded, childCount: data.length })
      if (isExpanded) {
        for (let i = 0; i < data.length; i++) {
          walk(data[i], `${path}.${i}`, `[${i}]`, depth + 1)
        }
      }
      return
    }

    if (typeof data === 'object' && data !== null) {
      const isExpanded = finalExpanded.has(path)
      const entries = Object.entries(data as Record<string, unknown>)
      result.push({ path, displayKey, depth, type: 'object', value: data, canExpand: true, isExpanded, childCount: entries.length })
      if (isExpanded) {
        for (const [k, v] of entries) {
          walk(v, `${path}.${k}`, k, depth + 1)
        }
      }
      return
    }

    if (typeof data === 'string') {
      result.push({ path, displayKey, depth, type: 'string', value: data, canExpand: false, isExpanded: false, childCount: 0 })
    } else if (typeof data === 'number') {
      result.push({ path, displayKey, depth, type: 'number', value: data, canExpand: false, isExpanded: false, childCount: 0 })
    } else if (typeof data === 'boolean') {
      result.push({ path, displayKey, depth, type: 'boolean', value: data, canExpand: false, isExpanded: false, childCount: 0 })
    }
  }

  walk(props.jsonData, '$', 'root', 0)
  return result
})

// ── 匹配标记 ──
const matchSet = computed<Set<string>>(() => {
  return new Set(matchPaths.value)
})

/** 是否有数据可显示 */
const hasData = computed(() => props.jsonData !== null && props.jsonData !== undefined)

// ── 在 visibleItems 上附加匹配信息 ──
// 使用 computed 合并匹配标记，避免模板中复杂逻辑
interface DisplayNode extends TreeNodeItem {
  isMatch: boolean
  isCurrentMatch: boolean
}

const displayItems = computed<DisplayNode[]>(() => {
  const matches = matchSet.value
  const currentPath = currentMatchPath.value
  return visibleItems.value.map((item) => ({
    ...item,
    isMatch: matches.has(item.path),
    isCurrentMatch: item.path === currentPath
  }))
})

// ── 搜索处理 ──
function onSearchInput(): void {
  currentMatchIndex.value = 0
}

function clearSearch(): void {
  searchQuery.value = ''
  currentMatchIndex.value = 0
  searchInputRef.value?.focus()
}

function toggleCaseSensitive(): void {
  caseSensitive.value = !caseSensitive.value
  currentMatchIndex.value = 0
}

function onSearchEnter(): void {
  if (matchPaths.value.length > 0) {
    navigateMatch(1)
  }
}

function navigateMatch(direction: number): void {
  const count = matchPaths.value.length
  if (count === 0) return
  currentMatchIndex.value = ((currentMatchIndex.value + direction) % count + count) % count
  scrollToCurrentMatch()
}

function scrollToCurrentMatch(): void {
  const path = currentMatchPath.value
  if (!path) return
  nextTick(() => {
    const el = nodeRefs.get(path)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  })
}

// ── 节点点击 ──
function onNodeClick(item: TreeNodeItem): void {
  if (item.canExpand) {
    toggleExpand(item.path)
    // 可展开节点直接触发跳转（没有双击编辑）
    emit('node-click', item.path, item.displayKey, item.depth)
    return
  }

  // 叶子节点：延迟触发跳转，等待可能的双击编辑
  if (clickTimer) clearTimeout(clickTimer)
  clickTimer = setTimeout(() => {
    clickTimer = null
    // 如果在延迟期间进入了编辑模式，则放弃跳转（避免焦点被文本域抢走）
    if (editingPath.value) return
    emit('node-click', item.path, item.displayKey, item.depth)
  }, 200)
}

/**
 * 双击叶子节点开始编辑
 */
function onNodeDblClick(item: TreeNodeItem): void {
  if (item.canExpand) return // 只编辑叶子节点
  // 取消挂起的单击事件
  if (clickTimer) {
    clearTimeout(clickTimer)
    clickTimer = null
  }
  startEdit(item)
}

function startEdit(item: TreeNodeItem): void {
  editingPath.value = item.path
  editValue.value = item.value !== null ? String(item.value) : ''
  nextTick(() => {
    editingInputEl.value?.focus()
    editingInputEl.value?.select()
  })
}

/**
 * 确认编辑
 */
function confirmEdit(): void {
  if (!editingPath.value) return

  // 找到对应节点，获取其类型
  const item = visibleItems.value.find((n) => n.path === editingPath.value)
  if (!item) {
    cancelEdit()
    return
  }

  const rawValue = editValue.value
  let newValue: string = rawValue
  let valueType: 'string' | 'number' | 'boolean' | 'null' = 'string'

  // 按原类型解析输入
  if (item.type === 'number') {
    const num = Number(rawValue)
    if (!isNaN(num)) {
      newValue = String(num)
      valueType = 'number'
    } else {
      // 非法数字，取消编辑
      cancelEdit()
      return
    }
  } else if (item.type === 'boolean') {
    if (rawValue === 'true' || rawValue === 'false') {
      newValue = rawValue
      valueType = 'boolean'
    } else {
      cancelEdit()
      return
    }
  } else if (item.type === 'null') {
    if (rawValue === 'null' || rawValue === '') {
      newValue = 'null'
      valueType = 'null'
    } else {
      cancelEdit()
      return
    }
  } else {
    // string: 保留原始输入（包括空字符串）
    valueType = 'string'
  }

  emit('value-change', editingPath.value, newValue, valueType)
  editingPath.value = null
  editValue.value = ''
}

/**
 * 取消编辑
 */
function cancelEdit(): void {
  editingPath.value = null
  editValue.value = ''
}

// ── 搜索文本高亮 ──
function highlightMatch(text: string): string {
  const q = searchQuery.value.trim()
  if (!q) return text
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const flags = caseSensitive.value ? 'g' : 'gi'
  return text.replace(new RegExp(`(${escaped})`, flags), '<mark class="search-highlight">$1</mark>')
}

// ── 将根路径 '' 替换为有意义的显示 ──
// 在 template 中使用时用 displayKey

// ── 快捷键监听 ──
function onKeydown(e: KeyboardEvent): void {
  // Ctrl+F / Cmd+F 聚焦搜索
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    searchInputRef.value?.focus()
  }
  // Escape 清除搜索
  if (e.key === 'Escape' && searchQuery.value) {
    clearSearch()
  }
}

defineExpose({
  focusSearch: () => searchInputRef.value?.focus()
})

// 挂载时注册键盘事件，并默认展开根节点
onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  // 默认展开根节点，让初始树展开到第一层
  const s = new Set(expanded.value)
  s.add('$')
  expanded.value = s
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
/*
 * 树形视图颜色变量
 * 默认值适配浅色主题，:root.dark 下覆盖为深色值
 * 键名/括号/分隔符/数字/布尔/null 统一使用 --text-primary（与文本编辑器一致）
 * 字符串值保持绿色以便阅读
 */
.json-tree-view {
  --tv-string: #16a34a;
  --tv-null: #64748b;
  --tv-arrow: #94a3b8;
  --tv-match-bg: rgba(234, 179, 8, 0.08);
  --tv-match-border: #ca8a04;
  --tv-current-bg: rgba(234, 179, 8, 0.15);
  --tv-current-border: #a16207;
  --tv-hover-bg: rgba(0, 0, 0, 0.04);
  --tv-hover-bg-clickable: rgba(0, 0, 0, 0.06);
  /* 搜索高亮 */
  --tv-highlight-bg: #fef08a;
  --tv-highlight-color: #1a1a2e;
  --tv-current-highlight-bg: #fde047;
  --tv-current-highlight-color: #09090b;
}

/* 深色模式覆盖（仅覆盖需变化的颜色） */
:global(:root.dark) .json-tree-view {
  --tv-string: #4ade80;
  --tv-null: #a1a1aa;
  --tv-arrow: #64748b;
  --tv-match-bg: rgba(250, 204, 21, 0.07);
  --tv-match-border: #eab308;
  --tv-current-bg: rgba(250, 204, 21, 0.14);
  --tv-current-border: #facc15;
  --tv-hover-bg: rgba(255, 255, 255, 0.06);
  --tv-hover-bg-clickable: rgba(255, 255, 255, 0.08);
  --tv-highlight-bg: linear-gradient(135deg, #eab308, #facc15);
  --tv-highlight-color: #09090b;
  --tv-current-highlight-bg: linear-gradient(135deg, #facc15, #fde047);
  --tv-current-highlight-color: #09090b;
}

/* 容器样式 */
.json-tree-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── 搜索栏 ── */
.tree-search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 160px;
  padding: 6px 10px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.search-input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.search-icon {
  flex-shrink: 0;
  color: var(--text-tertiary);
  width: 14px;
  height: 14px;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  min-width: 0;
}

.search-input::placeholder {
  color: var(--text-tertiary);
}

.search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.search-clear:hover {
  background: var(--accent-light);
  color: var(--text-primary);
}

.search-matches {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 2px 4px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.match-count {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  padding: 0 6px;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
}

.match-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.match-nav-btn:hover:not(:disabled) {
  background: var(--accent-light);
  border-color: var(--border);
  color: var(--text-primary);
}

.match-nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.match-nav-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.case-text {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.tree-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.tree-action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.tree-action-btn:hover {
  background: var(--accent-light);
  border-color: var(--accent);
  color: var(--text-primary);
}

.tree-action-btn:active {
  transform: scale(0.97);
}

/* ── 树内容区 ── */
.tree-content {
  flex: 1;
  overflow: auto;
  padding: 6px 0;
  scroll-behavior: smooth;
}

.tree-content::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.tree-content::-webkit-scrollbar-track {
  background: transparent;
}

.tree-content::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.tree-content::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

.tree-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px 20px;
}

.tree-node-list {
  padding: 2px 0;
}

/* ── 树节点 ── */
.tree-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  padding-right: 24px;
  min-width: fit-content;
  width: 100%;
  box-sizing: border-box;
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 14px;
  line-height: 1.9;
  color: var(--text-primary);
  cursor: default;
  transition: background-color 0.12s ease;
  border-left: 3px solid transparent;
  position: relative;
}

.tree-node:hover {
  background: var(--tv-hover-bg);
}

.tree-node.is-clickable {
  cursor: pointer;
}

.tree-node.is-clickable:hover {
  background: var(--tv-hover-bg-clickable);
}

/* 深度指示线（左侧边框模拟树线） */
.tree-node::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: transparent;
  border-radius: 0 2px 2px 0;
  transition: background 0.2s ease;
}

.tree-node:hover::before {
  background: var(--tv-sep);
}

/* 搜索匹配高亮 */
.tree-node.is-search-match {
  background: var(--tv-match-bg);
}

.tree-node.is-search-match::before {
  background: var(--tv-match-border);
}

/* 当前导航匹配高亮 */
.tree-node.is-current-match {
  background: var(--tv-current-bg);
  box-shadow: inset 0 0 0 1px var(--tv-current-border);
  border-radius: 4px;
}

.tree-node.is-current-match::before {
  background: var(--tv-current-border);
  width: 3px;
}

/* ── 展开箭头 ── */
.node-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--tv-arrow);
  transition: transform 0.2s ease, color 0.15s ease, background 0.15s ease;
  border-radius: 4px;
  cursor: pointer;
}

.node-arrow:hover {
  background: var(--tv-hover-bg);
  color: var(--tv-bracket);
}

.node-arrow.expanded {
  transform: rotate(90deg);
  color: var(--tv-sep);
}

.node-arrow-placeholder {
  width: 18px;
  flex-shrink: 0;
}

/* ── 键名（与文本编辑器颜色一致） ── */
.node-key {
  color: var(--text-primary);
  font-weight: 500;
  flex-shrink: 0;
}

/* ── 分隔符（与文本编辑器颜色一致） ── */
.node-sep {
  color: var(--text-primary);
  flex-shrink: 0;
}

/* ── 括号（与文本编辑器颜色一致） ── */
.node-bracket {
  color: var(--text-primary);
  font-weight: 500;
}

.node-summary {
  color: var(--text-tertiary);
  font-size: 12px;
  font-style: italic;
  margin-left: 4px;
}

/* ── 值 ── */
.node-value {
  flex-shrink: 0;
  font-weight: 500;
}

.node-string {
  color: var(--tv-string);
}

.node-number {
  color: var(--text-primary);
}

.node-boolean {
  color: var(--text-primary);
}

.node-null {
  color: var(--tv-null);
  font-style: italic;
}

.node-value.has-match {
  background: var(--tv-match-bg);
  border-radius: 3px;
  padding: 0 3px;
}

/* ── 搜索高亮 ── */
:deep(.search-highlight) {
  background: var(--tv-highlight-bg);
  color: var(--tv-highlight-color);
  border-radius: 2px;
  padding: 0 2px;
  font-weight: 600;
}

.is-current-match :deep(.search-highlight) {
  background: var(--tv-current-highlight-bg);
  color: var(--tv-current-highlight-color);
  font-weight: 700;
}

/* ── 内联编辑输入框 ── */
.edit-input {
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 13px;
  padding: 2px 6px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: var(--bg-base);
  color: var(--text-primary);
  outline: none;
  width: 200px;
  box-shadow: 0 0 0 2px var(--accent-light);
}

.edit-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.edit-string {
  color: var(--tv-string);
}

.edit-number {
  color: var(--tv-number);
}
</style>
