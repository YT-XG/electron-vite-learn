<template>
  <div class="settings-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2 class="page-title">设置</h2>
      <p class="page-desc">自定义应用行为和快捷键</p>
    </div>

    <!-- 外观设置 -->
    <div class="setting-card">
      <div class="setting-info">
        <span class="setting-label">外观设置</span>
        <span class="setting-hint">切换应用的浅色/深色主题模式</span>
      </div>

      <div class="theme-switcher">
        <button
          class="theme-btn"
          :class="{ active: currentTheme === 'light' }"
          @click="setTheme('light')"
        >
          ☀️ 浅色
        </button>
        <button
          class="theme-btn"
          :class="{ active: currentTheme === 'dark' }"
          @click="setTheme('dark')"
        >
          🌙 深色
        </button>
      </div>
    </div>

    <!-- 全局快捷键 -->
    <div class="setting-card">
      <div class="setting-info">
        <span class="setting-label">全局快捷键</span>
        <span class="setting-hint">按下快捷键可显示/隐藏主页面</span>
      </div>

      <div class="shortcut-row">
        <!-- 空闲状态：展示当前快捷键 -->
        <div v-if="state === 'idle'" class="shortcut-keys" @click="startRecording" tabindex="0" role="button">
          <kbd v-for="key in displayParts" :key="key" class="keycap">{{ key }}</kbd>
          <span class="change-hint">点击修改</span>
        </div>

        <!-- 录制状态：捕获按键 -->
        <div v-else class="shortcut-recorder" @keydown.prevent="onKeydown" tabindex="0" ref="recorderRef">
          <template v-if="capturedKeys.length === 0">
            <span class="recording-pulse">●</span>
            <span class="recording-text">按下快捷键...</span>
          </template>
          <template v-else>
            <kbd v-for="key in capturedDisplayKeys" :key="key" class="keycap active">{{ key }}</kbd>
          </template>
        </div>

        <!-- 操作按钮 -->
        <div class="shortcut-actions">
          <button v-if="state === 'idle'" class="btn btn-outline" @click="startRecording">
            ✏️ 录制
          </button>
          <template v-if="state === 'recording'">
            <button class="btn btn-primary" :disabled="!isValidCombo" @click="saveShortcut">
              ✅ 保存
            </button>
            <button class="btn btn-ghost" @click="cancelRecording">
              ✕ 取消
            </button>
          </template>
        </div>
      </div>

      <!-- 保存成功反馈 -->
      <Transition name="fade">
        <p v-if="showSavedTip" class="save-tip">✅ 快捷键已更新，立即生效</p>
      </Transition>
    </div>

    <!-- 局域网更新服务器 -->
    <div class="setting-card">
      <div class="setting-info">
        <span class="setting-label">更新服务器</span>
        <span class="setting-hint">选择或输入服务器 IP，检查更新时会从该地址读取 latest.yml</span>
      </div>

      <div class="server-url-row">
        <select v-model="selectedIp" class="server-url-select" @change="onSelectChange">
          <option v-for="opt in ipOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          <option value="__custom">自定义...</option>
        </select>

        <input
          v-if="selectedIp === '__custom'"
          v-model="customIp"
          type="text"
          class="server-url-input"
          placeholder="输入 IP 地址，如 192.168.1.100"
          spellcheck="false"
          @input="onCustomIpInput"
        />

        <button class="btn btn-primary" @click="saveServerUrl" :disabled="!isDirty">
          ✅ 保存
        </button>
      </div>

      <p class="server-preview">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
        {{ fullServerUrl || '未选择服务器' }}
      </p>

      <Transition name="fade">
        <p v-if="showServerUrlTip" class="save-tip">✅ 更新服务器地址已保存</p>
      </Transition>
    </div>

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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

/** 当前主题 */
const currentTheme = ref<'light' | 'dark'>(
  (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
)

/**
 * 设置主题
 * @param theme - 主题名称
 */
const setTheme = (theme: 'light' | 'dark') => {
  currentTheme.value = theme
  localStorage.setItem('theme', theme)
  document.documentElement.setAttribute('data-theme', theme)
}

/** 录制状态 */
type State = 'idle' | 'recording'

const state = ref<State>('idle')
const currentShortcut = ref('')
const capturedKeys = ref<string[]>([])
const showSavedTip = ref(false)

/** 更新服务器配置 */
const ipOptions = [
  { label: '10.15.8.28', value: '10.15.8.28' },
  { label: '10.15.66.216', value: '10.15.66.216' }
]
const selectedIp = ref('')
const customIp = ref('')
const showServerUrlTip = ref(false)
const serverUrlOrig = ref('')

/** 翻译 API 配置 */
const translateApiUrl = ref('')
const translateApiKey = ref('')
const showTranslateApiTip = ref(false)
const translateApiOrig = ref({ apiUrl: '', apiKey: '' })

/** 从完整 UNC 路径提取 IP（\\10.15.8.28\dist → 10.15.8.28） */
function extractIpFromUrl(url: string): string {
  const match = url.match(/^\\\\([^\\]+)/)
  if (!match) return ''
  const ip = match[1]
  // 判断是否在预设列表中
  if (ipOptions.some((o) => o.value === ip)) return ip
  return '__custom'
}

/** 拼接完整 UNC 路径 */
const fullServerUrl = computed(() => {
  const ip = selectedIp.value === '__custom' ? customIp.value.trim() : selectedIp.value
  return ip ? `\\\\${ip}\\dist` : ''
})

/** 是否有改动（启用保存按钮） */
const isDirty = computed(() => {
  return fullServerUrl.value !== '' && fullServerUrl.value !== serverUrlOrig.value
})

/** 翻译 API 配置是否有改动 */
const isTranslateApiDirty = computed(() => {
  return translateApiUrl.value !== translateApiOrig.value.apiUrl ||
         translateApiKey.value !== translateApiOrig.value.apiKey
})

/** 下拉框切换 */
function onSelectChange(): void {
  if (selectedIp.value !== '__custom') {
    customIp.value = ''
  }
}

/** 自定义 IP 输入 */
function onCustomIpInput(): void {
  // 确保下拉框处于自定义模式
  if (selectedIp.value !== '__custom') {
    selectedIp.value = '__custom'
  }
}

/** 当前快捷键的显示分段 */
const displayParts = computed(() => formatAccelerator(currentShortcut.value))

/** 录制中的按键显示分段 */
const capturedDisplayKeys = computed(() => capturedKeys.value)

/** 是否有有效的快捷键组合（至少一个修饰键 + 一个普通键） */
const isValidCombo = computed(() => {
  const mods = ['CommandOrControl', 'Alt', 'Shift'].filter((m) =>
    capturedKeys.value.includes(m)
  )
  return mods.length >= 1 && capturedKeys.value.length > mods.length
})

const recorderRef = ref<HTMLDivElement | null>(null)

// ═══════════════════════════════════════════════════════════════
//  快捷键录制
// ═══════════════════════════════════════════════════════════════

/**
 * 开始录制快捷键
 */
function startRecording(): void {
  state.value = 'recording'
  capturedKeys.value = []
  nextTick(() => {
    recorderRef.value?.focus()
    document.addEventListener('keydown', onKeydown)
  })
}

/**
 * 处理按键事件
 * 将 event.code 映射为 Electron accelerator 格式
 */
function onKeydown(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()

  // Esc → 取消
  if (event.key === 'Escape') {
    cancelRecording()
    return
  }

  // 收集修饰键
  const mods: string[] = []
  if (event.ctrlKey || event.metaKey) mods.push('CommandOrControl')
  if (event.altKey) mods.push('Alt')
  if (event.shiftKey) mods.push('Shift')

  // 如果只有修饰键，等待用户按下普通键
  const key = event.key
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    return
  }

  // 将普通键映射为 Electron accelerator 名称
  const mappedKey = mapKey(event)

  capturedKeys.value = [...mods, mappedKey]
  state.value = 'recording'
}

/**
 * 映射 KeyboardEvent 到 Electron accelerator 键名
 */
function mapKey(event: KeyboardEvent): string {
  const { code, key } = event

  // 字母键：KeyV → V
  if (code.startsWith('Key')) return code.slice(3)
  // 数字键：Digit5 → 5
  if (code.startsWith('Digit')) return code.slice(5)
  // 功能键 F1-F24
  if (code.startsWith('F') && code.length <= 3 && /^F\d+$/.test(code)) return code
  // 符号键
  if (code === 'Space') return 'Space'
  if (code === 'Comma') return ','
  if (code === 'Period') return '.'
  if (code === 'Minus') return '-'
  if (code === 'Equal') return '='
  if (code === 'Semicolon') return ';'
  if (code === 'Quote') return "'"
  if (code === 'Backslash') return '\\'
  if (code === 'BracketLeft') return '['
  if (code === 'BracketRight') return ']'
  if (code === 'Backquote') return '`'
  if (code === 'Slash') return '/'
  if (code === 'IntlBackslash') return '\\'

  // 功能方向键
  const namedKeys: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Return',
    Escape: 'Escape',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Tab: 'Tab',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    CapsLock: 'CapsLock',
    NumLock: 'NumLock',
    ScrollLock: 'ScrollLock',
    Insert: 'Insert',
    Pause: 'Pause',
    PrintScreen: 'PrintScreen'
  }

  return namedKeys[key] || key.toUpperCase()
}

/**
 * 保存快捷键
 */
async function saveShortcut(): Promise<void> {
  const accelerator = capturedKeys.value.join('+')
  await window.electron.ipcRenderer.invoke('to-service-SettingsService:update', { shortcut: accelerator })
  currentShortcut.value = accelerator
  state.value = 'idle'
  document.removeEventListener('keydown', onKeydown)

  // 显示成功提示
  showSavedTip.value = true
  setTimeout(() => {
    showSavedTip.value = false
  }, 3000)
}

/**
 * 取消录制
 */
function cancelRecording(): void {
  state.value = 'idle'
  capturedKeys.value = []
  document.removeEventListener('keydown', onKeydown)
}

/**
 * 保存更新服务器地址
 */
async function saveServerUrl(): Promise<void> {
  const url = fullServerUrl.value
  await window.electron.ipcRenderer.invoke('to-service-SettingsService:update', { serverUrl: url })
  serverUrlOrig.value = url
  showServerUrlTip.value = true
  setTimeout(() => {
    showServerUrlTip.value = false
  }, 3000)
}

/**
 * 保存翻译 API 配置
 */
async function saveTranslateApi(): Promise<void> {
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

// ═══════════════════════════════════════════════════════════════
//  格式化
// ═══════════════════════════════════════════════════════════════

/**
 * 将 Electron accelerator 拆分为可读的键名片段
 * CommandOrControl+Alt+V → ['Ctrl', 'Alt', 'V'] (Win)
 *                         → ['Cmd', 'Alt', 'V']  (Mac)
 */
function formatAccelerator(accel: string): string[] {
  const isMac = navigator.platform.includes('Mac')
  const displayMap: Record<string, string> = {
    CommandOrControl: isMac ? '⌘ Cmd' : '⊞ Ctrl',
    CmdOrCtrl: isMac ? '⌘ Cmd' : '⊞ Ctrl',
    Control: '⊞ Ctrl',
    Command: '⌘ Cmd',
    Cmd: '⌘ Cmd',
    Alt: 'Alt',
    Shift: '⇧ Shift',
    Super: '⊞ Win',
    Meta: '⊞ Win'
  }
  return accel.split('+').map((part) => displayMap[part] || part)
}

// ═══════════════════════════════════════════════════════════════
//  生命周期
// ═══════════════════════════════════════════════════════════════

onMounted(async () => {
  // 初始化主题
  document.documentElement.setAttribute('data-theme', currentTheme.value)

  const settings = await window.electron.ipcRenderer.invoke('to-service-SettingsService:get')
  currentShortcut.value = settings.shortcut
  // 初始化更新服务器：从 UNC 路径反解 IP
  const ip = extractIpFromUrl(settings.serverUrl)
  selectedIp.value = ip || '10.15.8.28'
  if (ip === '__custom') {
    customIp.value = settings.serverUrl.match(/^\\\\([^\\]+)/)?.[1] || ''
  }
  serverUrlOrig.value = settings.serverUrl
  // 初始化翻译 API 配置
  translateApiUrl.value = settings.translateApiUrl || ''
  translateApiKey.value = settings.translateApiKey || ''
  translateApiOrig.value = {
    apiUrl: settings.translateApiUrl || '',
    apiKey: settings.translateApiKey || ''
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.settings-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px;
  overflow-y: auto;
  box-sizing: border-box;
}

/* 自定义滚动条 */
.settings-page::-webkit-scrollbar {
  width: 6px;
}

.settings-page::-webkit-scrollbar-track {
  background: transparent;
}

.settings-page::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.settings-page::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

/* ========== 页面标题 ========== */
.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.page-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 4px 0 0;
}

/* ========== 设置卡片 ========== */
.setting-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 16px;
}

.setting-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.setting-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ========== 快捷键行 ========== */
.shortcut-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* 快捷键按键展示 */
.shortcut-keys {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color-hover);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 36px;
  box-sizing: border-box;
}

.shortcut-keys:hover {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 3px rgba(61, 139, 255, 0.08);
}

.change-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-left: 4px;
}

/* 录制状态容器 */
.shortcut-recorder {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-primary);
  border: 2px solid var(--accent-blue);
  border-radius: 8px;
  min-height: 36px;
  box-sizing: border-box;
  outline: none;
  box-shadow: 0 0 0 3px rgba(61, 139, 255, 0.12);
  animation: recorder-pulse 1.5s ease-in-out infinite;
}

@keyframes recorder-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(61, 139, 255, 0.12); }
  50% { box-shadow: 0 0 0 6px rgba(61, 139, 255, 0.08); }
}

.recording-pulse {
  font-size: 10px;
  color: var(--accent-blue);
  animation: dot-pulse 1s ease-in-out infinite;
}

@keyframes dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.recording-text {
  font-size: 13px;
  color: var(--text-secondary);
}

/* ========== 键帽样式 ========== */
.keycap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 26px;
  padding: 0 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color-hover);
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: inherit;
  box-shadow: 0 1px 0 var(--text-tertiary);
}

.keycap.active {
  background: var(--accent-blue);
  border-color: var(--accent-blue);
  color: #fff;
  box-shadow: 0 1px 0 #2563eb;
}

/* ========== 按钮 ========== */
.shortcut-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.btn {
  height: 38px;
  padding: 0 16px;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s ease;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.btn-primary {
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-pink));
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-outline {
  background: var(--bg-primary);
  border: 1px solid var(--border-color-hover);
  color: var(--text-secondary);
}

.btn-outline:hover {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
}

.btn-ghost:hover {
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

/* ========== 更新服务器 ========== */
.server-url-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.server-url-select {
  width: 180px;
  height: 38px;
  padding: 0 32px 0 14px;
  border: 1px solid var(--border-color-hover);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  background: var(--bg-primary) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 10px center;
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px var(--shadow-color);
}

.server-url-select:hover {
  border-color: var(--border-color-hover);
  box-shadow: 0 2px 4px var(--shadow-color);
}

.server-url-select:focus {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 3px rgba(61, 139, 255, 0.1);
}

.server-url-input {
  flex: 1;
  height: 38px;
  padding: 0 14px;
  border: 1px solid var(--border-color-hover);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  background: var(--bg-primary);
  outline: none;
  transition: all 0.2s ease;
  font-family: 'Consolas', 'Monaco', monospace;
  box-shadow: 0 1px 2px var(--shadow-color);
}

.server-url-input:hover {
  border-color: var(--border-color-hover);
  box-shadow: 0 2px 4px var(--shadow-color);
}

.server-url-input:focus {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 3px rgba(61, 139, 255, 0.1);
}

.server-preview {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  margin: 10px 0 0;
  padding: 6px 10px;
  background: var(--bg-secondary);
  border-radius: 6px;
  font-family: 'Consolas', 'Monaco', monospace;
}

/* ========== 保存成功提示 ========== */
.save-tip {
  font-size: 12px;
  color: #16a34a;
  margin: 12px 0 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ========== 翻译 API 配置 ========== */
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
  color: var(--text-secondary);
}

.form-input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-color-hover);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  background: var(--bg-primary);
  outline: none;
  transition: all 0.2s ease;
  font-family: 'Consolas', 'Monaco', monospace;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 3px rgba(61, 139, 255, 0.1);
}

/* ========== 主题切换器 ========== */
.theme-switcher {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.theme-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.theme-btn:hover {
  color: var(--text-primary);
}

.theme-btn.active {
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-pink));
  color: #fff;
  box-shadow: 0 2px 8px rgba(61, 139, 255, 0.3);
}
</style>
