<template>
  <div class="json-tool">
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
      <button class="tool-btn" @click="openFile" title="打开文件">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        打开
      </button>
      <button class="tool-btn" @click="saveFile" title="保存文件">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        保存
      </button>
      <div class="toolbar-separator"></div>
      <button class="tool-btn" @click="formatJson" title="格式化">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="21" y1="10" x2="3" y2="10"/>
          <line x1="21" y1="6" x2="3" y2="6"/>
          <line x1="21" y1="14" x2="3" y2="14"/>
          <line x1="21" y1="18" x2="3" y2="18"/>
        </svg>
        格式化
      </button>
      <button class="tool-btn" @click="compressJson" title="压缩">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 14 10 14 10 20"/>
          <polyline points="20 10 14 10 14 4"/>
          <line x1="14" y1="10" x2="21" y2="3"/>
          <line x1="3" y1="21" x2="10" y2="14"/>
        </svg>
        压缩
      </button>
      <div class="toolbar-separator"></div>
      <button class="tool-btn" @click="escapeJson" title="转义">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
        转义
      </button>
      <button class="tool-btn" @click="unescapeJson" title="反转义">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="8 6 2 12 8 18"/>
          <polyline points="16 18 22 12 16 6"/>
        </svg>
        反转义
      </button>
      <button class="tool-btn" @click="validateJson" title="校验">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        校验
      </button>
    </div>

    <!-- 编辑区 -->
    <div class="editor-area">
      <textarea
        v-model="inputText"
        class="editor-input"
        placeholder="在此粘贴或输入 JSON 内容..."
        spellcheck="false"
      ></textarea>
      <div class="editor-divider"></div>
      <div class="editor-output" :class="{ 'has-error': errorMsg, 'has-success': successMsg }">
        <pre v-if="errorMsg" class="error-msg">{{ errorMsg }}</pre>
        <pre v-else-if="successMsg" class="success-msg">{{ successMsg }}</pre>
        <pre v-else class="output-text">{{ outputText }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const inputText = ref('')
const outputText = ref('')
const errorMsg = ref('')
const successMsg = ref('')

/**
 * 最小化窗口
 */
const minimize = (): void => {
  window.electron.ipcRenderer.send('to-main-MainPage:minimize')
}

/**
 * 关闭窗口
 */
const close = (): void => {
  window.electron.ipcRenderer.send('to-main-BaseFrame:closeWindow')
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
    successMsg.value = '格式化成功'
    setTimeout(() => {
      successMsg.value = ''
    }, 2000)
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
    successMsg.value = '压缩成功'
    setTimeout(() => {
      successMsg.value = ''
    }, 2000)
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
  successMsg.value = '转义成功'
  setTimeout(() => {
    successMsg.value = ''
  }, 2000)
}

/**
 * 反转义 JSON 字符串
 */
const unescapeJson = (): void => {
  errorMsg.value = ''
  successMsg.value = ''
  try {
    outputText.value = JSON.parse(inputText.value)
    successMsg.value = '反转义成功'
    setTimeout(() => {
      successMsg.value = ''
    }, 2000)
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
    setTimeout(() => {
      successMsg.value = ''
    }, 2000)
  } catch (e) {
    errorMsg.value = `JSON 格式错误: ${(e as Error).message}`
  }
}
</script>

<style scoped>
.json-tool {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0f172a;
  overflow: hidden;
}

/* 顶部渐变色条 */
.gradient-bar {
  height: 3px;
  background: linear-gradient(90deg, #3b82f6, #ec4899);
  flex-shrink: 0;
}

/* 标题栏 */
.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 12px;
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
  color: #e2e8f0;
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
  color: #94a3b8;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.8);
  color: white;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: #94a3b8;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-btn:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: #3b82f6;
  color: #e2e8f0;
}

.toolbar-separator {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.08);
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
  color: #e2e8f0;
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  padding: 16px;
  resize: none;
  outline: none;
  tab-size: 2;
}

.editor-input::placeholder {
  color: #475569;
}

.editor-divider {
  width: 1px;
  background: rgba(255, 255, 255, 0.06);
}

.editor-output {
  flex: 1;
  padding: 16px;
  overflow: auto;
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #94a3b8;
}

.editor-output.has-error {
  background: rgba(239, 68, 68, 0.05);
}

.editor-output.has-success {
  background: rgba(34, 197, 94, 0.05);
}

.output-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.error-msg {
  margin: 0;
  color: #ef4444;
  white-space: pre-wrap;
  word-break: break-all;
}

.success-msg {
  margin: 0;
  color: #22c55e;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
