# 翻译功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在主页面新增翻译功能，支持文本翻译和剪贴板翻译，使用 MyMemory API 提供免费翻译服务

**Architecture:** 新增 TranslateService 处理翻译 API 调用和历史管理，新增 Translate.vue 页面组件，修改通知窗口和剪贴板管理添加翻译触发按钮

**Tech Stack:** Vue 3, TypeScript, sql.js, MyMemory API

## Global Constraints

- 使用现有的蓝粉渐变配色（#3d8bff / #ff6ab0）
- IPC 命名遵循项目规范：`to-service-*`, `to-main-*`, `to-renderer-*`
- 翻译历史存储到 SQLite 数据库（userData/translate.db）
- 支持 18 种语言互译

---

## Task 1: 创建翻译服务 (translateService.ts)

**Files:**
- Create: `src/main/service/translateService.ts`
- Modify: `src/main/index.ts` (导入并初始化)

**Interfaces:**
- Consumes: 无（独立服务）
- Produces: `translateService.init()`, `translateService.translate()`, `translateService.getHistory()`, `translateService.delete()`, `translateService.clearAll()`

### Step 1: 创建 translateService.ts 基础结构

```typescript
/**
 * 翻译服务
 * @description 处理翻译 API 调用和翻译历史管理
 * 使用 MyMemory API 提供免费翻译，支持自定义 API 配置
 */
import { app, ipcMain } from 'electron'
import initSqlJs, { Database } from 'sql.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import log from 'electron-log'

/**
 * 翻译历史记录项
 */
export interface TranslateHistoryItem {
  id: number
  source_lang: string
  target_lang: string
  source_text: string
  result_text: string
  created_at: number
}

/**
 * 翻译请求参数
 */
export interface TranslateParams {
  text: string
  sourceLang: string
  targetLang: string
  apiUrl?: string
  apiKey?: string
}

/**
 * 翻译结果
 */
export interface TranslateResult {
  success: boolean
  translatedText?: string
  error?: string
}

class TranslateService {
  private db: Database | null = null
  private dbPath: string = ''

  /**
   * 初始化翻译服务
   */
  async init(): Promise<void> {
    const userDataPath = app.getPath('userData')
    if (!existsSync(userDataPath)) {
      mkdirSync(userDataPath, { recursive: true })
    }
    this.dbPath = join(userDataPath, 'translate.db')

    const SQL = await initSqlJs({
      locateFile: (file: string): string => {
        return join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', file)
      }
    })

    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath)
      this.db = new SQL.Database(buffer)
      log.info('[TranslateService] 已加载现有数据库')
    } else {
      this.db = new SQL.Database()
      log.info('[TranslateService] 创建新数据库')
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS translate_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_lang TEXT NOT NULL,
        target_lang TEXT NOT NULL,
        source_text TEXT NOT NULL,
        result_text TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `)
    this.db.run('CREATE INDEX IF NOT EXISTS idx_translate_created_at ON translate_history(created_at DESC)')

    this.save()
    this.registerIPC()

    log.info('[TranslateService] 初始化完成，数据库路径:', this.dbPath)
  }

  /**
   * 将内存中的数据库写入磁盘
   */
  private save(): void {
    if (!this.db) return
    const data = this.db.export()
    writeFileSync(this.dbPath, Buffer.from(data))
  }

  /**
   * 调用翻译 API
   */
  async translate(params: TranslateParams): Promise<TranslateResult> {
    const { text, sourceLang, targetLang, apiUrl, apiKey } = params

    if (!text.trim()) {
      return { success: false, error: '请输入要翻译的文本' }
    }

    try {
      const url = apiUrl || 'https://api.mymemory.translated.net/get'
      const params = new URLSearchParams({
        q: text,
        langpair: `${sourceLang}|${targetLang}`
      })

      if (apiKey) {
        params.append('key', apiKey)
      }

      const response = await fetch(`${url}?${params.toString()}`)
      const data = await response.json()

      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        const translatedText = data.responseData.translatedText
        this.saveHistory(sourceLang, targetLang, text, translatedText)
        return { success: true, translatedText }
      } else {
        return { success: false, error: data.responseDetails || '翻译失败' }
      }
    } catch (error) {
      log.error('[TranslateService] 翻译失败:', error)
      return { success: false, error: '网络错误，请检查网络连接' }
    }
  }

  /**
   * 保存翻译历史
   */
  private saveHistory(
    sourceLang: string,
    targetLang: string,
    sourceText: string,
    resultText: string
  ): void {
    if (!this.db) return
    const now = Date.now()
    this.db.run(
      'INSERT INTO translate_history (source_lang, target_lang, source_text, result_text, created_at) VALUES (?, ?, ?, ?, ?)',
      [sourceLang, targetLang, sourceText, resultText, now]
    )
    this.save()
  }

  /**
   * 获取翻译历史（分页）
   */
  getHistory(limit = 50, offset = 0): TranslateHistoryItem[] {
    if (!this.db) return []
    const result = this.db.exec(
      'SELECT * FROM translate_history ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    )
    return this.parseResult(result)
  }

  /**
   * 删除一条翻译历史
   */
  delete(id: number): void {
    if (!this.db) return
    this.db.run('DELETE FROM translate_history WHERE id = ?', [id])
    this.save()
  }

  /**
   * 清空所有翻译历史
   */
  clearAll(): void {
    if (!this.db) return
    this.db.run('DELETE FROM translate_history')
    this.save()
  }

  /**
   * 解析 sql.js 查询结果为 TranslateHistoryItem 数组
   */
  private parseResult(result: ReturnType<Database['exec']>): TranslateHistoryItem[] {
    if (!result || result.length === 0) return []
    const columns = result[0].columns
    return result[0].values.map((row) => {
      const item: Record<string, unknown> = {}
      columns.forEach((col, i) => {
        item[col] = row[i]
      })
      return item as unknown as TranslateHistoryItem
    })
  }

  /**
   * 注册 IPC 处理器
   */
  private registerIPC(): void {
    ipcMain.handle('to-service-TranslateService:translate', async (_event, params: TranslateParams) => {
      return this.translate(params)
    })

    ipcMain.handle('to-service-TranslateService:getHistory', (_event, limit?: number, offset?: number) => {
      return this.getHistory(limit ?? 50, offset ?? 0)
    })

    ipcMain.handle('to-service-TranslateService:delete', (_event, id: number) => {
      this.delete(id)
    })

    ipcMain.handle('to-service-TranslateService:clearAll', () => {
      this.clearAll()
    })
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    if (this.db) {
      this.save()
      this.db.close()
      this.db = null
    }
  }
}

export const translateService = new TranslateService()
```

### Step 2: 在主进程入口初始化翻译服务

```typescript
// src/main/index.ts - 在文件顶部添加导入
import { translateService } from './service/translateService'

// 在 app.whenReady() 中添加初始化
app.whenReady().then(async () => {
  // ... 现有初始化代码
  await translateService.init()
})
```

### Step 3: Commit

```bash
git add src/main/service/translateService.ts src/main/index.ts
git commit -m "feat: 添加翻译服务 (translateService.ts)"
```

---

## Task 2: 创建翻译页面 (Translate.vue)

**Files:**
- Create: `src/renderer/src/views/Translate.vue`
- Modify: `src/renderer/src/views/MainPage.vue` (添加菜单和组件引入)

**Interfaces:**
- Consumes: `translateService.translate()`, `translateService.getHistory()`, `translateService.delete()`, `translateService.clearAll()`
- Produces: `Translate.vue` 组件，支持文本翻译、语言选择、历史记录

### Step 1: 创建 Translate.vue 基础结构

```vue
<!-- src/renderer/src/views/Translate.vue -->
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
      <span v-else>🔄 翻译</span>
    </button>

    <!-- 结果框 -->
    <div class="result-section" v-if="resultText">
      <div class="result-header">
        <span class="result-label">翻译结果</span>
        <button class="copy-btn" @click="copyResult" title="复制结果">
          📋 复制
        </button>
      </div>
      <div class="result-text">{{ resultText }}</div>
    </div>

    <!-- 错误提示 -->
    <div class="error-message" v-if="errorMessage">
      ❌ {{ errorMessage }}
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
import { ref, computed, onMounted } from 'vue'

interface TranslateHistoryItem {
  id: number
  source_lang: string
  target_lang: string
  source_text: string
  result_text: string
  created_at: number
}

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

const sourceLang = ref('zh')
const targetLang = ref('en')
const inputText = ref('')
const resultText = ref('')
const errorMessage = ref('')
const isTranslating = ref(false)
const showHistory = ref(false)
const historyList = ref<TranslateHistoryItem[]>([])

/** 源语言列表 */
const sourceLanguages = computed(() => languages)

/** 目标语言列表（根据源语言过滤） */
const targetLanguages = computed(() => {
  const source = languages.find(l => l.code === sourceLang.value)
  if (!source) return languages
  return languages.filter(l => source.targets.includes(l.code))
})

/** 互换语言 */
const swapLanguages = () => {
  const temp = sourceLang.value
  sourceLang.value = targetLang.value
  targetLang.value = temp
}

/** 清空输入 */
const clearInput = () => {
  inputText.value = ''
  resultText.value = ''
  errorMessage.value = ''
}

/** 执行翻译 */
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
  } catch (error) {
    errorMessage.value = '翻译失败，请重试'
  } finally {
    isTranslating.value = false
  }
}

/** 复制翻译结果 */
const copyResult = async () => {
  try {
    await navigator.clipboard.writeText(resultText.value)
  } catch (error) {
    console.error('复制失败:', error)
  }
}

/** 获取翻译历史 */
const fetchHistory = async () => {
  const list = await window.electron.ipcRenderer.invoke('to-service-TranslateService:getHistory', 100, 0)
  historyList.value = list
}

/** 删除翻译历史 */
const deleteHistory = async (id: number) => {
  await window.electron.ipcRenderer.invoke('to-service-TranslateService:delete', id)
  historyList.value = historyList.value.filter(h => h.id !== id)
}

/** 清空所有历史 */
const clearAllHistory = async () => {
  await window.electron.ipcRenderer.invoke('to-service-TranslateService:clearAll')
  historyList.value = []
  showHistory.value = false
}

/** 重新翻译历史记录 */
const reTranslate = (item: TranslateHistoryItem) => {
  sourceLang.value = item.source_lang
  targetLang.value = item.target_lang
  inputText.value = item.source_text
  showHistory.value = false
  doTranslate()
}

/** 格式化时间 */
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

/** 返回首页 */
const goBack = () => {
  window.electron.ipcRenderer.send('to-main-MainPage:setPage', 'home')
}

onMounted(async () => {
  await fetchHistory()
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
  to { transform: rotate(360deg); }
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
```

### Step 2: 修改 MainPage.vue 添加翻译菜单

```typescript
// src/renderer/src/views/MainPage.vue - script setup 部分添加
import Translate from './Translate.vue'

// 修改 currentPage 类型
const currentPage = ref<'home' | 'clipboard' | 'settings' | 'translate'>('clipboard')
```

```vue
<!-- src/renderer/src/views/MainPage.vue - template 部分添加菜单项 -->
<button
  class="nav-item"
  :class="{ active: currentPage === 'translate' }"
  @click="currentPage = 'translate'"
>
  <span class="nav-icon">🌐</span>
  <span class="nav-label" v-if="!isSidebarCollapsed">翻译</span>
</button>

<!-- 内容区添加翻译页面 -->
<Translate v-else-if="currentPage === 'translate'" />
```

### Step 3: Commit

```bash
git add src/renderer/src/views/Translate.vue src/renderer/src/views/MainPage.vue
git commit -m "feat: 添加翻译页面 (Translate.vue)"
```

---

## Task 3: 修改通知窗口添加翻译按钮

**Files:**
- Modify: `src/renderer/src/views/NoticeNew.vue`
- Modify: `src/main/frame/NoticeNewFrame.ts`

**Interfaces:**
- Consumes: 无
- Produces: 通知窗口右边显示翻译按钮，点击后发送 IPC 事件

### Step 1: 修改 NoticeNew.vue 添加翻译按钮

```vue
<!-- src/renderer/src/views/NoticeNew.vue -->
<template>
  <div class="notice-container">
    <div class="notice-border" :class="{ 'scale-in': isVisible }">
      <div class="notice-card">
        <span class="notice-text">{{ msg }}</span>
        <button class="translate-btn" @click="openTranslate" title="翻译">
          🌐
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

/** 通知消息文本 */
const msg = ref('')

/** 是否可见（触发入场缩放动画） */
const isVisible = ref(false)

/**
 * 设置通知消息内容并触发入场动画
 * @param data - 通知文本
 */
const setMsg = (data: string) => {
  msg.value = data
}

/**
 * 打开翻译页面
 */
const openTranslate = () => {
  window.electron.ipcRenderer.send('to-main-NoticeNewFrame:translate', msg.value)
}

onMounted(() => {
  // 通知主进程渲染已就绪
  window.electron.ipcRenderer.send('to-main-NoticeNewFrame:ready')
  // 监听主进程发送的消息
  window.electron.ipcRenderer.on('to-renderer-NoticeNewFrame:sendMsg', (_e, data: string) => {
    setMsg(data)
    // 下一帧触发 CSS 缩放动画（从 scale(0.2) → scale(1)）
    nextTick(() => {
      isVisible.value = true
    })
  })
})
</script>

<style scoped>
.notice-container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  /* 允许鼠标穿透点击 */
  pointer-events: none;
}

/* 渐变边框容器 - 通过 @property 动画渐变角度，元素本身不旋转 */
.notice-border {
  position: relative;
  width: 360px; /* 增加宽度以容纳翻译按钮 */
  height: 48px;
  border-radius: 24px;
  padding: 2px;
  background: conic-gradient(
    from var(--border-angle),
    #3d8bff,
    #78b4ff,
    #a0d0ff,
    #ff96c8,
    #ff6ab0,
    #ff3d8b,
    #3d8bff
  );
  animation: border-spin 3s linear infinite;
  pointer-events: auto;
  box-shadow:
    0 4px 20px rgba(61, 139, 255, 0.25),
    0 2px 8px rgba(255, 106, 176, 0.15);

  /* 入场初始状态：微小 + 半透明 */
  transform: scale(0.2);
  opacity: 0;
  transform-origin: center center;
  transition:
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.25s ease-out;
}

/* 入场动画触发：缩放到正常大小并显现 */
.notice-border.scale-in {
  transform: scale(1);
  opacity: 1;
}

/* 白色卡片主体 */
.notice-card {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  background: #ffffff;
  border-radius: 22px;
  padding: 0 12px 0 20px;
}

.notice-text {
  color: #1a1a1a;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.3px;
  /* 单行显示，超出省略 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  margin-right: 8px;
}

/* 翻译按钮 */
.translate-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: linear-gradient(135deg, #3d8bff, #ff6ab0);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #fff;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.translate-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(61, 139, 255, 0.4);
}
</style>
```

### Step 2: 修改 NoticeNewFrame.ts 处理翻译按钮点击

```typescript
// src/main/frame/NoticeNewFrame.ts - 在 registerIPC 中添加
this.recvOne('to-main-NoticeNewFrame:translate', (_event, text: string) => {
  // 打开主页面并切换到翻译页面
  const mainPageFrame = windowFactory.getMainPageFrame()
  mainPageFrame.showCentered()

  // 发送文本到翻译页面
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed() && w.isVisible()) {
      w.webContents.send('to-renderer-Translate:fillText', text)
    }
  })
})
```

### Step 3: Commit

```bash
git add src/renderer/src/views/NoticeNew.vue src/main/frame/NoticeNewFrame.ts
git commit -m "feat: 通知窗口添加翻译按钮"
```

---

## Task 4: 修改剪贴板管理添加翻译按钮

**Files:**
- Modify: `src/renderer/src/views/ClipboardManager.vue`

**Interfaces:**
- Consumes: 无
- Produces: 每条记录右边显示翻译按钮，点击后发送 IPC 事件

### Step 1: 修改 ClipboardManager.vue 添加翻译按钮

```vue
<!-- src/renderer/src/views/ClipboardManager.vue - 在 item-actions 区域添加 -->
<div class="item-actions" @click.stop>
  <button
    v-if="activeTab === 'history'"
    class="action-btn translate-action"
    @click="translateItem(item as HistoryItem)"
    title="翻译"
  >
    🌐
  </button>
  <button
    v-if="activeTab === 'history'"
    class="action-btn"
    @click="quickFavorite(item as HistoryItem)"
    title="收藏"
  >
    ⭐
  </button>
  <!-- ... 其他按钮 -->
</div>
```

```typescript
// src/renderer/src/views/ClipboardManager.vue - 添加翻译函数
/**
 * 翻译历史记录项
 * @param item - 历史记录项
 */
const translateItem = (item: HistoryItem): void => {
  window.electron.ipcRenderer.send('to-main-MainPage:openTranslate', item.content)
}
```

### Step 2: 添加翻译按钮样式

```css
/* src/renderer/src/views/ClipboardManager.vue - 在 style 中添加 */
.translate-action {
  color: #3d8bff;
}

.translate-action:hover {
  background: rgba(61, 139, 255, 0.1);
}
```

### Step 3: Commit

```bash
git add src/renderer/src/views/ClipboardManager.vue
git commit -m "feat: 剪贴板历史记录添加翻译按钮"
```

---

## Task 5: 修改设置页面添加翻译 API 配置

**Files:**
- Modify: `src/renderer/src/views/Settings.vue`
- Modify: `src/main/service/settingsService.ts`

**Interfaces:**
- Consumes: `settingsService.getAll()`, `settingsService.update()`
- Produces: 翻译 API 配置区域

### Step 1: 修改 settingsService.ts 添加翻译 API 配置

```typescript
// src/main/service/settingsService.ts - 修改 AppSettings 接口
export interface AppSettings {
  /** Electron accelerator 格式的全局快捷键 */
  shortcut: string
  /** 局域网更新服务器 UNC 路径 */
  serverUrl: string
  /** 翻译 API 地址（可选） */
  translateApiUrl?: string
  /** 翻译 API Key（可选） */
  translateApiKey?: string
}
```

### Step 2: 修改 Settings.vue 添加翻译 API 配置区域

```vue
<!-- src/renderer/src/views/Settings.vue - 在 template 中添加 -->
<!-- 翻译 API 配置 -->
<div class="setting-card">
  <div class="setting-info">
    <span class="setting-label">翻译 API</span>
    <span class="setting-hint">配置翻译服务 API 地址和密钥（留空使用默认免费 API）</span>
  </div>

  <div class="api-config-row">
    <div class="form-group">
      <label>API 地址</label>
      <input
        v-model="translateApiUrl"
        type="text"
        class="form-input"
        placeholder="留空使用默认 API"
        spellcheck="false"
      />
    </div>
    <div class="form-group">
      <label>API Key（可选）</label>
      <input
        v-model="translateApiKey"
        type="password"
        class="form-input"
        placeholder="输入 API Key（如果有）"
      />
    </div>
  </div>

  <button class="btn btn-primary" @click="saveTranslateApi" :disabled="!isTranslateApiDirty">
    ✅ 保存
  </button>

  <Transition name="fade">
    <p v-if="showTranslateApiTip" class="save-tip">✅ 翻译 API 配置已保存</p>
  </Transition>
</div>
```

```typescript
// src/renderer/src/views/Settings.vue - script setup 中添加
const translateApiUrl = ref('')
const translateApiKey = ref('')
const showTranslateApiTip = ref(false)
const translateApiOrig = ref({ apiUrl: '', apiKey: '' })

const isTranslateApiDirty = computed(() => {
  return translateApiUrl.value !== translateApiOrig.value.apiUrl ||
         translateApiKey.value !== translateApiOrig.value.apiKey
})

const saveTranslateApi = async () => {
  await window.electron.ipcRenderer.invoke('to-service-SettingsService:update', {
    translateApiUrl: translateApiUrl.value,
    translateApiKey: translateApiKey.value
  })
  translateApiOrig.value = {
    apiUrl: translateApiUrl.value,
    apiKey: translateApiKey.value
  }
  showTranslateApiTip.value = true
  setTimeout(() => {
    showTranslateApiTip.value = false
  }, 3000)
}

// 在 onMounted 中初始化
const settings = await window.electron.ipcRenderer.invoke('to-service-SettingsService:get')
translateApiUrl.value = settings.translateApiUrl || ''
translateApiKey.value = settings.translateApiKey || ''
translateApiOrig.value = {
  apiUrl: settings.translateApiUrl || '',
  apiKey: settings.translateApiKey || ''
}
```

### Step 3: 添加翻译 API 配置样式

```css
/* src/renderer/src/views/Settings.vue - 在 style 中添加 */
.api-config-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 12px;
  font-weight: 500;
  color: #666;
}

.form-input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #1a1a1a;
  background: #fff;
  outline: none;
  transition: all 0.2s ease;
  font-family: 'Consolas', 'Monaco', monospace;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: #3d8bff;
  box-shadow: 0 0 0 3px rgba(61, 139, 255, 0.1);
}
```

### Step 4: Commit

```bash
git add src/renderer/src/views/Settings.vue src/main/service/settingsService.ts
git commit -m "feat: 设置页面添加翻译 API 配置"
```

---

## Task 6: 添加翻译页面文本填充功能

**Files:**
- Modify: `src/renderer/src/views/Translate.vue`
- Modify: `src/main/frame/MainPageFrame.ts`

**Interfaces:**
- Consumes: `to-renderer-Translate:fillText` IPC 事件
- Produces: 翻译页面支持从外部填充文本

### Step 1: 修改 Translate.vue 添加文本填充监听

```typescript
// src/renderer/src/views/Translate.vue - script setup 中添加
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
```

### Step 2: 修改 MainPageFrame.ts 处理翻译页面打开

```typescript
// src/main/frame/MainPageFrame.ts - 在 registerIPC 中添加
this.recvOne('to-main-MainPage:openTranslate', (_event, text: string) => {
  // 切换到翻译页面
  this.sendOne('to-renderer-MainPage:setPage', 'translate')

  // 发送文本到翻译页面
  setTimeout(() => {
    this.sendOne('to-renderer-Translate:fillText', text)
  }, 100)
})
```

### Step 3: Commit

```bash
git add src/renderer/src/views/Translate.vue src/main/frame/MainPageFrame.ts
git commit -m "feat: 翻译页面支持从外部填充文本"
```

---

## Task 7: 编译检查和文档更新

**Files:**
- Modify: `CLAUDE.md` (更新目录索引)

### Step 1: 运行编译检查

```bash
npm run typecheck
```

### Step 2: 更新 CLAUDE.md 文档

```markdown
# 在目录索引中添加新文件
├── src/main/service/
│   ├── clipboardService.ts
│   ├── inputService.ts
│   ├── settingsService.ts
│   └── translateService.ts    # 翻译服务（API 调用 + 历史管理）
└── src/renderer/src/views/
    └── Translate.vue          # 翻译页面
```

### Step 3: Commit

```bash
git add CLAUDE.md
git commit -m "docs: 更新项目文档，添加翻译功能说明"
```

---

## 完成

所有任务完成后，翻译功能已实现：
- ✅ 翻译服务 (translateService.ts)
- ✅ 翻译页面 (Translate.vue)
- ✅ 通知窗口翻译按钮
- ✅ 剪贴板历史翻译按钮
- ✅ 设置页面翻译 API 配置
- ✅ 文本填充功能
- ✅ 文档更新
