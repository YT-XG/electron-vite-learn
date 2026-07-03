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

    <!-- 编辑区 -->
    <div class="editor-area">
      <textarea
        v-model="inputText"
        class="editor-input"
        placeholder="在此粘贴或输入 JSON 内容...（支持拖拽文件导入）"
        spellcheck="false"
      ></textarea>
      <div class="editor-divider"></div>
      <div class="editor-output" :class="{ 'has-error': errorMsg, 'has-success': successMsg }">
        <pre v-if="errorMsg" class="error-msg">{{ errorMsg }}</pre>
        <pre v-else-if="successMsg" class="success-msg">{{ successMsg }}</pre>
        <pre v-else class="output-text">{{ outputText }}</pre>
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
import { ref, onMounted, onUnmounted } from 'vue'

const inputText = ref('')
const outputText = ref('')
const errorMsg = ref('')
const successMsg = ref('')
const isDragOver = ref(false)

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
  window.electron.ipcRenderer.send('to-main-JsonTool:close')
}

/**
 * 打开文件
 */
const openFile = async (): Promise<void> => {
  const content = await window.electron.ipcRenderer.invoke('to-main-JsonTool:openFile')
  if (content !== null) {
    inputText.value = content
    errorMsg.value = ''
    successMsg.value = ''
    // 尝试格式化
    formatJson()
  }
}

/**
 * 保存文件
 */
const saveFile = async (): Promise<void> => {
  const content = outputText.value || inputText.value
  if (!content) {
    errorMsg.value = '没有内容可保存'
    return
  }
  const saved = await window.electron.ipcRenderer.invoke('to-main-JsonTool:saveFile', content)
  if (saved) {
    successMsg.value = '保存成功'
    errorMsg.value = ''
    setTimeout(() => {
      successMsg.value = ''
    }, 2000)
  }
}

/**
 * 格式化 JSON
 */
const formatJson = (): void => {
  errorMsg.value = ''
  successMsg.value = ''
  try {
    const parsed = JSON.parse(inputText.value)
    outputText.value = JSON.stringify(parsed, null, 2)
  } catch (e) {
    errorMsg.value = `格式化失败: ${(e as Error).message}`
  }
}

/**
 * 压缩 JSON
 */
const compressJson = (): void => {
  errorMsg.value = ''
  successMsg.value = ''
  try {
    const parsed = JSON.parse(inputText.value)
    outputText.value = JSON.stringify(parsed)
  } catch (e) {
    errorMsg.value = `压缩失败: ${(e as Error).message}`
  }
}

/**
 * 转义 JSON 字符串
 */
const escapeJson = (): void => {
  errorMsg.value = ''
  successMsg.value = ''
  outputText.value = JSON.stringify(inputText.value)
}

/**
 * 反转义 JSON 字符串
 */
const unescapeJson = (): void => {
  errorMsg.value = ''
  successMsg.value = ''
  try {
    outputText.value = JSON.parse(inputText.value)
  } catch (e) {
    errorMsg.value = `反转义失败: ${(e as Error).message}`
  }
}

/**
 * 校验 JSON
 */
const validateJson = (): void => {
  errorMsg.value = ''
  successMsg.value = ''
  try {
    JSON.parse(inputText.value)
    successMsg.value = 'JSON 格式正确'
  } catch (e) {
    errorMsg.value = `JSON 格式错误: ${(e as Error).message}`
  }
}

/**
 * 复制结果到剪贴板
 */
const copyResult = async (): Promise<void> => {
  const text = outputText.value || inputText.value
  if (!text) {
    errorMsg.value = '没有内容可复制'
    setTimeout(() => {
      errorMsg.value = ''
    }, 2000)
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    successMsg.value = '已复制到剪贴板'
    errorMsg.value = ''
    setTimeout(() => {
      successMsg.value = ''
    }, 2000)
  } catch {
    // fallback: 使用主进程写入剪贴板
    window.electron.ipcRenderer.send('to-service-ClipboardService:writeText', text)
    successMsg.value = '已复制到剪贴板'
    errorMsg.value = ''
    setTimeout(() => {
      successMsg.value = ''
    }, 2000)
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
      errorMsg.value = ''
      successMsg.value = ''
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
  // Ctrl+V (with Shift): 复制结果（注意：Ctrl+V 是粘贴，需要 Shift 区分）
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

// 挂载时注册键盘事件
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

// 卸载时移除键盘事件
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
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

/* 编辑区 */
.editor-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.editor-input {
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

.editor-divider {
  width: 1px;
  background: var(--border);
}

.editor-output {
  flex: 1;
  padding: 16px;
  overflow: auto;
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.editor-output.has-error {
  background: var(--danger-bg);
}

.editor-output.has-success {
  background: var(--success-bg);
}

.output-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.error-msg {
  margin: 0;
  color: var(--danger);
  white-space: pre-wrap;
  word-break: break-all;
}

.success-msg {
  margin: 0;
  color: var(--success);
  white-space: pre-wrap;
  word-break: break-all;
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
