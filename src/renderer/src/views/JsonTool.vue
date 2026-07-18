<template>
  <div
    class="json-tool"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
    :class="{ 'drag-over': isDragOver }"
  >
    <!-- 顶部渐变色条 -->
    <div class="gradient-bar"></div>

    <!-- 自定义标题栏 -->
    <div class="title-bar">
      <div class="title-bar-drag">
        <span class="app-name">JSON 工具</span>
      </div>
      <div class="window-controls">
        <button class="control-btn minimize-btn" @click="minimize" title="最小化">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
        <button class="control-btn maximize-btn" @click="toggleMaximize" title="最大化">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5" fill="none" />
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

    <!-- 工具栏 -->
    <div class="toolbar">
      <button class="tool-btn" @click="openFile" title="打开文件 (Ctrl+O)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        打开
      </button>
      <button class="tool-btn" @click="saveFile" title="保存文件 (Ctrl+S)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        保存
      </button>
      <div class="toolbar-separator"></div>
      <button class="tool-btn" @click="formatJson" title="格式化 (Ctrl+F)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="21" y1="10" x2="3" y2="10"/>
          <line x1="21" y1="6" x2="3" y2="6"/>
          <line x1="21" y1="14" x2="3" y2="14"/>
          <line x1="21" y1="18" x2="3" y2="18"/>
        </svg>
        格式化
      </button>
      <button class="tool-btn" @click="compressJson" title="压缩 (Ctrl+M)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 14 10 14 10 20"/>
          <polyline points="20 10 14 10 14 4"/>
          <line x1="14" y1="10" x2="21" y2="3"/>
          <line x1="3" y1="21" x2="10" y2="14"/>
        </svg>
        压缩
      </button>
      <div class="toolbar-separator"></div>
      <button class="tool-btn" @click="escapeJson" title="转义 (Ctrl+E)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
        转义
      </button>
      <button class="tool-btn" @click="unescapeJson" title="反转义 (Ctrl+U)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="8 6 2 12 8 18"/>
          <polyline points="16 18 22 12 16 6"/>
        </svg>
        反转义
      </button>
      <button class="tool-btn" @click="validateJson" title="校验 (Ctrl+V)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        校验
      </button>
      <div class="toolbar-separator"></div>
      <button class="tool-btn" @click="copyResult" title="复制结果 (Ctrl+Shift+C)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        复制
      </button>
    </div>

    <!-- 编辑区：左半边文本 + 右半边树形 -->
    <div class="editor-area">
      <div class="editor-half">
        <div class="panel-header">文本编辑</div>
        <textarea
          ref="editorTextareaRef"
          v-model="inputText"
          class="editor-input"
          placeholder="在此粘贴或输入 JSON 内容...（支持拖拽文件导入）"
          spellcheck="false"
        ></textarea>
      </div>
      <div class="editor-divider"></div>
      <div class="tree-half">
        <div class="panel-header">结构视图</div>
        <JsonTreeView
          v-if="parsedJson !== null"
          :json-data="parsedJson"
          @node-click="onTreeNodeClick"
          @value-change="onTreeValueChange"
        />
        <div v-else class="tree-error">
          <EmptyState icon="tool" text="JSON 格式错误" hint="请在左侧输入有效的 JSON" />
        </div>
      </div>
    </div>

    <!-- 拖拽遮罩层 -->
    <div v-if="isDragOver" class="drag-overlay">
      <div class="drag-overlay-content">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          <line x1="12" y1="11" x2="12" y2="17"/>
          <polyline points="9 14 12 11 15 14"/>
        </svg>
        <span>释放文件以导入</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import JsonTreeView from './tools/JsonTreeView.vue'
import EmptyState from '../components/EmptyState.vue'

const inputText = ref('')
const isDragOver = ref(false)

/** 解析后的 JSON 对象（用于树形视图，防抖更新） */
const parsedJson = ref<unknown | null>(null)

/** 防抖定时器 */
let parseTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 尝试解析 JSON 并更新树形视图（防抖 500ms）
 */
const tryParseJson = (): void => {
  if (parseTimer) clearTimeout(parseTimer)
  parseTimer = setTimeout(() => {
    try {
      parsedJson.value = JSON.parse(inputText.value)
    } catch {
      parsedJson.value = null
    }
  }, 500)
}

// 监听文本变化，自动解析 JSON 更新树形视图
watch(inputText, () => {
  tryParseJson()
})

/** textarea 元素引用 */
const editorTextareaRef = ref<HTMLTextAreaElement | null>(null)

/**
 * 树形视图节点点击事件处理
 * 找到节点在文本编辑器中的对应位置并跳转
 */
const onTreeNodeClick = (path: string, displayKey: string, depth: number): void => {
  const ta = editorTextareaRef.value
  if (!ta || !displayKey || displayKey === 'root') return

  const indent = depth * 2
  const prefix = ' '.repeat(indent)
  const text = ta.value

  // 查找所有该键名在该缩进级别的出现位置
  const keyRegex = new RegExp(`^${prefix}"${escapeRegex(displayKey)}":`, 'gm')
  const rawMatches = [...text.matchAll(keyRegex)]

  if (rawMatches.length === 0) return

  let targetMatch = rawMatches[0]

  if (rawMatches.length > 1) {
    // 多个匹配（如数组元素的同名字段），使用 path 中的数组索引定位
    const pathParts = path.split('.')
    // 提取 path 中第一个数字作为数组索引
    let arrayIndex = -1
    for (const part of pathParts) {
      if (/^\d+$/.test(part)) {
        arrayIndex = parseInt(part, 10)
        break
      }
    }

    if (arrayIndex >= 0) {
      // 通过统计父级缩进处的 { 数量来确定每个匹配所属的元素序号
      const parentIndent = ' '.repeat((depth - 1) * 2)
      const braceRegex = new RegExp(`^${parentIndent}\\{`, 'gm')

      let found = false
      for (const m of rawMatches) {
        const beforeText = text.substring(0, m.index!)
        const bracesBefore = [...beforeText.matchAll(braceRegex)].length
        // 第一个 { 对应索引 0，第二个对应索引 1 ...
        if (bracesBefore - 1 === arrayIndex) {
          targetMatch = m
          found = true
          break
        }
      }
      if (!found) {
        targetMatch = rawMatches[0]
      }
    } else {
      targetMatch = rawMatches[0]
    }
  }

  const match = targetMatch
  // 计算选中区域的起始位置（行首）
  const lineStart = text.lastIndexOf('\n', match.index!) + 1
  const lineNum = text.substring(0, match.index!).split('\n').length

  // 跳转并选中
  ta.focus()
  ta.selectionStart = lineStart
  ta.selectionEnd = match.index! + match[0].length
  // 滚动到该行附近
  const totalLines = text.split('\n').length
  ta.scrollTop = Math.max(0, ((lineNum - 3) / totalLines) * ta.scrollHeight)
}

/**
 * 树形视图值变更事件处理
 * 根据 path 修改 parsedJson 中对应位置的值，然后序列化回文本编辑器
 */
const onTreeValueChange = (path: string, newValue: string, valueType: 'string' | 'number' | 'boolean' | 'null'): void => {
  if (!parsedJson.value) return

  // 复制一份原始数据
  const data = JSON.parse(JSON.stringify(parsedJson.value))

  // 解析路径，如 $.users.0.name → ['users', '0', 'name']
  const parts = path.split('.').slice(1) // 去掉开头的 $

  // 遍历到目标节点的父节点
  let current: unknown = data
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    if (Array.isArray(current)) {
      current = current[parseInt(key, 10)]
    } else if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[key]
    }
  }

  // 最后一个 key 是目标键名
  const lastKey = parts[parts.length - 1]

  // 按类型转换新值
  let typedValue: unknown = newValue
  if (valueType === 'number') {
    typedValue = Number(newValue)
  } else if (valueType === 'boolean') {
    typedValue = newValue === 'true'
  } else if (valueType === 'null') {
    typedValue = null
  }

  // 修改值
  if (Array.isArray(current)) {
    current[parseInt(lastKey, 10)] = typedValue
  } else if (current && typeof current === 'object') {
    ;(current as Record<string, unknown>)[lastKey] = typedValue
  }

  // 更新 parsedJson 和文本编辑器
  parsedJson.value = data
  inputText.value = JSON.stringify(data, null, 2)
}

/**
 * 转义正则特殊字符
 */
const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 最小化窗口
 */
const minimize = (): void => {
  window.electron.ipcRenderer.send('to-main-JsonTool:minimize')
}

/**
 * 最大化/还原窗口
 */
const toggleMaximize = (): void => {
  window.electron.ipcRenderer.send('to-main-JsonTool:toggleMaximize')
}

/**
 * 关闭窗口
 */
const close = (): void => {
  window.electron.ipcRenderer.send('to-main-BaseFrame:closeWindow')
}

/**
 * 显示通知
 * @param text - 通知文本
 * @param duration - 显示时长（毫秒），默认 2000
 * @param type - 通知类型，默认 'default'
 */
const showNotice = (text: string, duration = 2000, type: 'default' | 'success' | 'error' | 'warning' = 'default'): void => {
  window.electron.ipcRenderer.send('to-main-JsonTool:showNotice', text, duration, type)
}

/**
 * 打开文件
 */
const openFile = async (): Promise<void> => {
  const content = await window.electron.ipcRenderer.invoke('to-main-JsonTool:openFile')
  if (content !== null) {
    inputText.value = content
    // 尝试格式化
    formatJson()
  }
}

/**
 * 保存文件
 */
const saveFile = async (): Promise<void> => {
  const content = inputText.value
  if (!content) {
    showNotice('没有内容可保存', 2000, 'warning')
    return
  }
  const saved = await window.electron.ipcRenderer.invoke('to-main-JsonTool:saveFile', content)
  if (saved) {
    showNotice('保存成功', 2000, 'success')
  }
}

/**
 * 格式化 JSON
 */
const formatJson = (): void => {
  try {
    const parsed = JSON.parse(inputText.value)
    inputText.value = JSON.stringify(parsed, null, 2)
    // 格式化后立即更新树形视图
    parsedJson.value = parsed
  } catch (e) {
    showNotice(`格式化失败: ${(e as Error).message}`, 3000, 'error')
  }
}

/**
 * 压缩 JSON
 */
const compressJson = (): void => {
  try {
    const parsed = JSON.parse(inputText.value)
    inputText.value = JSON.stringify(parsed)
    // 压缩后立即更新树形视图
    parsedJson.value = parsed
  } catch (e) {
    showNotice(`压缩失败: ${(e as Error).message}`, 3000, 'error')
  }
}

/**
 * 转义 JSON 字符串
 */
const escapeJson = (): void => {
  inputText.value = JSON.stringify(inputText.value)
}

/**
 * 反转义 JSON 字符串
 */
const unescapeJson = (): void => {
  try {
    inputText.value = JSON.parse(inputText.value)
  } catch (e) {
    showNotice(`反转义失败: ${(e as Error).message}`, 3000, 'error')
  }
}

/**
 * 校验 JSON
 */
const validateJson = (): void => {
  try {
    JSON.parse(inputText.value)
    showNotice('JSON 格式正确', 2000, 'success')
  } catch (e) {
    showNotice(`JSON 格式错误: ${(e as Error).message}`, 3000, 'error')
  }
}

/**
 * 复制结果到剪贴板
 */
const copyResult = async (): Promise<void> => {
  const text = inputText.value
  if (!text) {
    showNotice('没有内容可复制', 2000, 'warning')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    showNotice('已复制到剪贴板', 2000, 'success')
  } catch {
    // fallback: 使用主进程写入剪贴板
    window.electron.ipcRenderer.send('to-service-ClipboardService:writeText', text)
    showNotice('已复制到剪贴板', 2000, 'success')
  }
}

/**
 * 拖拽文件导入
 */
const readFileContent = (file: File): void => {
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    if (content !== null) {
      inputText.value = content
      formatJson()
    }
  }
  reader.readAsText(file)
}

/**
 * 拖拽进入
 */
const onDragOver = (e: DragEvent): void => {
  e.preventDefault()
  isDragOver.value = true
}

/**
 * 拖拽离开
 */
const onDragLeave = (e: DragEvent): void => {
  e.preventDefault()
  isDragOver.value = false
}

/**
 * 拖拽放下
 */
const onDrop = (e: DragEvent): void => {
  e.preventDefault()
  isDragOver.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    readFileContent(files[0])
  }
}

/**
 * 键盘快捷键处理
 */
const handleKeydown = (e: KeyboardEvent): void => {
  const isCtrl = e.ctrlKey || e.metaKey

  // Ctrl+F: 格式化
  if (isCtrl && e.key === 'f') {
    e.preventDefault()
    formatJson()
  }
  // Ctrl+M: 压缩
  else if (isCtrl && e.key === 'm') {
    e.preventDefault()
    compressJson()
  }
  // Ctrl+E: 转义
  else if (isCtrl && e.key === 'e') {
    e.preventDefault()
    escapeJson()
  }
  // Ctrl+U: 反转义
  else if (isCtrl && e.key === 'u') {
    e.preventDefault()
    unescapeJson()
  }
  // Ctrl+Shift+C: 复制结果
  else if (isCtrl && e.shiftKey && e.key === 'C') {
    e.preventDefault()
    copyResult()
  }
  // Ctrl+O: 打开文件
  else if (isCtrl && e.key === 'o') {
    e.preventDefault()
    openFile()
  }
  // Ctrl+S: 保存文件
  else if (isCtrl && e.key === 's') {
    e.preventDefault()
    saveFile()
  }
}

/**
 * 主进程发送内容的监听器
 */
const onSetContent = (_e: unknown, content: string): void => {
  inputText.value = content
  // 自动格式化
  formatJson()
}

// 挂载时注册键盘事件
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  // 通知主进程渲染已就绪
  window.electron.ipcRenderer.send('to-main-JsonTool:ready')
  // 监听主进程发送的内容（从通知窗口联动）
  window.electron.ipcRenderer.on('to-renderer-JsonTool:setContent', onSetContent)
})

// 卸载时移除键盘事件和 IPC 监听器
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  window.electron.ipcRenderer.removeListener('to-renderer-JsonTool:setContent', onSetContent)
})
</script>

<style scoped>
.json-tool {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-base);
  overflow: hidden;
  position: relative;
  border-radius: 12px;
  border: 1px solid var(--border);
}

/* 顶部渐变色条 */
.gradient-bar {
  height: 3px;
  background: linear-gradient(90deg, var(--accent), #ec4899);
  flex-shrink: 0;
}

/* 标题栏 */
.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 12px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.title-bar-drag {
  display: flex;
  align-items: center;
  gap: 8px;
}

.app-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.window-controls {
  display: flex;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.control-btn:hover {
  background: var(--accent-light);
  color: var(--text-primary);
}

.maximize-btn:hover {
  background: var(--success);
  color: white;
}

.close-btn:hover {
  background: var(--danger);
  color: white;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--btn-radius);
  font-size: var(--btn-font-size);
  font-weight: var(--btn-font-weight);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-btn:hover {
  background: var(--accent-light);
  border-color: var(--accent);
  color: var(--text-primary);
}

.tool-btn:active {
  transform: scale(0.97);
}

.toolbar-separator {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 4px;
}

/* 编辑区 - 水平分栏布局 */
.editor-area {
  flex: 1;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

/* 左半：文本编辑器 */
.editor-half {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

/* 面板标题 */
.panel-header {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 14px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  user-select: none;
}

.editor-half .editor-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  padding: 16px;
  resize: none;
  outline: none;
  tab-size: 2;
}

.editor-input::placeholder {
  color: var(--text-tertiary);
}

/* 分隔线 */
.editor-divider {
  width: 1px;
  background: var(--border);
  flex-shrink: 0;
}

/* 右半：树形视图 */
.tree-half {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.tree-error {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  min-height: 0;
}

/* 拖拽状态 */
.json-tool.drag-over {
  border: 2px dashed var(--accent);
}

.drag-overlay {
  position: absolute;
  inset: 0;
  background: var(--bg-glass);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.drag-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--accent);
  font-size: 16px;
  font-weight: 500;
}
</style>
