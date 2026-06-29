<template>
  <div class="translate-page">
    <!-- 顶部导航 -->
    <div class="translate-header">
      <button class="back-btn" @click="goBack" title="返回">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M10 2L4 8L10 14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <h2 class="translate-title">翻译</h2>
      <div class="header-actions">
        <button class="action-btn" @click="swapLanguages" title="互换语言">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M4 2L2 4L4 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 4H14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M12 10L14 12L12 14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M14 12H2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 语言选择 -->
    <div class="language-selectors">
      <select v-model="sourceLang" class="lang-select">
        <option v-for="lang in sourceLanguages" :key="lang.code" :value="lang.code">
          {{ lang.name }}
        </option>
      </select>
      <span class="lang-arrow">→</span>
      <select v-model="targetLang" class="lang-select">
        <option v-for="lang in targetLanguages" :key="lang.code" :value="lang.code">
          {{ lang.name }}
        </option>
      </select>
    </div>

    <!-- 输入框 -->
    <div class="input-section">
      <textarea
        v-model="inputText"
        class="text-input"
        placeholder="输入要翻译的文本..."
        rows="4"
      ></textarea>
      <div class="input-footer">
        <span class="char-count">{{ inputText.length }} 字符</span>
        <button v-if="inputText" class="clear-btn" @click="clearInput">清空</button>
      </div>
    </div>

    <!-- 翻译按钮 -->
    <button
      class="translate-btn"
      @click="doTranslate"
      :disabled="!inputText.trim() || isTranslating"
    >
      <span v-if="isTranslating" class="loading-spinner"></span>
      <span v-else>翻译</span>
    </button>

    <!-- 结果框 -->
    <div class="result-section" v-if="resultText">
      <div class="result-header">
        <span class="result-label">翻译结果</span>
        <button class="copy-btn" @click="copyResult" title="复制结果">
          复制
        </button>
      </div>
      <div class="result-text">{{ resultText }}</div>
    </div>

    <!-- 错误提示 -->
    <div class="error-message" v-if="errorMessage">
      {{ errorMessage }}
    </div>

    <!-- 翻译历史入口 -->
    <div class="history-entry" @click="showHistory = true">
      <span class="history-icon">📜</span>
      <span class="history-text">翻译历史</span>
      <span class="history-count" v-if="historyList.length">{{ historyList.length }}</span>
    </div>

    <!-- 历史记录弹窗 -->
    <div v-if="showHistory" class="dialog-overlay" @click="showHistory = false">
      <div class="dialog" @click.stop>
        <div class="dialog-header">
          <h3>翻译历史</h3>
          <button class="dialog-close" @click="showHistory = false">✕</button>
        </div>
        <div class="dialog-body">
          <div v-if="historyList.length === 0" class="empty-state">
            暂无翻译历史
          </div>
          <div v-else class="history-list">
            <div v-for="item in historyList" :key="item.id" class="history-item">
              <div class="history-content">
                <div class="history-source">{{ item.source_text }}</div>
                <div class="history-result">{{ item.result_text }}</div>
              </div>
              <div class="history-meta">
                <span class="history-langs">{{ item.source_lang }} → {{ item.target_lang }}</span>
                <span class="history-time">{{ formatTime(item.created_at) }}</span>
              </div>
              <div class="history-actions">
                <button class="action-btn" @click="reTranslate(item)" title="重新翻译">🔄</button>
                <button class="action-btn delete-btn" @click="deleteHistory(item.id)" title="删除">✕</button>
              </div>
            </div>
          </div>
        </div>
        <div class="dialog-footer" v-if="historyList.length > 0">
          <button class="btn btn-danger" @click="clearAllHistory">清空历史</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

/**
 * 翻译历史记录项类型
 */
interface TranslateHistoryItem {
  id: number
  source_lang: string
  target_lang: string
  source_text: string
  result_text: string
  created_at: number
}

/**
 * 语言类型
 */
interface Language {
  code: string
  name: string
  targets: string[]
}

/** 语言列表 */
const languages: Language[] = [
  { code: 'zh', name: '简体中文', targets: ['zh-TW', 'en', 'ja', 'ko', 'fr', 'es', 'it', 'de', 'tr', 'ru', 'pt', 'vi', 'id', 'th', 'ms', 'ar'] },
  { code: 'zh-TW', name: '繁体中文', targets: ['zh', 'en', 'ja', 'ko', 'fr', 'es', 'it', 'de', 'tr', 'ru', 'pt', 'vi', 'id', 'th', 'ms', 'ar'] },
  { code: 'en', name: '英语', targets: ['zh', 'zh-TW', 'ja', 'ko', 'fr', 'es', 'it', 'de', 'tr', 'ru', 'pt', 'vi', 'id', 'th', 'ms', 'ar', 'hi'] },
  { code: 'ja', name: '日语', targets: ['zh', 'zh-TW', 'en', 'ko'] },
  { code: 'ko', name: '韩语', targets: ['zh', 'zh-TW', 'en', 'ja'] },
  { code: 'fr', name: '法语', targets: ['zh', 'zh-TW', 'en', 'es', 'it', 'de', 'tr', 'ru', 'pt'] },
  { code: 'es', name: '西班牙语', targets: ['zh', 'zh-TW', 'en', 'fr', 'it', 'de', 'tr', 'ru', 'pt'] },
  { code: 'it', name: '意大利语', targets: ['zh', 'zh-TW', 'en', 'fr', 'es', 'de', 'tr', 'ru', 'pt'] },
  { code: 'de', name: '德语', targets: ['zh', 'zh-TW', 'en', 'fr', 'es', 'it', 'tr', 'ru', 'pt'] },
  { code: 'tr', name: '土耳其语', targets: ['zh', 'zh-TW', 'en', 'fr', 'es', 'it', 'de', 'ru', 'pt'] },
  { code: 'ru', name: '俄语', targets: ['zh', 'zh-TW', 'en', 'fr', 'es', 'it', 'de', 'tr', 'pt'] },
  { code: 'pt', name: '葡萄牙语', targets: ['zh', 'zh-TW', 'en', 'fr', 'es', 'it', 'de', 'tr', 'ru'] },
  { code: 'vi', name: '越南语', targets: ['zh', 'zh-TW', 'en'] },
  { code: 'id', name: '印尼语', targets: ['zh', 'zh-TW', 'en'] },
  { code: 'th', name: '泰语', targets: ['zh', 'zh-TW', 'en'] },
  { code: 'ms', name: '马来语', targets: ['zh', 'zh-TW', 'en'] },
  { code: 'ar', name: '阿拉伯语', targets: ['zh', 'zh-TW', 'en'] },
  { code: 'hi', name: '印地语', targets: ['en'] }
]

/** 源语言 */
const sourceLang = ref('zh')
/** 目标语言 */
const targetLang = ref('en')
/** 输入文本 */
const inputText = ref('')
/** 翻译结果 */
const resultText = ref('')
/** 错误信息 */
const errorMessage = ref('')
/** 是否正在翻译 */
const isTranslating = ref(false)
/** 是否显示历史弹窗 */
const showHistory = ref(false)
/** 翻译历史列表 */
const historyList = ref<TranslateHistoryItem[]>([])

/** 源语言列表 */
const sourceLanguages = computed(() => languages)

/** 目标语言列表（根据源语言过滤） */
const targetLanguages = computed(() => {
  const source = languages.find(l => l.code === sourceLang.value)
  if (!source) return languages
  return languages.filter(l => source.targets.includes(l.code))
})

/**
 * 互换源语言和目标语言
 */
const swapLanguages = () => {
  const temp = sourceLang.value
  sourceLang.value = targetLang.value
  targetLang.value = temp
}

/**
 * 清空输入和结果
 */
const clearInput = () => {
  inputText.value = ''
  resultText.value = ''
  errorMessage.value = ''
}

/**
 * 执行翻译
 */
const doTranslate = async () => {
  if (!inputText.value.trim()) return

  isTranslating.value = true
  errorMessage.value = ''

  try {
    const result = await window.electron.ipcRenderer.invoke('to-service-TranslateService:translate', {
      text: inputText.value,
      sourceLang: sourceLang.value,
      targetLang: targetLang.value
    })

    if (result.success) {
      resultText.value = result.translatedText
      await fetchHistory()
    } else {
      errorMessage.value = result.error
    }
  } catch {
    errorMessage.value = '翻译失败，请重试'
  } finally {
    isTranslating.value = false
  }
}

/**
 * 复制翻译结果到剪贴板
 */
const copyResult = async () => {
  try {
    await navigator.clipboard.writeText(resultText.value)
  } catch (error) {
    console.error('复制失败:', error)
  }
}

/**
 * 获取翻译历史记录
 */
const fetchHistory = async () => {
  const list = await window.electron.ipcRenderer.invoke('to-service-TranslateService:getHistory', 100, 0)
  historyList.value = list
}

/**
 * 删除一条翻译历史
 * @param id - 记录 ID
 */
const deleteHistory = async (id: number) => {
  await window.electron.ipcRenderer.invoke('to-service-TranslateService:delete', id)
  historyList.value = historyList.value.filter(h => h.id !== id)
}

/**
 * 清空所有翻译历史
 */
const clearAllHistory = async () => {
  await window.electron.ipcRenderer.invoke('to-service-TranslateService:clearAll')
  historyList.value = []
  showHistory.value = false
}

/**
 * 重新翻译历史记录中的某条
 * @param item - 历史记录项
 */
const reTranslate = (item: TranslateHistoryItem) => {
  sourceLang.value = item.source_lang
  targetLang.value = item.target_lang
  inputText.value = item.source_text
  showHistory.value = false
  doTranslate()
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
 * 返回首页
 */
const goBack = () => {
  window.electron.ipcRenderer.send('to-main-MainPage:setPage', 'home')
}

/**
 * 接收外部填充文本
 */
const onFillText = (_event: Electron.IpcRendererEvent, text: string): void => {
  inputText.value = text
  resultText.value = ''
  errorMessage.value = ''
}

onMounted(async () => {
  await fetchHistory()

  // 监听文本填充事件
  window.electron.ipcRenderer.on('to-renderer-Translate:fillText', onFillText)
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeListener('to-renderer-Translate:fillText', onFillText)
})
</script>

<style scoped>
.translate-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
  overflow-y: auto;
}

/* ========== 顶部导航 ========== */
.translate-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.back-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: #f3f4f6;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  transition: all 0.2s ease;
}

.back-btn:hover {
  background: #e5e7eb;
  color: #1a1a1a;
}

.translate-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0;
  flex: 1;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: #f3f4f6;
  color: #1a1a1a;
}

/* ========== 语言选择 ========== */
.language-selectors {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.lang-select {
  flex: 1;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #1a1a1a;
  background: #fff;
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  transition: all 0.2s ease;
}

.lang-select:focus {
  border-color: #3d8bff;
  box-shadow: 0 0 0 3px rgba(61, 139, 255, 0.1);
}

.lang-arrow {
  font-size: 16px;
  color: #999;
}

/* ========== 输入框 ========== */
.input-section {
  margin-bottom: 16px;
}

.text-input {
  width: 100%;
  min-height: 100px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  font-size: 14px;
  color: #1a1a1a;
  background: #f9fafb;
  outline: none;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.text-input:focus {
  border-color: #3d8bff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(61, 139, 255, 0.1);
}

.text-input::placeholder {
  color: #bbb;
}

.input-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.char-count {
  font-size: 11px;
  color: #bbb;
}

.clear-btn {
  font-size: 12px;
  color: #999;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.clear-btn:hover {
  background: #f3f4f6;
  color: #1a1a1a;
}

/* ========== 翻译按钮 ========== */
.translate-btn {
  width: 100%;
  height: 44px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(135deg, #3d8bff, #ff6ab0);
  color: #fff;
  margin-bottom: 16px;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(61, 139, 255, 0.3);
}

.translate-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(61, 139, 255, 0.4);
}

.translate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ========== 结果框 ========== */
.result-section {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.result-label {
  font-size: 12px;
  font-weight: 600;
  color: #666;
}

.copy-btn {
  font-size: 12px;
  color: #3d8bff;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.copy-btn:hover {
  background: rgba(61, 139, 255, 0.1);
}

.result-text {
  font-size: 14px;
  color: #1a1a1a;
  line-height: 1.6;
  word-break: break-word;
}

/* ========== 错误提示 ========== */
.error-message {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #dc2626;
}

/* ========== 历史入口 ========== */
.history-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.history-entry:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.history-icon {
  font-size: 16px;
}

.history-text {
  font-size: 13px;
  font-weight: 500;
  color: #4b5563;
  flex: 1;
}

.history-count {
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

/* ========== 历史弹窗 ========== */
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
  max-width: 500px;
  max-height: 70vh;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  animation: dialog-in 0.2s ease;
  display: flex;
  flex-direction: column;
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
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
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
  overflow-y: auto;
  flex: 1;
}

.dialog-footer {
  padding: 12px 20px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  justify-content: flex-end;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #999;
  font-size: 14px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-item {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  position: relative;
}

.history-content {
  margin-bottom: 8px;
}

.history-source {
  font-size: 13px;
  color: #1a1a1a;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.history-result {
  font-size: 13px;
  color: #3d8bff;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.history-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #999;
}

.history-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.history-item:hover .history-actions {
  opacity: 1;
}

.delete-btn:hover {
  background: #fee2e2;
  color: #dc2626;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-danger {
  background: #dc2626;
  color: #fff;
}

.btn-danger:hover {
  background: #b91c1c;
}
</style>
