# 搜索框 + Markdown 预览 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为妙妙屋应用新增全局搜索框和 Markdown 预览工具，提升用户效率

**Architecture:** 采用 Electron 多窗口架构，搜索框和 Markdown 预览均为独立窗口，通过 IPC 与主进程通信。搜索服务统一管理工具、剪贴板、应用的搜索逻辑。Markdown 预览使用 markdown-it + highlight.js 实现实时渲染。

**Tech Stack:** Electron 28, Vue 3.4, TypeScript, markdown-it, highlight.js

## Global Constraints

- 跨平台兼容：Windows + macOS
- 快捷键：Windows `Ctrl`，macOS `⌘`
- 窗口样式：无边框、透明背景
- IPC 通信：遵循项目现有的 recvOne/recvTwo/sendOne/sendTwo 模式

---

## 文件结构

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/main/frame/SearchBoxFrame.ts` | 搜索框窗口框架 |
| `src/main/frame/MarkdownPreviewFrame.ts` | Markdown 预览窗口框架 |
| `src/main/service/searchService.ts` | 搜索服务（工具、剪贴板、应用） |
| `src/renderer/src/views/SearchBox.vue` | 搜索框渲染组件 |
| `src/renderer/src/views/MarkdownPreview.vue` | Markdown 预览渲染组件 |
| `src/renderer/src/views/tools/Toolbox.vue` | 工具箱页面 |
| `src/renderer/src/utils/pinyinSearch.ts` | 拼音首字母搜索工具 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/main/frame/WindowFactory.ts` | 添加搜索框和 Markdown 预览窗口管理 |
| `src/main/trayService.ts` | 添加搜索框快捷键 |
| `src/renderer/src/views/MainPage.vue` | 添加工具箱菜单和路由 |

---

## Task 1: 安装依赖

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: 无
- Produces: 安装 markdown-it 和 highlight.js 依赖

- [ ] **Step 1: 安装 markdown-it**

```bash
npm install markdown-it @types/markdown-it
```

- [ ] **Step 2: 安装 highlight.js**

```bash
npm install highlight.js
```

- [ ] **Step 3: 验证安装**

```bash
npm list markdown-it highlight.js
```

Expected: 显示已安装的包版本

- [ ] **Step 4: 提交**

```bash
git add package.json package-lock.json
git commit -m "deps: add markdown-it and highlight.js"
```

---

## Task 2: 拼音首字母搜索工具

**Files:**
- Create: `src/renderer/src/utils/pinyinSearch.ts`

**Interfaces:**
- Consumes: 无
- Produces: `pinyinSearch(items, query)` 函数

- [ ] **Step 1: 创建拼音首字母搜索工具**

```typescript
// src/renderer/src/utils/pinyinSearch.ts

/**
 * 拼音首字母映射表（常用汉字）
 */
const PINYIN_MAP: Record<string, string> = {
  '预': 'y', '览': 'l', '倒': 'd', '计': 'j', '时': 's',
  '剪': 'j', '贴': 't', '板': 'b', '管': 'g', '理': 'l',
  '翻': 'f', '译': 'y', '设': 's', '置': 'z', '下': 'x',
  '载': 'z', '工': 'g', '具': 'j', '箱': 'x', '搜': 's',
  '索': 's', '框': 'k', '马': 'm', '克': 'k', '号': 'h',
  '颜': 'y', '色': 's', '取': 'q', '屏': 'p', '幕': 'm',
  '格': 'g', '式': 's', '化': 'h', ' JSON': 'json',
  '计': 'j', '算': 's', '器': 'q', '记': 'j', '事': 's',
  '本': 'b', '密': 'm', '码': 'm', '生': 's', '成': 'c',
  '随': 's', '机': 'j', '数': 's', ' UUID': 'uuid',
  '正': 'z', '则': 'z', '表': 'b', '达': 'd', '式': 's',
  '编': 'b', '解': 'j', '码': 'm', ' Base64': 'base64',
  '进': 'j', '制': 'z', '转': 'z', '换': 'h',
  ' IP': 'ip', '地': 'd', '址': 'z', '查': 'c',
  '端': 'd', '口': 'k', '扫': 's', '描': 'm',
  '网': 'w', '页': 'y', '截': 'j', '图': 't',
  '文': 'w', '件': 'j', '压': 'y', '缩': 's',
  '解': 'j', '压': 'y', '计': 'j', '时': 's', '器': 'q',
  '备': 'b', '忘': 'w', '录': 'l',
  '日': 'r', '历': 'l', '提': 't', '醒': 'x',
  '快': 'k', '捷': 'j', '指': 'z', '令': 'l',
  '代': 'd', '码': 'm', '片': 'p', '段': 'd',
  '颜': 'y', '色': 's', '选': 'x', '择': 'z',
  '字': 'z', '体': 't', '管': 'g', '理': 'l',
  '主': 'z', '题': 't', '切': 'q', '换': 'h',
  '背': 'b', '景': 'j', '图': 't', '片': 'p',
  '壁': 'b', '纸': 'z', '下': 'x', '载': 'z',
  '系': 'x', '统': 't', '信': 'x', '息': 'x',
  '性': 'x', '能': 'n', '监': 'j', '控': 'k',
  '网': 'w', '络': 'l', '状': 'z', '态': 't',
  '磁': 'c', '盘': 'p', '空': 'k', '间': 'j',
  '进': 'j', '程': 'c', '管': 'g', '理': 'l',
  '服': 'f', '务': 'w', '器': 'q',
  '数': 's', '据': 'j', '库': 'k',
  ' API': 'api', '接': 'j', '口': 'k',
  '邮': 'y', '件': 'j', '发': 'f', '送': 's',
  '短': 'd', '信': 'x', '验': 'y', '证': 'z',
  '支': 'z', '付': 'f', '宝': 'b', '微': 'w',
  '信': 'x', '支': 'z', '付': 'f',
  '二': 'e', '维': 'w', '码': 'm', '生': 's',
  '条': 't', '形': 'x', '码': 'm',
  ' IP': 'ip', '追': 'z', '踪': 'g',
  '邮': 'y', '箱': 'x', '验': 'y', '证': 'z',
  '身': 's', '份': 'f', '证': 'z',
  '银': 'y', '行': 'h', '卡': 'k',
  '密': 'm', '码': 'm', '加': 'j', '密': 'm',
  '文': 'w', '件': 'j', '加': 'j', '密': 'm',
  '图': 't', '片': 'p', '压': 'y', '缩': 's',
  '视': 's', '频': 'p', '转': 'z', '换': 'h',
  '音': 'y', '频': 'p', '转': 'z', '换': 'h',
  '文': 'w', '档': 'd', '转': 'z', '换': 'h',
  ' PDF': 'pdf',
  ' Word': 'word',
  ' Excel': 'excel',
  ' PPT': 'ppt',
  ' Markdown': 'markdown',
  ' HTML': 'html',
  ' CSS': 'css',
  ' JavaScript': 'javascript',
  ' TypeScript': 'typescript',
  ' Python': 'python',
  ' Java': 'java',
  ' C': 'c',
  ' C++': 'c++',
  ' C#': 'c#',
  ' Go': 'go',
  ' Rust': 'rust',
  ' Ruby': 'ruby',
  ' PHP': 'php',
  ' Swift': 'swift',
  ' Kotlin': 'kotlin',
  ' Dart': 'dart',
  ' Lua': 'lua',
  ' Shell': 'shell',
  ' SQL': 'sql',
  ' JSON': 'json',
  ' XML': 'xml',
  ' YAML': 'yaml',
  ' TOML': 'toml',
  ' INI': 'ini',
  ' REG': 'reg',
}

/**
 * 获取字符串的拼音首字母
 * @param str - 输入字符串
 * @returns 拼音首字母
 */
function getPinyinInitials(str: string): string {
  let result = ''
  for (const char of str) {
    if (PINYIN_MAP[char]) {
      result += PINYIN_MAP[char]
    } else if (/[a-zA-Z0-9]/.test(char)) {
      result += char.toLowerCase()
    }
  }
  return result
}

/**
 * 搜索结果项接口
 */
export interface SearchableItem {
  id: string
  name: string
  aliases?: string[]
  category: string
}

/**
 * 搜索结果接口
 */
export interface SearchResult {
  item: SearchableItem
  score: number
  matchType: 'exact' | 'prefix' | 'pinyin' | 'fuzzy'
}

/**
 * 拼音首字母搜索
 * @param items - 可搜索的项目列表
 * @param query - 搜索关键词
 * @returns 搜索结果，按分数排序
 */
export function pinyinSearch<T extends SearchableItem>(items: T[], query: string): SearchResult[] {
  if (!query.trim()) return []

  const lowerQuery = query.toLowerCase()
  const results: SearchResult[] = []

  for (const item of items) {
    const name = item.name.toLowerCase()
    const pinyin = getPinyinInitials(item.name).toLowerCase()
    const aliases = (item.aliases || []).map(a => a.toLowerCase())

    let score = 0
    let matchType: SearchResult['matchType'] = 'fuzzy'

    // 精确匹配
    if (name === lowerQuery) {
      score = 100
      matchType = 'exact'
    }
    // 前缀匹配
    else if (name.startsWith(lowerQuery)) {
      score = 80
      matchType = 'prefix'
    }
    // 别名前缀匹配
    else if (aliases.some(a => a.startsWith(lowerQuery))) {
      score = 70
      matchType = 'prefix'
    }
    // 拼音首字母匹配
    else if (pinyin.startsWith(lowerQuery)) {
      score = 60
      matchType = 'pinyin'
    }
    // 包含匹配
    else if (name.includes(lowerQuery)) {
      score = 40
      matchType = 'fuzzy'
    }
    // 拼音包含匹配
    else if (pinyin.includes(lowerQuery)) {
      score = 30
      matchType = 'fuzzy'
    }

    if (score > 0) {
      results.push({ item, score, matchType })
    }
  }

  // 按分数降序排序
  return results.sort((a, b) => b.score - a.score)
}
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/src/utils/pinyinSearch.ts
git commit -m "feat: add pinyin initials search utility"
```

---

## Task 3: 搜索服务

**Files:**
- Create: `src/main/service/searchService.ts`
- Modify: `src/main/frame/WindowFactory.ts`

**Interfaces:**
- Consumes: 现有的 WindowFactory, clipboardService
- Produces: `searchService.search(query)`, `searchService.getTools()`

- [ ] **Step 1: 创建搜索服务**

```typescript
// src/main/service/searchService.ts

import { app, shell } from 'electron'
import { windowFactory } from '../frame'

/**
 * 工具定义接口
 */
export interface Tool {
  id: string
  name: string
  aliases: string[]
  category: string
  icon: string
  description: string
  action: () => void
}

/**
 * 搜索结果项接口
 */
export interface SearchResultItem {
  id: string
  name: string
  aliases: string[]
  category: string
  icon: string
  description: string
  score: number
  matchType: 'exact' | 'prefix' | 'pinyin' | 'fuzzy'
}

/**
 * 搜索服务
 * @description 统一管理工具、剪贴板、应用的搜索逻辑
 */
class SearchService {
  /** 工具列表 */
  private tools: Tool[] = [
    {
      id: 'markdown-preview',
      name: 'Markdown 预览',
      aliases: ['md', '预览', 'markdown'],
      category: 'tool',
      icon: '📝',
      description: '实时 Markdown 分屏预览',
      action: () => windowFactory.createMarkdownPreviewFrame().show()
    },
    {
      id: 'clipboard-manager',
      name: '剪贴板管理',
      aliases: ['cb', '剪贴板', '复制'],
      category: 'tool',
      icon: '📋',
      description: '查看和管理剪贴板历史',
      action: () => windowFactory.getMainPageFrame().showAndPage('clipboard')
    },
    {
      id: 'translate',
      name: '翻译',
      aliases: ['fy', '翻译', 'translate'],
      category: 'tool',
      icon: '🌐',
      description: '多语言文本翻译',
      action: () => windowFactory.getMainPageFrame().showAndPage('translate')
    },
    {
      id: 'settings',
      name: '设置',
      aliases: ['sz', '设置', 'settings'],
      category: 'tool',
      icon: '⚙️',
      description: '应用设置',
      action: () => windowFactory.getMainPageFrame().showAndPage('settings')
    }
  ]

  /**
   * 获取所有工具列表
   * @returns 工具列表
   */
  getTools(): Tool[] {
    return this.tools
  }

  /**
   * 搜索工具
   * @param query - 搜索关键词
   * @returns 搜索结果
   */
  searchTools(query: string): SearchResultItem[] {
    if (!query.trim()) return []

    const lowerQuery = query.toLowerCase()
    const results: SearchResultItem[] = []

    for (const tool of this.tools) {
      const name = tool.name.toLowerCase()
      const pinyin = this.getPinyinInitials(tool.name).toLowerCase()
      const aliases = tool.aliases.map(a => a.toLowerCase())

      let score = 0
      let matchType: SearchResultItem['matchType'] = 'fuzzy'

      // 精确匹配
      if (name === lowerQuery) {
        score = 100
        matchType = 'exact'
      }
      // 前缀匹配
      else if (name.startsWith(lowerQuery)) {
        score = 80
        matchType = 'prefix'
      }
      // 别名前缀匹配
      else if (aliases.some(a => a.startsWith(lowerQuery))) {
        score = 70
        matchType = 'prefix'
      }
      // 拼音首字母匹配
      else if (pinyin.startsWith(lowerQuery)) {
        score = 60
        matchType = 'pinyin'
      }
      // 包含匹配
      else if (name.includes(lowerQuery)) {
        score = 40
        matchType = 'fuzzy'
      }
      // 拼音包含匹配
      else if (pinyin.includes(lowerQuery)) {
        score = 30
        matchType = 'fuzzy'
      }

      if (score > 0) {
        results.push({
          ...tool,
          score,
          matchType
        })
      }
    }

    return results.sort((a, b) => b.score - a.score)
  }

  /**
   * 搜索剪贴板历史
   * @param query - 搜索关键词
   * @returns 搜索结果
   */
  async searchClipboard(query: string): Promise<SearchResultItem[]> {
    if (!query.trim()) return []

    try {
      // 动态导入剪贴板服务
      const { default: clipboardService } = await import('./clipboardService')
      const history = await clipboardService.search(query, 10)

      return history.map((item, index) => ({
        id: `clipboard-${item.id}`,
        name: item.content.substring(0, 50) + (item.content.length > 50 ? '...' : ''),
        aliases: [],
        category: 'clipboard',
        icon: '📋',
        description: item.content,
        score: 100 - index,
        matchType: 'fuzzy' as const
      }))
    } catch (error) {
      console.error('搜索剪贴板失败:', error)
      return []
    }
  }

  /**
   * 打开文件/文件夹
   * @param path - 文件路径
   */
  openFile(path: string): void {
    shell.openPath(path)
  }

  /**
   * 打开网页
   * @param url - 网址
   */
  openUrl(url: string): void {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }
    shell.openExternal(url)
  }

  /**
   * 执行工具动作
   * @param toolId - 工具 ID
   */
  executeTool(toolId: string): void {
    const tool = this.tools.find(t => t.id === toolId)
    if (tool) {
      tool.action()
    }
  }

  /**
   * 获取字符串的拼音首字母
   * @param str - 输入字符串
   * @returns 拼音首字母
   */
  private getPinyinInitials(str: string): string {
    const pinyinMap: Record<string, string> = {
      '预': 'y', '览': 'l', '倒': 'd', '计': 'j', '时': 's',
      '剪': 'j', '贴': 't', '板': 'b', '管': 'g', '理': 'l',
      '翻': 'f', '译': 'y', '设': 's', '置': 'z', '下': 'x',
      '载': 'z', '工': 'g', '具': 'j', '箱': 'x', '搜': 's',
      '索': 's', '框': 'k', '马': 'm', '克': 'k', '号': 'h',
      '颜': 'y', '色': 's', '取': 'q', '屏': 'p', '幕': 'm',
      '格': 'g', '式': 's', '化': 'h',
    }

    let result = ''
    for (const char of str) {
      if (pinyinMap[char]) {
        result += pinyinMap[char]
      } else if (/[a-zA-Z0-9]/.test(char)) {
        result += char.toLowerCase()
      }
    }
    return result
  }
}

// 导出单例
export const searchService = new SearchService()
```

- [ ] **Step 2: 提交**

```bash
git add src/main/service/searchService.ts
git commit -m "feat: add search service for tools and clipboard"
```

---

## Task 4: 搜索框窗口框架

**Files:**
- Create: `src/main/frame/SearchBoxFrame.ts`
- Modify: `src/main/frame/WindowFactory.ts`

**Interfaces:**
- Consumes: BaseFrame, searchService
- Produces: SearchBoxFrame 类, windowFactory.createSearchBoxFrame()

- [ ] **Step 1: 创建搜索框窗口框架**

```typescript
// src/main/frame/SearchBoxFrame.ts

import { BrowserWindow, BrowserWindowConstructorOptions, screen } from 'electron'
import BaseFrame from './BaseFrame'
import { searchService } from '../service/searchService'

/**
 * 搜索框窗口
 * @description 全局搜索框，快捷键呼出，支持工具搜索、剪贴板搜索
 */
export default class SearchBoxFrame extends BaseFrame {
  /** 窗口宽度 */
  static readonly WIDTH = 600

  /** 窗口高度 */
  static readonly HEIGHT = 400

  /** 窗口配置 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: SearchBoxFrame.WIDTH,
    height: SearchBoxFrame.HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    show: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  }

  /** 路由路径 */
  protected readonly routePath: string = '/searchBox'

  /** 是否正在显示 */
  #isVisible = false

  /**
   * 重写创建方法
   */
  create(): BrowserWindow {
    const window = super.create()
    window.hide()
    return window
  }

  /**
   * 显示/隐藏搜索框（toggle）
   */
  toggle(): void {
    if (this.#isVisible) {
      this.hide()
    } else {
      this.show()
    }
  }

  /**
   * 显示搜索框
   */
  show(): void {
    if (!this.isAlive()) {
      this.create()
      this.#centerOnScreen()
      this.window!.setOpacity(0)
      this.window!.show()

      this.window!.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          this.window?.setOpacity(1)
          this.#isVisible = true
        }, 30)
      })
    } else if (!this.window!.isVisible()) {
      this.#centerOnScreen()
      this.window!.setOpacity(0)
      this.window!.show()
      setTimeout(() => {
        this.window?.setOpacity(1)
        this.#isVisible = true
      }, 30)
    }
  }

  /**
   * 隐藏搜索框
   */
  hide(): void {
    if (this.isAlive() && this.window!.isVisible()) {
      this.window!.setOpacity(0)
      setTimeout(() => {
        this.window?.hide()
        this.#isVisible = false
      }, 150)
    }
  }

  /**
   * 将窗口定位到屏幕正中心
   */
  #centerOnScreen(): void {
    if (!this.window || this.window.isDestroyed()) return

    const display = screen.getPrimaryDisplay()
    const { workArea } = display

    const width = this.window.getSize()[0]
    const height = this.window.getSize()[1]

    const x = Math.round(workArea.x + (workArea.width - width) / 2)
    const y = Math.round(workArea.y + (workArea.height - height) / 2)

    this.window.setPosition(x, y)
  }

  /**
   * 注册 IPC 监听器
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 搜索工具
    this.recvTwo('to-main-SearchBox:searchTools', (_event, query: string) => {
      return searchService.searchTools(query)
    })

    // 搜索剪贴板
    this.recvTwo('to-main-SearchBox:searchClipboard', async (_event, query: string) => {
      return await searchService.searchClipboard(query)
    })

    // 执行工具
    this.recvOne('to-main-SearchBox:executeTool', (_event, toolId: string) => {
      searchService.executeTool(toolId)
      this.hide()
    })

    // 打开文件
    this.recvOne('to-main-SearchBox:openFile', (_event, filePath: string) => {
      searchService.openFile(filePath)
      this.hide()
    })

    // 打开网页
    this.recvOne('to-main-SearchBox:openUrl', (_event, url: string) => {
      searchService.openUrl(url)
      this.hide()
    })

    // 复制剪贴板内容
    this.recvOne('to-main-SearchBox:copyClipboard', (_event, content: string) => {
      const { clipboard } = require('electron')
      clipboard.writeText(content)
      this.hide()
    })

    // 隐藏搜索框
    this.recvOne('to-main-SearchBox:hide', () => {
      this.hide()
    })

    // 失去焦点时隐藏
    this.window?.on('blur', () => {
      this.hide()
    })
  }
}
```

- [ ] **Step 2: 在 WindowFactory 中注册搜索框**

```typescript
// src/main/frame/WindowFactory.ts

import SearchBoxFrame from './SearchBoxFrame'

// 在 WindowFactory 类中添加
#searchBoxFrame: SearchBoxFrame | null = null

/**
 * 获取搜索框窗口
 * @returns SearchBoxFrame 实例
 */
getSearchBoxFrame(): SearchBoxFrame {
  if (!this.#searchBoxFrame) {
    this.#searchBoxFrame = new SearchBoxFrame()
    this.#searchBoxFrame.onDestroyCallback = () => {
      this.#searchBoxFrame = null
    }
  }
  return this.#searchBoxFrame
}

/**
 * 创建搜索框窗口
 * @returns SearchBoxFrame 实例
 */
createSearchBoxFrame(): SearchBoxFrame {
  const frame = this.getSearchBoxFrame()
  frame.create()
  return frame
}
```

- [ ] **Step 3: 在 destroyAll 和 closeAll 中添加搜索框**

```typescript
// 在 destroyAll 方法中添加
this.#searchBoxFrame?.destroy()

// 在 closeAll 方法中添加
this.#searchBoxFrame?.hide()
```

- [ ] **Step 4: 提交**

```bash
git add src/main/frame/SearchBoxFrame.ts src/main/frame/WindowFactory.ts
git commit -m "feat: add search box window frame"
```

---

## Task 5: 搜索框渲染组件

**Files:**
- Create: `src/renderer/src/views/SearchBox.vue`
- Modify: `src/renderer/src/router/routes.ts`

**Interfaces:**
- Consumes: pinyinSearch, IPC
- Produces: 搜索框 UI 组件

- [ ] **Step 1: 创建搜索框渲染组件**

```vue
<!-- src/renderer/src/views/SearchBox.vue -->
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
import { ref, onMounted, onUnmounted } from 'vue'

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
```

- [ ] **Step 2: 添加路由**

```typescript
// src/renderer/src/router/routes.ts

import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/Home.vue')
  },
  {
    path: '/mainPage',
    name: 'mainPage',
    component: () => import('../views/MainPage.vue')
  },
  {
    path: '/searchBox',
    name: 'searchBox',
    component: () => import('../views/SearchBox.vue')
  },
  {
    path: '/markdownPreview',
    name: 'markdownPreview',
    component: () => import('../views/MarkdownPreview.vue')
  },
  {
    path: '/notice',
    name: 'notice',
    component: () => import('../views/Notice.vue')
  },
  {
    path: '/noticeNew',
    name: 'noticeNew',
    component: () => import('../views/NoticeNew.vue')
  },
  {
    path: '/updateNew',
    name: 'updateNew',
    component: () => import('../views/UpdateNew.vue')
  },
  {
    path: '/openDialog',
    name: 'openDialog',
    component: () => import('../views/OpenDialog.vue')
  },
  {
    path: '/test',
    name: 'test',
    component: () => import('../views/Test.vue')
  },
  {
    path: '/permissionNotice',
    name: 'permissionNotice',
    component: () => import('../views/PermissionNotice.vue')
  },
  {
    path: '/claudeCodeStatus',
    name: 'claudeCodeStatus',
    component: () => import('../views/ClaudeCodeStatus.vue')
  }
]

export default routes
```

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/views/SearchBox.vue src/renderer/src/router/routes.ts
git commit -m "feat: add search box UI component"
```

---

## Task 6: 注册全局快捷键

**Files:**
- Modify: `src/main/trayService.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: searchService, windowFactory
- Produces: 全局快捷键 Ctrl+K 呼出搜索框

- [ ] **Step 1: 在主进程注册全局快捷键**

```typescript
// src/main/index.ts

import { globalShortcut } from 'electron'
import { windowFactory } from './frame'

// 在 app.whenReady() 中添加
app.whenReady().then(() => {
  // 注册全局快捷键 Ctrl+K 呼出搜索框
  globalShortcut.register('CommandOrControl+K', () => {
    windowFactory.getSearchBoxFrame().toggle()
  })

  // 其他初始化代码...
})

// 在 app.on('will-quit') 中添加
app.on('will-quit', () => {
  // 注销所有全局快捷键
  globalShortcut.unregisterAll()
})
```

- [ ] **Step 2: 提交**

```bash
git add src/main/index.ts
git commit -m "feat: register global shortcut Ctrl+K for search box"
```

---

## Task 7: Markdown 预览窗口框架

**Files:**
- Create: `src/main/frame/MarkdownPreviewFrame.ts`
- Modify: `src/main/frame/WindowFactory.ts`

**Interfaces:**
- Consumes: BaseFrame
- Produces: MarkdownPreviewFrame 类, windowFactory.createMarkdownPreviewFrame()

- [ ] **Step 1: 创建 Markdown 预览窗口框架**

```typescript
// src/main/frame/MarkdownPreviewFrame.ts

import { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import BaseFrame from './BaseFrame'

/**
 * Markdown 预览窗口
 * @description 多标签页实时分屏预览，支持拖入文件
 */
export default class MarkdownPreviewFrame extends BaseFrame {
  /** 窗口宽度 */
  static readonly WIDTH = 900

  /** 窗口高度 */
  static readonly HEIGHT = 600

  /** 最小宽度 */
  static readonly MIN_WIDTH = 600

  /** 最小高度 */
  static readonly MIN_HEIGHT = 400

  /** 窗口配置 */
  protected readonly options: BrowserWindowConstructorOptions = {
    width: MarkdownPreviewFrame.WIDTH,
    height: MarkdownPreviewFrame.HEIGHT,
    minWidth: MarkdownPreviewFrame.MIN_WIDTH,
    minHeight: MarkdownPreviewFrame.MIN_HEIGHT,
    backgroundColor: '#1e1e1e',
    frame: false,
    show: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  }

  /** 路由路径 */
  protected readonly routePath: string = '/markdownPreview'

  /** 文件路径到内容的映射 */
  #fileContents: Map<string, string> = new Map()

  /**
   * 注册 IPC 监听器
   */
  protected registerIPC(): void {
    super.registerIPC()

    // 最小化窗口
    this.recvOne('to-main-MarkdownPreview:minimize', () => {
      if (this.isAlive()) {
        this.window!.minimize()
      }
    })

    // 最大化/还原窗口
    this.recvOne('to-main-MarkdownPreview:toggleMaximize', () => {
      if (this.isAlive()) {
        if (this.window!.isMaximized()) {
          this.window!.unmaximize()
        } else {
          this.window!.maximize()
        }
      }
    })

    // 关闭窗口
    this.recvOne('to-main-MarkdownPreview:close', () => {
      this.destroy()
    })

    // 读取文件
    this.recvTwo('to-main-MarkdownPreview:readFile', async (_event, filePath: string) => {
      try {
        const fs = require('fs/promises')
        const content = await fs.readFile(filePath, 'utf-8')
        this.#fileContents.set(filePath, content)
        return { success: true, content }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })

    // 保存文件
    this.recvTwo('to-main-MarkdownPreview:saveFile', async (_event, filePath: string, content: string) => {
      try {
        const fs = require('fs/promises')
        await fs.writeFile(filePath, content, 'utf-8')
        this.#fileContents.set(filePath, content)
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })
  }
}
```

- [ ] **Step 2: 在 WindowFactory 中注册 Markdown 预览窗口**

```typescript
// src/main/frame/WindowFactory.ts

import MarkdownPreviewFrame from './MarkdownPreviewFrame'

// 在 WindowFactory 类中添加
#markdownPreviewFrame: MarkdownPreviewFrame | null = null

/**
 * 获取 Markdown 预览窗口
 * @returns MarkdownPreviewFrame 实例
 */
getMarkdownPreviewFrame(): MarkdownPreviewFrame {
  if (!this.#markdownPreviewFrame) {
    this.#markdownPreviewFrame = new MarkdownPreviewFrame()
    this.#markdownPreviewFrame.onDestroyCallback = () => {
      this.#markdownPreviewFrame = null
    }
  }
  return this.#markdownPreviewFrame
}

/**
 * 创建 Markdown 预览窗口
 * @returns MarkdownPreviewFrame 实例
 */
createMarkdownPreviewFrame(): MarkdownPreviewFrame {
  const frame = this.getMarkdownPreviewFrame()
  frame.create()
  return frame
}
```

- [ ] **Step 3: 在 destroyAll 和 closeAll 中添加 Markdown 预览窗口**

```typescript
// 在 destroyAll 方法中添加
this.#markdownPreviewFrame?.destroy()

// 在 closeAll 方法中添加
this.#markdownPreviewFrame?.destroy()
```

- [ ] **Step 4: 提交**

```bash
git add src/main/frame/MarkdownPreviewFrame.ts src/main/frame/WindowFactory.ts
git commit -m "feat: add markdown preview window frame"
```

---

## Task 8: Markdown 预览渲染组件

**Files:**
- Create: `src/renderer/src/views/MarkdownPreview.vue`

**Interfaces:**
- Consumes: markdown-it, highlight.js, IPC
- Produces: Markdown 预览 UI 组件

- [ ] **Step 1: 创建 Markdown 预览渲染组件**

```vue
<!-- src/renderer/src/views/MarkdownPreview.vue -->
<template>
  <div class="markdown-preview" @drop.prevent="onDrop" @dragover.prevent>
    <!-- 标题栏 -->
    <div class="title-bar">
      <div class="title-bar-drag">
        <span class="title-icon">📝</span>
        <span class="title-text">Markdown 预览</span>
      </div>
      <div class="window-controls">
        <button class="control-btn" @click="minimize" title="最小化">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
        <button class="control-btn" @click="toggleMaximize" title="最大化">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="2" y="2" width="8" height="8" stroke="currentColor" stroke-width="1.5" fill="none" />
          </svg>
        </button>
        <button class="control-btn close-btn" @click="close" title="关闭">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.5" />
            <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 标签页栏 -->
    <div class="tabs-bar">
      <div class="tabs">
        <div
          v-for="(tab, index) in tabs"
          :key="tab.id"
          class="tab"
          :class="{ active: activeTabId === tab.id }"
          @click="activeTabId = tab.id"
        >
          <span class="tab-icon">📄</span>
          <span class="tab-name">{{ tab.name }}</span>
          <button class="tab-close" @click.stop="closeTab(tab.id)" v-if="tabs.length > 1">×</button>
        </div>
      </div>
      <button class="add-tab-btn" @click="addTab" title="新建标签">+</button>
    </div>

    <!-- 内容区 -->
    <div class="content">
      <div class="editor" :style="{ width: editorWidth + '%' }">
        <textarea
          v-model="currentContent"
          class="editor-textarea"
          placeholder="输入 Markdown 内容，或拖入 .md 文件..."
          @input="onInput"
          @keydown="onKeydown"
          spellcheck="false"
        ></textarea>
      </div>
      <div class="divider" @mousedown="startDrag"></div>
      <div class="preview" :style="{ width: (100 - editorWidth) + '%' }">
        <div class="preview-content" v-html="renderedContent"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

// 初始化 markdown-it
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return '<pre class="hljs"><code>' +
          hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
          '</code></pre>'
      } catch (_) {}
    }
    return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>'
  }
})

interface Tab {
  id: string
  name: string
  content: string
  filePath?: string
}

const tabs = ref<Tab[]>([
  { id: '1', name: '未命名', content: '' }
])
const activeTabId = ref('1')
const editorWidth = ref(50)
const isDragging = ref(false)

// 当前激活的标签页内容
const currentContent = computed({
  get: () => tabs.value.find(t => t.id === activeTabId.value)?.content || '',
  set: (value) => {
    const tab = tabs.value.find(t => t.id === activeTabId.value)
    if (tab) {
      tab.content = value
    }
  }
})

// 渲染 Markdown
const renderedContent = computed(() => {
  return md.render(currentContent.value)
})

// 监听内容变化
const onInput = () => {
  // 实时渲染通过 computed 自动处理
}

// 键盘事件处理
const onKeydown = (e: KeyboardEvent) => {
  // Ctrl+S 保存
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    saveCurrentTab()
  }
  // Tab 缩进
  if (e.key === 'Tab') {
    e.preventDefault()
    const textarea = e.target as HTMLTextAreaElement
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    currentContent.value = currentContent.value.substring(0, start) + '  ' + currentContent.value.substring(end)
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + 2
    }, 0)
  }
}

// 添加新标签
const addTab = () => {
  const newId = String(Date.now())
  tabs.value.push({
    id: newId,
    name: '未命名',
    content: ''
  })
  activeTabId.value = newId
}

// 关闭标签
const closeTab = (tabId: string) => {
  const index = tabs.value.findIndex(t => t.id === tabId)
  if (index > -1 && tabs.value.length > 1) {
    tabs.value.splice(index, 1)
    if (activeTabId.value === tabId) {
      activeTabId.value = tabs.value[Math.min(index, tabs.value.length - 1)].id
    }
  }
}

// 拖拽分隔线
const startDrag = (e: MouseEvent) => {
  isDragging.value = true
  const startX = e.clientX
  const startWidth = editorWidth.value
  const container = document.querySelector('.content') as HTMLElement
  const containerWidth = container?.offsetWidth || 1

  const onMouseMove = (e: MouseEvent) => {
    const delta = e.clientX - startX
    const newWidth = startWidth + (delta / containerWidth) * 100
    editorWidth.value = Math.max(20, Math.min(80, newWidth))
  }

  const onMouseUp = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// 拖入文件
const onDrop = async (e: DragEvent) => {
  const files = e.dataTransfer?.files
  if (!files) return

  for (const file of Array.from(files)) {
    if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
      try {
        const content = await window.electron.ipcRenderer.invoke(
          'to-main-MarkdownPreview:readFile',
          file.path
        )
        if (content.success) {
          const newId = String(Date.now())
          tabs.value.push({
            id: newId,
            name: file.name,
            content: content.content,
            filePath: file.path
          })
          activeTabId.value = newId
        }
      } catch (error) {
        console.error('读取文件失败:', error)
      }
    }
  }
}

// 保存当前标签
const saveCurrentTab = async () => {
  const tab = tabs.value.find(t => t.id === activeTabId.value)
  if (!tab) return

  if (tab.filePath) {
    try {
      await window.electron.ipcRenderer.invoke(
        'to-main-MarkdownPreview:saveFile',
        tab.filePath,
        tab.content
      )
      console.log('文件已保存')
    } catch (error) {
      console.error('保存失败:', error)
    }
  }
}

// 窗口控制
const minimize = () => {
  window.electron.ipcRenderer.send('to-main-MarkdownPreview:minimize')
}

const toggleMaximize = () => {
  window.electron.ipcRenderer.send('to-main-MarkdownPreview:toggleMaximize')
}

const close = () => {
  window.electron.ipcRenderer.send('to-main-MarkdownPreview:close')
}

onMounted(() => {
  // 设置窗口可拖拽区域
})
</script>

<style scoped>
.markdown-preview {
  width: 100%;
  height: 100%;
  background: #1e1e1e;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
}

.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  background: #252526;
  padding: 0 8px;
}

.title-bar-drag {
  -webkit-app-region: drag;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 14px;
}

.title-text {
  font-size: 12px;
  color: #ccc;
}

.window-controls {
  display: flex;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  transition: all 0.15s ease;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.close-btn:hover {
  background: #e81123;
  color: #fff;
}

.tabs-bar {
  display: flex;
  align-items: center;
  background: #252526;
  border-bottom: 1px solid #333;
  padding: 0 8px;
}

.tabs {
  display: flex;
  flex: 1;
  overflow-x: auto;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: #999;
  font-size: 12px;
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease;
}

.tab:hover {
  background: rgba(255, 255, 255, 0.05);
}

.tab.active {
  color: #fff;
  border-bottom-color: #007acc;
  background: rgba(255, 255, 255, 0.05);
}

.tab-icon {
  font-size: 12px;
}

.tab-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close {
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: #999;
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.add-tab-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: #999;
  font-size: 18px;
  margin-left: 4px;
}

.add-tab-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.editor {
  display: flex;
  flex-direction: column;
  border-right: 1px solid #333;
}

.editor-textarea {
  flex: 1;
  background: #1e1e1e;
  border: none;
  outline: none;
  color: #d4d4d4;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  line-height: 1.6;
  padding: 16px;
  resize: none;
}

.editor-textarea::placeholder {
  color: #666;
}

.divider {
  width: 4px;
  background: #333;
  cursor: col-resize;
  transition: background 0.15s ease;
}

.divider:hover {
  background: #007acc;
}

.preview {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  color: #d4d4d4;
  font-size: 14px;
  line-height: 1.6;
}

/* Markdown 样式 */
.preview-content :deep(h1) {
  font-size: 2em;
  margin: 0.5em 0;
  padding-bottom: 0.3em;
  border-bottom: 1px solid #333;
}

.preview-content :deep(h2) {
  font-size: 1.5em;
  margin: 0.5em 0;
  padding-bottom: 0.3em;
  border-bottom: 1px solid #333;
}

.preview-content :deep(h3) {
  font-size: 1.25em;
  margin: 0.5em 0;
}

.preview-content :deep(p) {
  margin: 0.5em 0;
}

.preview-content :deep(code) {
  background: #2d2d2d;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.9em;
}

.preview-content :deep(pre) {
  background: #2d2d2d;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
}

.preview-content :deep(pre code) {
  background: transparent;
  padding: 0;
}

.preview-content :deep(blockquote) {
  border-left: 4px solid #007acc;
  margin: 0.5em 0;
  padding: 0.5em 1em;
  background: rgba(0, 122, 204, 0.1);
}

.preview-content :deep(ul),
.preview-content :deep(ol) {
  margin: 0.5em 0;
  padding-left: 2em;
}

.preview-content :deep(li) {
  margin: 0.25em 0;
}

.preview-content :deep(a) {
  color: #007acc;
  text-decoration: none;
}

.preview-content :deep(a:hover) {
  text-decoration: underline;
}

.preview-content :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}

.preview-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
}

.preview-content :deep(th),
.preview-content :deep(td) {
  border: 1px solid #333;
  padding: 8px 12px;
  text-align: left;
}

.preview-content :deep(th) {
  background: #2d2d2d;
}
</style>
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/src/views/MarkdownPreview.vue
git commit -m "feat: add markdown preview component with multi-tab support"
```

---

## Task 9: 主界面工具箱页面

**Files:**
- Create: `src/renderer/src/views/tools/Toolbox.vue`
- Modify: `src/renderer/src/views/MainPage.vue`

**Interfaces:**
- Consumes: IPC
- Produces: 工具箱页面 UI

- [ ] **Step 1: 创建工具箱页面**

```vue
<!-- src/renderer/src/views/tools/Toolbox.vue -->
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
```

- [ ] **Step 2: 修改主界面添加工具箱菜单**

```typescript
// src/renderer/src/views/MainPage.vue

// 在 template 中添加工具箱菜单项
<template>
  <!-- 在侧边栏导航中添加 -->
  <button
    class="nav-item"
    :class="{ active: currentPage === 'toolbox' }"
    @click="currentPage = 'toolbox'"
  >
    <span class="nav-icon">🛠️</span>
    <span class="nav-label" v-if="!isSidebarCollapsed">工具箱</span>
  </button>

  <!-- 在内容区添加 -->
  <Toolbox v-else-if="currentPage === 'toolbox'" key="toolbox" />
</template>

<script setup lang="ts">
import Toolbox from './tools/Toolbox.vue'

// 修改 currentPage 类型
const currentPage = ref<'home' | 'clipboard' | 'settings' | 'translate' | 'download' | 'toolbox'>('clipboard')

// 在 onSetPage 中添加 toolbox
const onSetPage = (_event: Electron.IpcRendererEvent, page: string): void => {
  if (['home', 'clipboard', 'settings', 'translate', 'download', 'toolbox'].includes(page)) {
    currentPage.value = page as typeof currentPage.value
  }
}
</script>
```

- [ ] **Step 3: 在 MainPageFrame 中添加打开 Markdown 预览的方法**

```typescript
// src/main/frame/MainPageFrame.ts

// 在 registerIPC 中添加
this.recvOne('to-main-MainPage:openMarkdownPreview', () => {
  windowFactory.createMarkdownPreviewFrame().show()
})
```

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/views/tools/Toolbox.vue src/renderer/src/views/MainPage.vue src/main/frame/MainPageFrame.ts
git commit -m "feat: add toolbox page to main interface"
```

---

## Task 10: 编译检查

**Files:**
- 无

**Interfaces:**
- Consumes: 所有新增代码
- Produces: 编译通过

- [ ] **Step 1: 运行类型检查**

```bash
npm run typecheck
```

Expected: 无错误

- [ ] **Step 2: 运行构建**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "chore: fix type errors and ensure build passes"
```

---

## Task 11: 更新文档

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: 所有新增功能
- Produces: 更新后的文档

- [ ] **Step 1: 更新 CLAUDE.md 目录索引**

```markdown
## 目录索引

```
electron-vite-learn/
├── src/
│   ├── main/
│   │   ├── frame/
│   │   │   ├── SearchBoxFrame.ts          # 搜索框窗口
│   │   │   ├── MarkdownPreviewFrame.ts    # Markdown 预览窗口
│   │   │   └── ...
│   │   └── service/
│   │       └── searchService.ts           # 搜索服务
│   └── renderer/
│       └── src/
│           ├── views/
│           │   ├── SearchBox.vue          # 搜索框组件
│           │   ├── MarkdownPreview.vue    # Markdown 预览组件
│           │   └── tools/
│           │       └── Toolbox.vue        # 工具箱页面
│           └── utils/
│               └── pinyinSearch.ts        # 拼音搜索工具
```

- [ ] **Step 2: 添加模块说明**

```markdown
### 搜索框窗口 (src/main/frame/SearchBoxFrame.ts)
- **职责**: 全局搜索框，快捷键呼出，支持工具搜索、剪贴板搜索
- **功能**:
  - 屏幕居中显示，毛玻璃效果
  - 快捷键 `Ctrl+K` / `⌘K` 呼出/隐藏
  - 支持拼音首字母搜索
  - 搜索工具、剪贴板历史、应用、文件、网页
- **IPC 接口**:
  - `to-main-SearchBox:searchTools` - 搜索工具
  - `to-main-SearchBox:searchClipboard` - 搜索剪贴板
  - `to-main-SearchBox:executeTool` - 执行工具
  - `to-main-SearchBox:hide` - 隐藏搜索框

### Markdown 预览窗口 (src/main/frame/MarkdownPreviewFrame.ts)
- **职责**: 多标签页实时分屏预览 Markdown
- **功能**:
  - 左右分屏：编辑区 + 预览区
  - 多标签页支持
  - 拖入 .md 文件
  - 保存功能 (Ctrl+S)
- **IPC 接口**:
  - `to-main-MarkdownPreview:readFile` - 读取文件
  - `to-main-MarkdownPreview:saveFile` - 保存文件

### 搜索服务 (src/main/service/searchService.ts)
- **职责**: 统一管理工具、剪贴板、应用的搜索逻辑
- **功能**:
  - 搜索工具（支持拼音首字母）
  - 搜索剪贴板历史
  - 打开文件/网页
```

- [ ] **Step 3: 提交**

```bash
git add CLAUDE.md
git commit -m "docs: update documentation for search box and markdown preview"
```

---

## 完成

所有任务完成后，运行以下命令验证：

```bash
npm run typecheck
npm run build
```

如果一切正常，功能已实现完成。
