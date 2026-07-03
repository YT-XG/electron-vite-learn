<template>
  <!-- 外层：占满整个窗口（含透明边距），透明背景 -->
  <div class="md-window" @contextmenu.prevent>
    <!-- 内容区：居中，有背景色和圆角 -->
    <div class="md-content" :class="{ 'is-dark': isDark }" @drop.prevent="onDrop" @dragover.prevent>
      <!-- 标题栏 -->
      <div class="title-bar">
        <div class="title-bar-drag">
          <span class="title-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg></span>
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
            v-for="tab in tabs"
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
          <div class="editor-header">
            <span class="editor-label">编辑</span>
          </div>
          <textarea
            ref="textareaRef"
            v-model="currentContent"
            class="editor-textarea"
            placeholder="输入 Markdown 内容，或拖入 .md 文件..."
            @input="onInput"
            @keydown="onKeydown"
            @contextmenu.prevent="showContextMenu"
            spellcheck="false"
          ></textarea>
        </div>
        <div class="divider" @mousedown="startDrag">
          <div class="divider-handle"></div>
        </div>
        <div class="preview" :style="{ width: (100 - editorWidth) + '%' }">
          <div class="preview-header">
            <span class="preview-label">预览</span>
          </div>
          <div class="preview-content" v-html="renderedContent"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

// 初始化 markdown-it（启用 breaks 选项，单换行也转换为 <br>）
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
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
const textareaRef = ref<HTMLTextAreaElement>()

// 主题状态
const isDark = ref(true)

/**
 * 检测当前主题
 */
const checkTheme = () => {
  const theme = document.documentElement.getAttribute('data-theme')
  isDark.value = theme === 'dark'
}

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

/**
 * 在光标处插入文本，可选包裹选中文本
 */
const insertAtCursor = (before: string, after = '', defaultText = '') => {
  const textarea = textareaRef.value
  if (!textarea) return
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = currentContent.value.substring(start, end)
  const text = selected || defaultText
  const newText = currentContent.value.substring(0, start) + before + text + after + currentContent.value.substring(end)
  currentContent.value = newText
  // 设置光标位置：选中文本则选中插入的内容，否则放在 before 和 after 之间
  setTimeout(() => {
    if (selected) {
      textarea.selectionStart = start + before.length
      textarea.selectionEnd = start + before.length + text.length
    } else {
      textarea.selectionStart = textarea.selectionEnd = start + before.length
    }
    textarea.focus()
  }, 0)
}

/**
 * 在当前行前插入前缀
 */
const insertLinePrefix = (prefix: string) => {
  const textarea = textareaRef.value
  if (!textarea) return
  const start = textarea.selectionStart
  const content = currentContent.value
  // 找到当前行的开头
  const lineStart = content.lastIndexOf('\n', start - 1) + 1
  const newText = content.substring(0, lineStart) + prefix + content.substring(lineStart)
  currentContent.value = newText
  setTimeout(() => {
    textarea.selectionStart = textarea.selectionEnd = start + prefix.length
    textarea.focus()
  }, 0)
}

// 右键菜单项（定义 action 标识符，用于主进程菜单窗口回调）
const contextMenuItems: Array<{
  icon: string; label: string; shortcut?: string; separator?: boolean; action?: string
}> = [
  { icon: '', label: '标题 1', action: 'h1' },
  { icon: '', label: '标题 2', action: 'h2' },
  { icon: '', label: '标题 3', action: 'h3' },
  { icon: '', label: '', separator: true },
  { icon: 'B', label: '加粗', shortcut: 'Ctrl+B', action: 'bold' },
  { icon: 'I', label: '斜体', shortcut: 'Ctrl+I', action: 'italic' },
  { icon: 'S', label: '删除线', action: 'strikethrough' },
  { icon: '', label: '', separator: true },
  { icon: '⌨', label: '行内代码', action: 'code' },
  { icon: '{}', label: '代码块', action: 'codeblock' },
  { icon: '', label: '', separator: true },
  { icon: '❝', label: '引用', action: 'quote' },
  { icon: '—', label: '分割线', action: 'hr' },
  { icon: '•', label: '无序列表', action: 'ul' },
  { icon: '1.', label: '有序列表', action: 'ol' },
  { icon: '', label: '', separator: true },
  { icon: '⊞', label: '表格', action: 'table' },
  { icon: '🔗', label: '链接', action: 'link' },
  { icon: '🖼', label: '图片', action: 'image' },
]

/**
 * 执行右键菜单操作
 */
const executeMenuAction = (action: string) => {
  switch (action) {
    case 'h1': insertLinePrefix('# '); break
    case 'h2': insertLinePrefix('## '); break
    case 'h3': insertLinePrefix('### '); break
    case 'bold': insertAtCursor('**', '**', '粗体文字'); break
    case 'italic': insertAtCursor('*', '*', '斜体文字'); break
    case 'strikethrough': insertAtCursor('~~', '~~', '删除线文字'); break
    case 'code': insertAtCursor('`', '`', 'code'); break
    case 'codeblock': insertAtCursor('```\n', '\n```', ''); break
    case 'quote': insertLinePrefix('> '); break
    case 'hr': insertAtCursor('\n---\n', '', ''); break
    case 'ul': insertLinePrefix('- '); break
    case 'ol': insertLinePrefix('1. '); break
    case 'table': insertAtCursor('| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |', '', ''); break
    case 'link': insertAtCursor('[', '](url)', '链接文字'); break
    case 'image': insertAtCursor('![', '](url)', '图片描述'); break
  }
}

/**
 * 显示右键菜单（通过主进程窗口显示）
 */
const showContextMenu = (e: MouseEvent) => {
  // 将菜单项数据（不含 action 函数）发送到主进程
  const items = contextMenuItems.map(item => ({
    icon: item.icon,
    label: item.label,
    shortcut: item.shortcut,
    separator: item.separator,
    action: item.action
  }))
  window.electron.ipcRenderer.send('to-main-MarkdownPreview:showContextMenu', e.screenX, e.screenY, items)
}

// 监听内容变化
const onInput = () => {
  // 实时渲染通过 computed 自动处理
}

/**
 * 检测 ``` 回车自动补全
 * @returns true 表示已处理，阻止默认行为
 */
const handleFenceAutoComplete = (textarea: HTMLTextAreaElement, e: KeyboardEvent): boolean => {
  if (e.key !== 'Enter') return false

  const start = textarea.selectionStart
  const content = currentContent.value

  // 获取当前行
  const lineStart = content.lastIndexOf('\n', start - 1) + 1
  const currentLine = content.substring(lineStart, start)

  // 检测当前行是否是 ``` 开头（可选后面跟语言标识）
  const fenceMatch = currentLine.match(/^`{3,}/)
  if (!fenceMatch) return false

  const fence = fenceMatch[0]
  // 检查这行是否只有 ```（可能有空格）
  const trimmedLine = currentLine.trim()
  if (trimmedLine !== fence) return false

  // 检查光标前的 ``` 后面是否已经有内容（防止重复补全）
  const afterCursor = content.substring(start)
  // 如果下一行已经是 ```，说明已经补全过了
  const nextLineMatch = afterCursor.match(/^\n(`{3,})/)
  if (nextLineMatch) return false

  // 插入闭合 ```
  const insert = `\n${fence}\n`
  const newText = content.substring(0, start) + insert + content.substring(start)
  currentContent.value = newText

  // 光标放到两行 ``` 之间
  setTimeout(() => {
    textarea.selectionStart = textarea.selectionEnd = start + 1
    textarea.focus()
  }, 0)

  e.preventDefault()
  return true
}

// 键盘事件处理
const onKeydown = (e: KeyboardEvent) => {
  const textarea = e.target as HTMLTextAreaElement

  // Ctrl+S 保存
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    saveCurrentTab()
    return
  }

  // Ctrl+B 加粗
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault()
    insertAtCursor('**', '**', '粗体文字')
    return
  }

  // Ctrl+I 斜体
  if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
    e.preventDefault()
    insertAtCursor('*', '*', '斜体文字')
    return
  }

  // ``` 自动补全
  if (handleFenceAutoComplete(textarea, e)) return

  // Tab 缩进
  if (e.key === 'Tab') {
    e.preventDefault()
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
    // 已有文件路径，直接保存
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
  } else {
    // 新建标签，弹出文件选择对话框
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'to-main-MarkdownPreview:saveFileAs',
        tab.content,
        tab.name === '未命名' ? undefined : tab.name + '.md'
      )
      if (result.success) {
        // 更新标签的文件路径和名称
        tab.filePath = result.filePath
        // 从路径中提取文件名
        const fileName = result.filePath.split(/[/\\]/).pop() || '未命名.md'
        tab.name = fileName.replace(/\.md$/i, '')
        console.log('文件已保存到:', result.filePath)
      }
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
  // 初始化主题
  checkTheme()

  // 监听主题变化
  const observer = new MutationObserver(() => checkTheme())
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  // 监听右键菜单操作（从主进程菜单窗口广播）
  window.electron.ipcRenderer.on('broadcast:context-menu-action', (_event, action: string) => {
    executeMenuAction(action)
  })

  // 阻止默认拖拽行为（Electron 安全限制）
  document.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  document.addEventListener('drop', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  // 监听从剪贴板打开的新标签页
  window.electron.ipcRenderer.on('to-renderer-MarkdownPreview:newTab', (_event, content: string) => {
    console.log('[MarkdownPreview] Received newTab IPC, content length:', content.length)
    // 创建新标签页
    const newId = String(Date.now())
    tabs.value.push({
      id: newId,
      name: '剪贴板内容',
      content: content
    })
    activeTabId.value = newId
    console.log('[MarkdownPreview] New tab created, tabId:', newId)
  })

  // 通知主进程渲染进程已就绪
  window.electron.ipcRenderer.send('to-main-MarkdownPreview:ready')
})

onUnmounted(() => {
  // 清理 IPC 监听器，防止内存泄漏
  window.electron.ipcRenderer.removeAllListeners('broadcast:context-menu-action')
  window.electron.ipcRenderer.removeAllListeners('to-renderer-MarkdownPreview:newTab')
})
</script>

<style scoped>
/* ========================================
 * Markdown 预览窗口
 * 外层 .md-window 占满窗口（透明），内层 .md-content 居中显示内容
 * ======================================== */

.md-window {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}

.md-content {
  width: 100%;
  height: 100%;
  background: var(--bg-base);
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  box-shadow: 0 8px 40px -8px var(--shadow-lg);
}

/* ========== 标题栏 - 跟随主题 ========== */

.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  background: var(--bg-secondary);
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
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
  font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

.window-controls {
  display: flex;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.15s ease;
}

.control-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.close-btn:hover {
  background: rgba(248, 81, 73, 0.8);
  color: #fff;
}

/* ========== 标签页栏 - 跟随主题 ========== */

.tabs-bar {
  display: flex;
  align-items: center;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  padding: 0 8px;
  height: 34px;
}

.tabs {
  display: flex;
  flex: 1;
  overflow-x: auto;
  gap: 2px;
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 12px;
  border-radius: 6px;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.tab:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.tab.active {
  color: var(--text-primary);
  background: var(--bg-secondary);
  box-shadow: 0 0 0 1px var(--border) inset;
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
  color: var(--text-tertiary);
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: rgba(248, 81, 73, 0.6);
  color: #fff;
}

.add-tab-btn {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-tertiary);
  font-size: 16px;
  margin-left: 4px;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-tab-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

/* ========== 内容区 ========== */

.content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ========== 编辑器 - 跟随主题 ========== */

.editor {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: var(--bg-base);
}

.editor-header,
.preview-header {
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}

.editor-label,
.preview-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.editor-textarea {
  flex: 1;
  background: var(--bg-base);
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 13.5px;
  line-height: 1.7;
  padding: 16px;
  resize: none;
  tab-size: 2;
  caret-color: var(--accent);
}

.editor-textarea::placeholder {
  color: var(--text-tertiary);
}

.editor-textarea::selection {
  background: rgba(196, 96, 58, 0.2);
}

/* ========== 分隔线 ========== */

.divider {
  width: 3px;
  background: var(--border);
  cursor: col-resize;
  transition: background 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.divider::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  right: -4px;
}

.divider:hover {
  background: var(--accent);
}

.divider-handle {
  width: 3px;
  height: 24px;
  background: var(--text-tertiary);
  border-radius: 2px;
  transition: background 0.15s ease;
}

.divider:hover .divider-handle {
  background: var(--accent);
}

/* ========== 预览区 ========== */

.preview {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-base);
}

.preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  color: var(--text-primary);
  font-size: 14.5px;
  line-height: 1.7;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.preview-content::-webkit-scrollbar {
  width: 6px;
}

.preview-content::-webkit-scrollbar-track {
  background: transparent;
}

.preview-content::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.preview-content::-webkit-scrollbar-thumb:hover {
  background: var(--border-hover);
}

/* ========== Markdown 样式 - 跟随主题 ========== */

.preview-content :deep(h1) {
  font-size: 1.75em;
  font-weight: 700;
  margin: 0 0 16px 0;
  padding-bottom: 10px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border);
  letter-spacing: -0.02em;
  line-height: 1.3;
}

.preview-content :deep(h2) {
  font-size: 1.4em;
  font-weight: 600;
  margin: 28px 0 12px 0;
  padding-bottom: 8px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border);
  letter-spacing: -0.01em;
  line-height: 1.35;
}

.preview-content :deep(h3) {
  font-size: 1.15em;
  font-weight: 600;
  margin: 24px 0 8px 0;
  color: var(--text-primary);
  line-height: 1.4;
}

.preview-content :deep(h4),
.preview-content :deep(h5),
.preview-content :deep(h6) {
  font-weight: 600;
  margin: 20px 0 8px 0;
  color: var(--text-primary);
}

.preview-content :deep(p) {
  margin: 0 0 14px 0;
}

.preview-content :deep(strong) {
  color: var(--text-primary);
  font-weight: 600;
}

.preview-content :deep(code) {
  background: var(--bg-secondary);
  padding: 2px 6px;
  border-radius: 5px;
  font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
  font-size: 0.88em;
  color: var(--accent);
  border: 1px solid var(--border);
}

.preview-content :deep(pre) {
  background: var(--bg-secondary);
  padding: 16px;
  border-radius: 10px;
  overflow-x: auto;
  margin: 16px 0;
  border: 1px solid var(--border);
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.preview-content :deep(pre code) {
  background: transparent;
  padding: 0;
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.6;
}

.preview-content :deep(blockquote) {
  border-left: 3px solid var(--accent);
  margin: 16px 0;
  padding: 10px 16px;
  background: rgba(196, 96, 58, 0.06);
  border-radius: 0 8px 8px 0;
  color: var(--text-secondary);
}

.preview-content :deep(blockquote p) {
  margin: 0;
}

.preview-content :deep(ul),
.preview-content :deep(ol) {
  margin: 12px 0;
  padding-left: 2em;
}

.preview-content :deep(li) {
  margin: 4px 0;
  padding-left: 4px;
}

.preview-content :deep(li::marker) {
  color: var(--text-tertiary);
}

.preview-content :deep(a) {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: all 0.15s ease;
}

.preview-content :deep(a:hover) {
  border-bottom-color: var(--accent);
}

.preview-content :deep(hr) {
  border: none;
  height: 1px;
  background: var(--border);
  margin: 24px 0;
}

.preview-content :deep(img) {
  max-width: 100%;
  border-radius: 10px;
  border: 1px solid var(--border);
  margin: 8px 0;
}

.preview-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 16px 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
}

.preview-content :deep(th),
.preview-content :deep(td) {
  border: 1px solid var(--border);
  padding: 10px 14px;
  text-align: left;
}

.preview-content :deep(th) {
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-weight: 600;
  font-size: 13px;
}

.preview-content :deep(td) {
  font-size: 13.5px;
  color: var(--text-primary);
}

.preview-content :deep(tr:hover td) {
  background: var(--bg-secondary);
}

/* ========== highlight.js 代码块 - 跟随主题 ========== */

.preview-content :deep(.hljs) {
  background: transparent;
  padding: 0;
  color: var(--text-primary);
}

.preview-content :deep(.hljs-keyword),
.preview-content :deep(.hljs-selector-tag) {
  color: #d73a49;
}

.preview-content :deep(.hljs-string),
.preview-content :deep(.hljs-attr) {
  color: #032f62;
}

.preview-content :deep(.hljs-number),
.preview-content :deep(.hljs-literal) {
  color: #005cc5;
}

.preview-content :deep(.hljs-comment) {
  color: var(--text-tertiary);
  font-style: italic;
}

.preview-content :deep(.hljs-function),
.preview-content :deep(.hljs-title) {
  color: #6f42c1;
}

.preview-content :deep(.hljs-built_in) {
  color: #e36209;
}

.preview-content :deep(.hljs-type),
.preview-content :deep(.hljs-class) {
  color: #e36209;
}

.preview-content :deep(.hljs-variable) {
  color: var(--text-primary);
}

/* 暗色主题下代码高亮使用亮色 */
.is-dark .preview-content :deep(.hljs-keyword),
.is-dark .preview-content :deep(.hljs-selector-tag) {
  color: #ff7b72;
}

.is-dark .preview-content :deep(.hljs-string),
.is-dark .preview-content :deep(.hljs-attr) {
  color: #a5d6ff;
}

.is-dark .preview-content :deep(.hljs-number),
.is-dark .preview-content :deep(.hljs-literal) {
  color: #79c0ff;
}

.is-dark .preview-content :deep(.hljs-comment) {
  color: rgba(255, 255, 255, 0.3);
}

.is-dark .preview-content :deep(.hljs-function),
.is-dark .preview-content :deep(.hljs-title) {
  color: #d2a8ff;
}

.is-dark .preview-content :deep(.hljs-built_in),
.is-dark .preview-content :deep(.hljs-type),
.is-dark .preview-content :deep(.hljs-class) {
  color: #ffa657;
}

.is-dark .preview-content :deep(.hljs-variable) {
  color: #c9d1d9;
}
</style>
