<template>
  <div class="settings-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2 class="page-title">设置</h2>
      <p class="page-desc">自定义应用行为和快捷键</p>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

/** 录制状态 */
type State = 'idle' | 'recording'

const state = ref<State>('idle')
const currentShortcut = ref('')
const capturedKeys = ref<string[]>([])
const showSavedTip = ref(false)

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
  await window.electron.ipcRenderer.invoke('settings:update', { shortcut: accelerator })
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
  const settings = await window.electron.ipcRenderer.invoke('settings:get')
  currentShortcut.value = settings.shortcut
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

/* ========== 页面标题 ========== */
.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
}

.page-desc {
  font-size: 12px;
  color: #999;
  margin: 4px 0 0;
}

/* ========== 设置卡片 ========== */
.setting-card {
  background: #f9fafb;
  border: 1px solid #f0f0f0;
  border-radius: 12px;
  padding: 20px;
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
  color: #1a1a1a;
}

.setting-hint {
  font-size: 12px;
  color: #999;
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
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 36px;
  box-sizing: border-box;
}

.shortcut-keys:hover {
  border-color: #3d8bff;
  box-shadow: 0 0 0 3px rgba(61, 139, 255, 0.08);
}

.change-hint {
  font-size: 11px;
  color: #bbb;
  margin-left: 4px;
}

/* 录制状态容器 */
.shortcut-recorder {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: #fff;
  border: 2px solid #3d8bff;
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
  color: #3d8bff;
  animation: dot-pulse 1s ease-in-out infinite;
}

@keyframes dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.recording-text {
  font-size: 13px;
  color: #888;
}

/* ========== 键帽样式 ========== */
.keycap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 26px;
  padding: 0 8px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  color: #1a1a1a;
  font-family: inherit;
  box-shadow: 0 1px 0 #bbb;
}

.keycap.active {
  background: #3d8bff;
  border-color: #3d8bff;
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
  height: 34px;
  padding: 0 14px;
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
}

.btn-primary {
  background: linear-gradient(135deg, #3d8bff, #ff6ab0);
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
  background: #fff;
  border: 1px solid #e5e7eb;
  color: #555;
}

.btn-outline:hover {
  border-color: #3d8bff;
  color: #3d8bff;
}

.btn-ghost {
  background: transparent;
  color: #999;
}

.btn-ghost:hover {
  background: #f3f4f6;
  color: #555;
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
</style>
