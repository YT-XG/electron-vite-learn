<template>
  <div class="shortcuts-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2 class="page-title">快捷键</h2>
      <p class="page-desc">自定义应用全局快捷键，修改后立即生效</p>
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
          <button v-if="state === 'idle'" class="btn btn-secondary" @click="startRecording">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            录制
          </button>
          <template v-if="state === 'recording'">
            <button class="btn btn-primary" :disabled="!isValidCombo" @click="saveShortcut">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              保存
            </button>
            <button class="btn btn-ghost" @click="cancelRecording">
              取消
            </button>
          </template>
        </div>
      </div>

      <Transition name="fade">
        <p v-if="showSavedTip" class="save-tip">✅ 快捷键已更新，立即生效</p>
      </Transition>
    </div>

    <!-- 片段选择快捷键 -->
    <div class="setting-card">
      <div class="setting-info">
        <span class="setting-label">片段选择快捷键</span>
        <span class="setting-hint">按下快捷键可呼出/隐藏片段选择窗口</span>
      </div>

      <div class="shortcut-row">
        <div v-if="snippetState === 'idle'" class="shortcut-keys" @click="startSnippetRecording" tabindex="0" role="button">
          <kbd v-for="key in snippetDisplayParts" :key="key" class="keycap">{{ key }}</kbd>
          <span class="change-hint">点击修改</span>
        </div>

        <div v-else class="shortcut-recorder" @keydown.prevent="onSnippetKeydown" tabindex="0" ref="snippetRecorderRef">
          <template v-if="snippetCapturedKeys.length === 0">
            <span class="recording-pulse">●</span>
            <span class="recording-text">按下快捷键...</span>
          </template>
          <template v-else>
            <kbd v-for="key in snippetCapturedDisplayKeys" :key="key" class="keycap active">{{ key }}</kbd>
          </template>
        </div>

        <div class="shortcut-actions">
          <button v-if="snippetState === 'idle'" class="btn btn-secondary" @click="startSnippetRecording">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            录制
          </button>
          <template v-if="snippetState === 'recording'">
            <button class="btn btn-primary" :disabled="!snippetIsValidCombo" @click="saveSnippetShortcut">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              保存
            </button>
            <button class="btn btn-ghost" @click="cancelSnippetRecording">
              取消
            </button>
          </template>
        </div>
      </div>

      <Transition name="fade">
        <p v-if="showSnippetSavedTip" class="save-tip">✅ 快捷键已更新，立即生效</p>
      </Transition>
    </div>

    <!-- 搜索框快捷键 -->
    <div class="setting-card">
      <div class="setting-info">
        <span class="setting-label">搜索框快捷键</span>
        <span class="setting-hint">按下快捷键可呼出/隐藏全局搜索框</span>
      </div>

      <div class="shortcut-row">
        <div v-if="searchState === 'idle'" class="shortcut-keys" @click="startSearchRecording" tabindex="0" role="button">
          <kbd v-for="key in searchDisplayParts" :key="key" class="keycap">{{ key }}</kbd>
          <span class="change-hint">点击修改</span>
        </div>

        <div v-else class="shortcut-recorder" @keydown.prevent="onSearchKeydown" tabindex="0" ref="searchRecorderRef">
          <template v-if="searchCapturedKeys.length === 0">
            <span class="recording-pulse">●</span>
            <span class="recording-text">按下快捷键...</span>
          </template>
          <template v-else>
            <kbd v-for="key in searchCapturedDisplayKeys" :key="key" class="keycap active">{{ key }}</kbd>
          </template>
        </div>

        <div class="shortcut-actions">
          <button v-if="searchState === 'idle'" class="btn btn-secondary" @click="startSearchRecording">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            录制
          </button>
          <template v-if="searchState === 'recording'">
            <button class="btn btn-primary" :disabled="!searchIsValidCombo" @click="saveSearchShortcut">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              保存
            </button>
            <button class="btn btn-ghost" @click="cancelSearchRecording">
              取消
            </button>
          </template>
        </div>
      </div>

      <Transition name="fade">
        <p v-if="showSearchSavedTip" class="save-tip">✅ 快捷键已更新，立即生效</p>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

// ═══════════════════════════════════════════════════════════════
//  全局快捷键录制
// ═══════════════════════════════════════════════════════════════

type State = 'idle' | 'recording'

const state = ref<State>('idle')
const currentShortcut = ref('')
const capturedKeys = ref<string[]>([])
const showSavedTip = ref(false)
const recorderRef = ref<HTMLDivElement | null>(null)

const displayParts = computed(() => formatAccelerator(currentShortcut.value))
const capturedDisplayKeys = computed(() => capturedKeys.value)
const isValidCombo = computed(() => {
  const mods = ['CommandOrControl', 'Alt', 'Shift'].filter((m) =>
    capturedKeys.value.includes(m)
  )
  return mods.length >= 1 && capturedKeys.value.length > mods.length
})

function startRecording(): void {
  state.value = 'recording'
  capturedKeys.value = []
  nextTick(() => {
    recorderRef.value?.focus()
    document.addEventListener('keydown', onKeydown)
  })
}

function onKeydown(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()

  if (event.key === 'Escape') {
    cancelRecording()
    return
  }

  const mods: string[] = []
  if (event.ctrlKey || event.metaKey) mods.push('CommandOrControl')
  if (event.altKey) mods.push('Alt')
  if (event.shiftKey) mods.push('Shift')

  const key = event.key
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return

  const mappedKey = mapKey(event)
  capturedKeys.value = [...mods, mappedKey]
  state.value = 'recording'
}

async function saveShortcut(): Promise<void> {
  const accelerator = capturedKeys.value.join('+')
  await window.electron.ipcRenderer.invoke('to-service-SettingsService:update', { shortcut: accelerator })
  currentShortcut.value = accelerator
  state.value = 'idle'
  document.removeEventListener('keydown', onKeydown)

  showSavedTip.value = true
  setTimeout(() => {
    showSavedTip.value = false
  }, 3000)
}

function cancelRecording(): void {
  state.value = 'idle'
  capturedKeys.value = []
  document.removeEventListener('keydown', onKeydown)
}

// ═══════════════════════════════════════════════════════════════
//  片段选择快捷键录制
// ═══════════════════════════════════════════════════════════════

const snippetState = ref<State>('idle')
const currentSnippetShortcut = ref('')
const snippetCapturedKeys = ref<string[]>([])
const showSnippetSavedTip = ref(false)
const snippetRecorderRef = ref<HTMLDivElement | null>(null)

const snippetDisplayParts = computed(() => formatAccelerator(currentSnippetShortcut.value))
const snippetCapturedDisplayKeys = computed(() => snippetCapturedKeys.value)
const snippetIsValidCombo = computed(() => {
  const mods = ['CommandOrControl', 'Alt', 'Shift'].filter((m) =>
    snippetCapturedKeys.value.includes(m)
  )
  return mods.length >= 1 && snippetCapturedKeys.value.length > mods.length
})

function startSnippetRecording(): void {
  snippetState.value = 'recording'
  snippetCapturedKeys.value = []
  nextTick(() => {
    snippetRecorderRef.value?.focus()
    document.addEventListener('keydown', onSnippetKeydown)
  })
}

function onSnippetKeydown(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()

  if (event.key === 'Escape') {
    cancelSnippetRecording()
    return
  }

  const mods: string[] = []
  if (event.ctrlKey || event.metaKey) mods.push('CommandOrControl')
  if (event.altKey) mods.push('Alt')
  if (event.shiftKey) mods.push('Shift')

  const key = event.key
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return

  const mappedKey = mapKey(event)
  snippetCapturedKeys.value = [...mods, mappedKey]
  snippetState.value = 'recording'
}

async function saveSnippetShortcut(): Promise<void> {
  const accelerator = snippetCapturedKeys.value.join('+')
  await window.electron.ipcRenderer.invoke('to-service-SettingsService:update', {
    snippetShortcut: accelerator
  })
  currentSnippetShortcut.value = accelerator
  snippetState.value = 'idle'
  document.removeEventListener('keydown', onSnippetKeydown)

  showSnippetSavedTip.value = true
  setTimeout(() => {
    showSnippetSavedTip.value = false
  }, 3000)
}

function cancelSnippetRecording(): void {
  snippetState.value = 'idle'
  snippetCapturedKeys.value = []
  document.removeEventListener('keydown', onSnippetKeydown)
}

// ═══════════════════════════════════════════════════════════════
//  搜索框快捷键录制
// ═══════════════════════════════════════════════════════════════

const searchState = ref<State>('idle')
const currentSearchShortcut = ref('')
const searchCapturedKeys = ref<string[]>([])
const showSearchSavedTip = ref(false)
const searchRecorderRef = ref<HTMLDivElement | null>(null)

const searchDisplayParts = computed(() => formatAccelerator(currentSearchShortcut.value))
const searchCapturedDisplayKeys = computed(() => searchCapturedKeys.value)
const searchIsValidCombo = computed(() => {
  const mods = ['CommandOrControl', 'Alt', 'Shift'].filter((m) =>
    searchCapturedKeys.value.includes(m)
  )
  return mods.length >= 1 && searchCapturedKeys.value.length > mods.length
})

function startSearchRecording(): void {
  searchState.value = 'recording'
  searchCapturedKeys.value = []
  nextTick(() => {
    searchRecorderRef.value?.focus()
    document.addEventListener('keydown', onSearchKeydown)
  })
}

function onSearchKeydown(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()

  if (event.key === 'Escape') {
    cancelSearchRecording()
    return
  }

  const mods: string[] = []
  if (event.ctrlKey || event.metaKey) mods.push('CommandOrControl')
  if (event.altKey) mods.push('Alt')
  if (event.shiftKey) mods.push('Shift')

  const key = event.key
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return

  const mappedKey = mapKey(event)
  searchCapturedKeys.value = [...mods, mappedKey]
  searchState.value = 'recording'
}

async function saveSearchShortcut(): Promise<void> {
  const accelerator = searchCapturedKeys.value.join('+')
  await window.electron.ipcRenderer.invoke('to-service-SettingsService:update', {
    searchBoxShortcut: accelerator
  })
  currentSearchShortcut.value = accelerator
  searchState.value = 'idle'
  document.removeEventListener('keydown', onSearchKeydown)

  showSearchSavedTip.value = true
  setTimeout(() => {
    showSearchSavedTip.value = false
  }, 3000)
}

function cancelSearchRecording(): void {
  searchState.value = 'idle'
  searchCapturedKeys.value = []
  document.removeEventListener('keydown', onSearchKeydown)
}

// ═══════════════════════════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════════════════════════

/**
 * 映射 KeyboardEvent 到 Electron accelerator 键名
 */
function mapKey(event: KeyboardEvent): string {
  const { code, key } = event

  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('F') && code.length <= 3 && /^F\d+$/.test(code)) return code
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
 * 将 Electron accelerator 拆分为可读的键名片段
 * CommandOrControl+Alt+V → ['Ctrl', 'Alt', 'V'] (Win) / ['Cmd', 'Alt', 'V'] (Mac)
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
  const settings = await window.electron.ipcRenderer.invoke('to-service-SettingsService:get')
  currentShortcut.value = settings.shortcut
  currentSnippetShortcut.value = settings.snippetShortcut || 'CommandOrControl+Shift+V'
  currentSearchShortcut.value = settings.searchBoxShortcut || 'CommandOrControl+K'
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('keydown', onSnippetKeydown)
  document.removeEventListener('keydown', onSearchKeydown)
})
</script>

<style scoped>
.shortcuts-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px;
  overflow-y: auto;
  box-sizing: border-box;
}

.shortcuts-page::-webkit-scrollbar {
  width: 6px;
}

.shortcuts-page::-webkit-scrollbar-track {
  background: transparent;
}

.shortcuts-page::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.shortcuts-page::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

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

.setting-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
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

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.shortcut-keys {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-base);
  border: 1px solid var(--border-hover);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  min-height: 36px;
  box-sizing: border-box;
}

.shortcut-keys:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.change-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-left: 4px;
}

.shortcut-recorder {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-base);
  border: 2px solid var(--accent);
  border-radius: 8px;
  min-height: 36px;
  box-sizing: border-box;
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-glow);
  animation: recorder-pulse 1.5s ease-in-out infinite;
}

@keyframes recorder-pulse {
  0%, 100% { box-shadow: 0 0 0 3px var(--accent-glow); }
  50% { box-shadow: 0 0 0 6px rgba(var(--accent-rgb), 0.08); }
}

.recording-pulse {
  font-size: 10px;
  color: var(--accent);
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

.keycap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 26px;
  padding: 0 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-hover);
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: inherit;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
}

.keycap.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  box-shadow: 0 1px 0 #2563eb;
}

.shortcut-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.save-tip {
  font-size: 12px;
  color: var(--success);
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
</style>
