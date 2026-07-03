<template>
  <div class="clipboard-manager">
    <!-- 顶部导航栏 -->
    <div class="cm-header">
      <button
        class="cm-tab"
        :class="{ active: activeTab === 'history' }"
        @click="switchTab('history')"
      >
        <span class="tab-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span>
        <span class="tab-label">历史记录</span>
        <span class="tab-count" v-if="historyList.length">{{ historyList.length }}</span>
      </button>
      <button
        class="cm-tab"
        :class="{ active: activeTab === 'favorites' }"
        @click="switchTab('favorites')"
      >
        <span class="tab-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>
        <span class="tab-label">收藏</span>
        <span class="tab-count" v-if="favoritesList.length">{{ favoritesList.length }}</span>
      </button>
    </div>

    <!-- 内容区 -->
    <div class="cm-body">
      <!-- 搜索框 -->
      <div class="cm-toolbar" v-if="activeTab === 'history'">
        <div class="search-wrapper">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" fill="none" stroke-width="1.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" stroke-width="1.5" />
          </svg>
          <input
            v-model="searchKeyword"
            type="text"
            class="search-input"
            placeholder="搜索历史记录..."
          />
        </div>
        <button
          v-if="historyList.length > 0"
          class="btn toolbar-btn danger"
          @click="confirmClearHistory"
          title="清空历史记录"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> 清空
        </button>
      </div>

      <!-- 收藏工具栏 -->
      <div class="cm-toolbar favorites-toolbar" v-if="activeTab === 'favorites'">
        <div class="favorites-search-row">
          <div class="search-wrapper">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" fill="none" stroke-width="1.5" />
              <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" stroke-width="1.5" />
            </svg>
            <input
              v-model="searchKeywordFavorites"
              type="text"
              class="search-input"
              placeholder="搜索收藏内容或描述..."
            />
          </div>
          <button class="btn toolbar-btn primary" @click="showAddDialog = true" title="手动添加收藏">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> 添加
          </button>
        </div>
        <div class="category-filter">
          <button
            class="category-btn"
            :class="{ active: selectedCategory === '' }"
            @click="selectedCategory = ''"
          >
            全部
          </button>
          <button
            v-for="cat in categories"
            :key="cat.name"
            class="category-btn"
            :class="{ active: selectedCategory === cat.name }"
            @click="selectedCategory = cat.name"
          >
            {{ cat.name || '未分类' }}
            <span class="cat-count">{{ cat.count }}</span>
          </button>
        </div>
      </div>

      <!-- 加载状态 - 骨架屏 -->
      <div v-if="loading" class="cm-skeleton">
        <div class="skeleton-item" v-for="i in 5" :key="i">
          <div class="skeleton-content"></div>
          <div class="skeleton-meta"></div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="displayList.length === 0" class="cm-empty">
        <div class="empty-icon">
          <svg v-if="activeTab === 'history'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
          <svg v-else width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </div>
        <div class="empty-text">
          {{ activeTab === 'history' ? '暂无历史记录' : '暂无收藏' }}
        </div>
        <div class="empty-hint">
          {{
            activeTab === 'history'
              ? '复制文字后会自动出现在这里'
              : '点击右上角"添加"按钮手动收藏内容'
          }}
        </div>
      </div>

      <!-- 记录列表 -->
      <div v-else class="cm-list">
        <div
          v-for="item in displayList"
          :key="item.id"
          class="cm-item"
          @click="copyItem(item.content)"
        >
          <div class="item-content">{{ item.content }}</div>
          <!-- 收藏卡片：展示分类和描述 -->
          <template v-if="activeTab === 'favorites'">
            <div class="fav-meta" v-if="(item as FavoriteItem).category || (item as FavoriteItem).description">
              <span class="fav-category" v-if="(item as FavoriteItem).category">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                {{ (item as FavoriteItem).category }}
              </span>
              <span class="fav-description" v-if="(item as FavoriteItem).description">{{ (item as FavoriteItem).description }}</span>
            </div>
          </template>
          <div class="item-footer">
            <span class="item-time">{{ formatTime(item.created_at) }}</span>
            <div class="item-actions" @click.stop>
              <button
                v-if="activeTab === 'history'"
                class="action-btn translate-action"
                @click="translateItem(item as HistoryItem)"
                title="翻译"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </button>
              <button
                v-if="activeTab === 'history'"
                class="action-btn edit-action"
                @click="editInMarkdown(item as HistoryItem)"
                title="在 Markdown 编辑器中编辑"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button
                v-if="activeTab === 'history'"
                class="action-btn"
                @click="quickFavorite(item as HistoryItem)"
                title="收藏"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </button>
              <button
                v-if="activeTab === 'favorites'"
                class="action-btn"
                @click="editFavorite(item as FavoriteItem)"
                title="编辑"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="action-btn delete-btn" @click="deleteItem(item)" title="删除">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加/编辑收藏弹窗 -->
    <div v-if="showAddDialog || editingFavorite" class="dialog-overlay" @click="closeDialog">
      <div class="dialog" @click.stop>
        <div class="dialog-header">
          <h3>{{ editingFavorite ? '编辑收藏' : '添加收藏' }}</h3>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>内容 <span class="required">*</span></label>
            <textarea
              v-model="formData.content"
              class="form-textarea"
              placeholder="输入要收藏的内容..."
              rows="4"
            ></textarea>
          </div>
          <div class="form-group">
            <label>分类</label>
            <div class="category-input-wrapper">
              <input
                v-model="formData.category"
                type="text"
                class="form-input"
                placeholder="输入分类名称（如：Linux命令）"
                list="categoryList"
              />
              <datalist id="categoryList">
                <option v-for="cat in categories" :key="cat.name" :value="cat.name" />
              </datalist>
            </div>
          </div>
          <div class="form-group">
            <label>描述（可选）</label>
            <input
              v-model="formData.description"
              type="text"
              class="form-input"
              placeholder="添加备注说明..."
            />
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn dialog-btn cancel" @click="closeDialog">取消</button>
          <button class="btn dialog-btn confirm" @click="saveFavorite" :disabled="!formData.content">
            {{ editingFavorite ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 清空确认弹窗 -->
    <div v-if="showClearConfirm" class="dialog-overlay" @click="showClearConfirm = false">
      <div class="dialog small" @click.stop>
        <div class="dialog-body">
          <p class="confirm-text">确定要清空所有历史记录吗？此操作不可恢复。</p>
        </div>
        <div class="dialog-footer">
          <button class="btn dialog-btn cancel" @click="showClearConfirm = false">取消</button>
          <button class="btn dialog-btn danger" @click="clearAllHistory">确定清空</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

/**
 * 历史记录项类型
 */
interface HistoryItem {
  id: number
  content: string
  created_at: number
}

/**
 * 收藏项类型
 */
interface FavoriteItem {
  id: number
  content: string
  category: string
  description: string
  created_at: number
}

/**
 * 分类项类型
 */
interface CategoryItem {
  name: string
  count: number
}

/**
 * 显示项类型（历史记录或收藏的联合类型）
 */
type DisplayItem = HistoryItem | FavoriteItem

/** 当前激活的标签页 */
const activeTab = ref<'history' | 'favorites'>('history')

/** 历史记录列表 */
const historyList = ref<HistoryItem[]>([])

/** 收藏列表 */
const favoritesList = ref<FavoriteItem[]>([])

/** 分类列表 */
const categories = ref<CategoryItem[]>([])

/** 选中的分类 */
const selectedCategory = ref('')

/** 搜索关键词（历史记录） */
const searchKeyword = ref('')

/** 搜索关键词（收藏） */
const searchKeywordFavorites = ref('')

/** 加载状态 */
const loading = ref(true)

/** 是否显示添加弹窗 */
const showAddDialog = ref(false)

/** 是否显示清空确认弹窗 */
const showClearConfirm = ref(false)

/** 正在编辑的收藏 */
const editingFavorite = ref<FavoriteItem | null>(null)

/** 表单数据 */
const formData = ref({
  content: '',
  category: '',
  description: ''
})

/** 当前显示的列表（根据标签页和搜索过滤） */
const displayList = computed<DisplayItem[]>(() => {
  if (activeTab.value === 'history') {
    if (searchKeyword.value) {
      return historyList.value.filter((item) =>
        item.content.toLowerCase().includes(searchKeyword.value.toLowerCase())
      )
    }
    return historyList.value
  }

  // 收藏列表：按分类筛选 + 搜索关键词过滤（搜内容和描述）
  let filtered = favoritesList.value

  if (selectedCategory.value) {
    filtered = filtered.filter((item) => item.category === selectedCategory.value)
  }

  if (searchKeywordFavorites.value) {
    const kw = searchKeywordFavorites.value.toLowerCase()
    filtered = filtered.filter(
      (item) =>
        item.content.toLowerCase().includes(kw) ||
        (item.description && item.description.toLowerCase().includes(kw))
    )
  }

  return filtered
})

/**
 * 获取历史记录
 */
const fetchHistory = async (): Promise<void> => {
  const list = await window.electron.ipcRenderer.invoke('to-service-ClipboardService:getHistory', 100, 0)
  historyList.value = list
}

/**
 * 获取收藏列表
 */
const fetchFavorites = async (): Promise<void> => {
  const list = await window.electron.ipcRenderer.invoke('to-service-ClipboardService:getFavorites')
  favoritesList.value = list
}

/**
 * 获取分类列表
 */
const fetchCategories = async (): Promise<void> => {
  const list = await window.electron.ipcRenderer.invoke('to-service-ClipboardService:getCategories')
  categories.value = list
}

/**
 * 切换标签页
 * @param tab - 目标标签页
 */
const switchTab = async (tab: 'history' | 'favorites'): Promise<void> => {
  activeTab.value = tab
  if (tab === 'history') {
    await fetchHistory()
  } else {
    await fetchFavorites()
    await fetchCategories()
  }
}

/**
 * 复制内容并自动粘贴到上一个聚焦的窗口
 *
 * 流程：
 *   1. 通知主进程处理完整操作（写入剪贴板 → 隐藏窗口 → 恢复焦点 → 粘贴）
 *   2. 不再需要手动 setTimeout 或分步 IPC，全部由主进程协调
 *
 * @param content - 要复制并粘贴的文本
 */
const copyItem = async (content: string): Promise<void> => {
  try {
    // 主进程处理：写入剪贴板 + 隐藏窗口 + 恢复焦点 + 粘贴
    await window.electron.ipcRenderer.invoke('to-service-ClipboardService:clickItem', content)
  } catch (err) {
    console.error('[ClipboardManager] 粘贴失败:', err)
  }
}

/**
 * 快速收藏历史记录到未分类组
 * @param item - 历史记录项
 */
const quickFavorite = async (item: HistoryItem): Promise<void> => {
  await window.electron.ipcRenderer.invoke('to-service-ClipboardService:addFavorite', item.content, '', '')
  // 刷新收藏列表和分类，更新计数
  await fetchFavorites()
  await fetchCategories()
}

/**
 * 翻译历史记录项
 * @param item - 历史记录项
 */
const translateItem = (item: HistoryItem): void => {
  window.electron.ipcRenderer.send('to-main-MainPage:openTranslate', item.content)
}

/**
 * 在 Markdown 编辑器中编辑剪贴板内容
 * @param item - 历史记录项
 */
const editInMarkdown = (item: HistoryItem): void => {
  console.log('[ClipboardManager] editInMarkdown called, content length:', item.content.length)
  // 发送 IPC 到 MainPageFrame，由它来创建编辑器窗口
  window.electron.ipcRenderer.send('to-main-MainPage:openClipboardInMarkdown', item.content)
}

/**
 * 删除历史记录项
 * @param item - 记录项
 */
const deleteItem = async (item: DisplayItem): Promise<void> => {
  if (activeTab.value === 'history') {
    await window.electron.ipcRenderer.invoke('to-service-ClipboardService:deleteHistory', item.id)
    historyList.value = historyList.value.filter((h) => h.id !== item.id)
  } else {
    await window.electron.ipcRenderer.invoke('to-service-ClipboardService:deleteFavorite', item.id)
    favoritesList.value = favoritesList.value.filter((f) => f.id !== item.id)
    await fetchCategories()
  }
}

/**
 * 确认清空历史记录
 */
const confirmClearHistory = (): void => {
  showClearConfirm.value = true
}

/**
 * 清空所有历史记录
 */
const clearAllHistory = async (): Promise<void> => {
  await window.electron.ipcRenderer.invoke('to-service-ClipboardService:clearHistory')
  historyList.value = []
  showClearConfirm.value = false
}

/**
 * 打开编辑收藏弹窗
 * @param item - 收藏项
 */
const editFavorite = (item: DisplayItem): void => {
  const favItem = item as FavoriteItem
  editingFavorite.value = favItem
  formData.value = {
    content: favItem.content,
    category: favItem.category,
    description: favItem.description
  }
}

/**
 * 关闭弹窗
 */
const closeDialog = (): void => {
  showAddDialog.value = false
  editingFavorite.value = null
  formData.value = { content: '', category: '', description: '' }
}

/**
 * 保存收藏（添加或编辑）
 */
const saveFavorite = async (): Promise<void> => {
  if (!formData.value.content) return

  if (editingFavorite.value) {
    // 编辑
    await window.electron.ipcRenderer.invoke(
      'to-service-ClipboardService:updateFavorite',
      editingFavorite.value.id,
      formData.value.content,
      formData.value.category,
      formData.value.description
    )
  } else {
    // 添加
    await window.electron.ipcRenderer.invoke(
      'to-service-ClipboardService:addFavorite',
      formData.value.content,
      formData.value.category,
      formData.value.description
    )
  }

  closeDialog()
  await fetchFavorites()
  await fetchCategories()
}

/**
 * 格式化时间戳为可读时间
 * @param timestamp - 毫秒时间戳
 * @returns 格式化的时间字符串
 */
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - timestamp

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`

  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

/**
 * 监听主进程推送的新记录
 */
const onNewItem = (_event: unknown, item: HistoryItem): void => {
  // 避免重复
  if (!historyList.value.some((h) => h.id === item.id)) {
    historyList.value.unshift(item)
  }
}

onMounted(async () => {
  await fetchHistory()
  await fetchFavorites()
  await fetchCategories()
  loading.value = false

  // 监听增量推送
  window.electron.ipcRenderer.on('broadcast:clipboard-new', onNewItem)
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeListener('broadcast:clipboard-new', onNewItem)
})
</script>

<style scoped>
.clipboard-manager {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-base);
  overflow: hidden;
}

/* ========== 顶部导航 ========== */
.cm-header {
  display: flex;
  gap: 2px;
  padding: 12px 16px 0;
  flex-shrink: 0;
}

.cm-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 0;
  border: none;
  background: transparent;
  border-radius: 10px 10px 0 0;
  cursor: pointer;
  transition: all 0.25s ease;
  position: relative;
}

.cm-tab:hover {
  background: var(--bg-surface);
}

.cm-tab.active {
  background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.06), rgba(212, 135, 74, 0.06));
}

.cm-tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 20%;
  right: 20%;
  height: 2px;
  background: var(--accent);
  border-radius: 1px;
}

.tab-icon {
  font-size: 14px;
}

.tab-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: color 0.25s;
}

.cm-tab.active .tab-label {
  color: var(--text-primary);
}

.tab-count {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: var(--accent);
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
  line-height: 16px;
}

/* ========== 内容区 ========== */
.cm-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ========== 工具栏 ========== */
.cm-toolbar {
  padding: 12px 16px;
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-wrapper {
  flex: 1;
  position: relative;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-surface);
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
  transition: all 0.15s ease;
  box-sizing: border-box;
}

.search-input::placeholder {
  color: var(--text-tertiary);
}

.search-input:focus {
  border-color: var(--accent);
  background: var(--bg-base);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.08);
}

/* 工具栏按钮：继承共享 .btn 基类 */
.toolbar-btn {
  height: var(--btn-height);
  padding: 0 12px;
  font-size: 12px;
}

.toolbar-btn.primary {
  background: var(--accent);
  color: #fff;
  box-shadow: var(--btn-shadow-primary);
}

.toolbar-btn.primary:hover {
  box-shadow: var(--btn-shadow-primary-hover);
  transform: translateY(-1px);
}

.toolbar-btn.danger {
  background: var(--danger-bg);
  color: var(--danger);
  box-shadow: none;
}

.toolbar-btn.danger:hover {
  background: var(--danger-hover);
}

/* ========== 分类筛选 ========== */
.category-filter {
  flex: 1;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.category-filter::-webkit-scrollbar {
  height: 0;
}

.category-btn {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg-base);
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.category-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.category-btn.active {
  background: var(--accent);
  border-color: transparent;
  color: #fff;
}

.cat-count {
  font-size: 10px;
  opacity: 0.7;
}

/* ========== 收藏工具栏（搜索 + 分类筛选） ========== */
.favorites-toolbar {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.favorites-search-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.favorites-search-row .search-wrapper {
  flex: 1;
}

/* ========== 空状态 ========== */
.cm-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.empty-icon {
  font-size: 36px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}

.empty-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ========== 记录列表 ========== */
.cm-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 12px;
}

.cm-list::-webkit-scrollbar {
  width: 4px;
}

.cm-list::-webkit-scrollbar-track {
  background: transparent;
}

.cm-list::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 2px;
}

.cm-item {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--border);
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cm-item:hover {
  background: var(--bg-surface);
  border-color: var(--border);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.item-content {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
  /* 最多显示 3 行 */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

/* ========== 收藏卡片元信息 ========== */
.fav-meta {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.fav-category {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.08);
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}

.fav-category svg {
  flex-shrink: 0;
}

.fav-description {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.4;
  /* 最多显示 2 行 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.item-time {
  font-size: 11px;
  color: var(--text-tertiary);
}

.item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.cm-item:hover .item-actions {
  opacity: 1;
}

.action-btn {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.action-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.delete-btn:hover {
  background: var(--danger-bg);
  color: var(--danger);
}

.translate-action {
  color: var(--accent);
}

.translate-action:hover {
  background: rgba(var(--accent-rgb), 0.1);
}

.edit-action {
  color: var(--accent);
}

.edit-action:hover {
  background: rgba(var(--accent-rgb), 0.1);
}

/* 减弱动效 */
@media (prefers-reduced-motion: reduce) {
  .action-btn {
    transition: none;
  }
}

/* ========== 弹窗 ========== */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.dialog {
  background: var(--bg-elevated);
  backdrop-filter: blur(20px) saturate(1.3);
  -webkit-backdrop-filter: blur(20px) saturate(1.3);
  border: 1px solid var(--border);
  border-radius: 16px;
  width: 90%;
  max-width: 400px;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  animation: dialog-in 0.2s ease;
}

.dialog.small {
  max-width: 320px;
}

@keyframes dialog-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 0;
}

.dialog-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.dialog-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.dialog-close:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.dialog-body {
  padding: 16px 20px;
}

.dialog-footer {
  padding: 0 20px 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.form-group {
  margin-bottom: 14px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.required {
  color: var(--danger);
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-surface);
  outline: none;
  transition: all 0.15s ease;
  box-sizing: border-box;
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

.form-input:focus,
.form-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.08);
}

.category-input-wrapper {
  position: relative;
}

.confirm-text {
  font-size: 14px;
  color: var(--text-secondary);
  text-align: center;
  margin: 0;
  line-height: 1.6;
}

/* 对话框按钮：继承共享 .btn 基类 */
.dialog-btn {
  padding: 8px 16px;
}

.dialog-btn.cancel {
  background: var(--bg-surface);
  color: var(--text-secondary);
  box-shadow: none;
}

.dialog-btn.cancel:hover {
  background: var(--border);
}

.dialog-btn.confirm {
  background: var(--accent);
  color: #fff;
  box-shadow: var(--btn-shadow-primary);
}

.dialog-btn.confirm:hover {
  box-shadow: var(--btn-shadow-primary-hover);
  transform: translateY(-1px);
}

.dialog-btn.confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.dialog-btn.danger {
  background: var(--danger);
  color: #fff;
  box-shadow: 0 2px 8px rgba(var(--danger-rgb), 0.2);
}

.dialog-btn.danger:hover {
  background: var(--danger);
  box-shadow: 0 4px 14px rgba(var(--danger-rgb), 0.3);
  transform: translateY(-1px);
}

/* ========== 骨架屏 ========== */
.cm-skeleton {
  flex: 1;
  padding: 12px;
  overflow: hidden;
}

.skeleton-item {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--border);
  margin-bottom: 8px;
}

.skeleton-content {
  height: 40px;
  background: var(--bg-surface);
  border-radius: 6px;
  position: relative;
  overflow: hidden;
}

.skeleton-content::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.08),
    transparent
  );
  animation: shimmer 1.5s infinite;
}

.skeleton-meta {
  height: 16px;
  width: 60px;
  background: var(--bg-surface);
  border-radius: 4px;
  margin-top: 8px;
  position: relative;
  overflow: hidden;
}

.skeleton-meta::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.08),
    transparent
  );
  animation: shimmer 1.5s infinite;
  animation-delay: 0.1s;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
</style>
