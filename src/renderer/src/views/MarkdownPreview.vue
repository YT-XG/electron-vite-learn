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
import { ref, computed, onMounted } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

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
  // 阻止默认拖拽行为（Electron 安全限制）
  document.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  document.addEventListener('drop', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
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
