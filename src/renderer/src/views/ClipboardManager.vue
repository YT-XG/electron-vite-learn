<template>
  <div class="clipboard-manager">
    <!-- 顶部导航栏 -->
    <div class="cm-header">
      <button
        class="cm-tab"
        :class="{ active: activeTab === 'history' }"
        @click="switchTab('history')"
      >
        <span class="tab-icon">📋</span>
        <span class="tab-label">历史记录</span>
        <span class="tab-count" v-if="historyList.length">{{ historyList.length }}</span>
      </button>
      <button
        class="cm-tab"
        :class="{ active: activeTab === 'favorites' }"
        @click="switchTab('favorites')"
      >
        <span class="tab-icon">⭐</span>
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
          class="toolbar-btn danger"
          @click="confirmClearHistory"
          title="清空历史记录"
        >
          🗑️ 清空
        </button>
      </div>

      <!-- 收藏工具栏 -->
      <div class="cm-toolbar" v-if="activeTab === 'favorites'">
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
        <button class="toolbar-btn primary" @click="showAddDialog = true" title="手动添加收藏">
          ➕ 添加
        </button>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="cm-empty">
        <div class="empty-icon">⏳</div>
        <div class="empty-text">加载中...</div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="displayList.length === 0" class="cm-empty">
        <div class="empty-icon">{{ activeTab === 'history' ? '📋' : '⭐' }}</div>
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
          <div class="item-meta" v-if="activeTab === 'favorites' && 'category' in item && (item as FavoriteItem).category">
            <span class="item-category">{{ (item as FavoriteItem).category }}</span>
          </div>
          <div class="item-footer">
            <span class="item-time">{{ formatTime(item.created_at) }}</span>
            <div class="item-actions" @click.stop>
              <button
                v-if="activeTab === 'history'"
                class="action-btn"
                @click="quickFavorite(item as HistoryItem)"
                title="收藏"
              >
                ⭐
              </button>
              <button
                v-if="activeTab === 'favorites'"
                class="action-btn"
                @click="editFavorite(item as FavoriteItem)"
                title="编辑"
              >
                ✏️
              </button>
              <button class="action-btn delete-btn" @click="deleteItem(item)" title="删除">
                ✕
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
          <button class="dialog-close" @click="closeDialog">✕</button>
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
          <button class="dialog-btn cancel" @click="closeDialog">取消</button>
          <button class="dialog-btn confirm" @click="saveFavorite" :disabled="!formData.content">
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
          <button class="dialog-btn cancel" @click="showClearConfirm = false">取消</button>
          <button class="dialog-btn danger" @click="clearAllHistory">确定清空</button>
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

/** 搜索关键词 */
const searchKeyword = ref('')

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

  // 收藏列表：按分类筛选
  if (selectedCategory.value) {
    return favoritesList.value.filter((item) => item.category === selectedCategory.value)
  }
  return favoritesList.value
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
  background: #ffffff;
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
  background: #f9fafb;
}

.cm-tab.active {
  background: linear-gradient(135deg, rgba(61, 139, 255, 0.06), rgba(255, 106, 176, 0.06));
}

.cm-tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 20%;
  right: 20%;
  height: 2px;
  background: linear-gradient(90deg, #3d8bff, #ff6ab0);
  border-radius: 1px;
}

.tab-icon {
  font-size: 14px;
}

.tab-label {
  font-size: 13px;
  font-weight: 600;
  color: #888;
  transition: color 0.25s;
}

.cm-tab.active .tab-label {
  color: #1a1a1a;
}

.tab-count {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #3d8bff, #ff6ab0);
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
  color: #bbb;
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 36px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  font-size: 13px;
  color: #1a1a1a;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.search-input::placeholder {
  color: #bbb;
}

.search-input:focus {
  border-color: #3d8bff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(61, 139, 255, 0.08);
}

.toolbar-btn {
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.toolbar-btn.primary {
  background: linear-gradient(135deg, #3d8bff, #ff6ab0);
  color: #fff;
}

.toolbar-btn.primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.toolbar-btn.danger {
  background: #fee2e2;
  color: #dc2626;
}

.toolbar-btn.danger:hover {
  background: #fecaca;
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
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
  font-size: 12px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.category-btn:hover {
  border-color: #3d8bff;
  color: #3d8bff;
}

.category-btn.active {
  background: linear-gradient(135deg, #3d8bff, #ff6ab0);
  border-color: transparent;
  color: #fff;
}

.cat-count {
  font-size: 10px;
  opacity: 0.7;
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
  color: #888;
}

.empty-hint {
  font-size: 12px;
  color: #bbb;
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
  background: #d1d5db;
  border-radius: 2px;
}

.cm-item {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #f0f0f0;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cm-item:hover {
  background: #f9fafb;
  border-color: #e5e7eb;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.item-content {
  font-size: 13px;
  color: #1a1a1a;
  line-height: 1.5;
  /* 最多显示 3 行 */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

.item-meta {
  margin-top: 6px;
}

.item-category {
  font-size: 11px;
  color: #3d8bff;
  background: rgba(61, 139, 255, 0.08);
  padding: 2px 8px;
  border-radius: 10px;
}

.item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.item-time {
  font-size: 11px;
  color: #bbb;
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
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #bbb;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: #f3f4f6;
  color: #1a1a1a;
}

.delete-btn:hover {
  background: #fee2e2;
  color: #dc2626;
}

/* ========== 弹窗 ========== */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.dialog {
  background: #fff;
  border-radius: 16px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
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
  color: #1a1a1a;
  margin: 0;
}

.dialog-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #888;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.dialog-close:hover {
  background: #f3f4f6;
  color: #1a1a1a;
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
  color: #4b5563;
  margin-bottom: 6px;
}

.required {
  color: #dc2626;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 13px;
  color: #1a1a1a;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

.form-input:focus,
.form-textarea:focus {
  border-color: #3d8bff;
  box-shadow: 0 0 0 3px rgba(61, 139, 255, 0.08);
}

.category-input-wrapper {
  position: relative;
}

.confirm-text {
  font-size: 14px;
  color: #4b5563;
  text-align: center;
  margin: 0;
  line-height: 1.6;
}

.dialog-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dialog-btn.cancel {
  background: #f3f4f6;
  color: #4b5563;
}

.dialog-btn.cancel:hover {
  background: #e5e7eb;
}

.dialog-btn.confirm {
  background: linear-gradient(135deg, #3d8bff, #ff6ab0);
  color: #fff;
}

.dialog-btn.confirm:hover {
  opacity: 0.9;
}

.dialog-btn.confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dialog-btn.danger {
  background: #dc2626;
  color: #fff;
}

.dialog-btn.danger:hover {
  background: #b91c1c;
}
</style>
