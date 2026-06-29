<template>
  <div
    class="update-popup"
    :class="[`pop-${direction}`, { 'pop-visible': visible }]"
  >
    <!-- 检查中 -->
    <template v-if="state === 'checking'">
      <span class="update-text checking-text">
        <span class="spinner"></span>
        正在检查更新...
      </span>
    </template>

    <!-- 已是最新版 -->
    <template v-else-if="state === 'latest'">
      <span class="update-text latest-text">
        <span class="check-icon">✓</span>
        已是最新版
      </span>
    </template>

    <!-- 检测到新版本 -->
    <template v-else>
      <span class="update-text">检测到新版本：{{ version }}</span>
      <div class="update-actions">
        <button class="btn-update" @click.stop="handleUpdate">更新</button>
        <button class="btn-later" @click.stop="handleClose">稍后</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

/** 版本号 */
const version = ref('')

/** 弹窗状态：checking=检查中, available=有新版本, latest=已是最新版 */
const state = ref<'checking' | 'available' | 'latest'>('checking')

/** 弹出方向 */
const direction = ref<'above' | 'below'>('above')

/** 动画可见状态 */
const visible = ref(false)

/** 自动关闭定时器 */
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 关闭弹窗
 */
const handleClose = () => {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer)
    autoCloseTimer = null
  }
  window.electron.ipcRenderer.send('to-main-BaseFrame:closeWindow')
}

/**
 * 点击更新按钮
 */
const handleUpdate = () => {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer)
    autoCloseTimer = null
  }
  window.electron.ipcRenderer.send('update:start-download', version.value)
}

/**
 * 重置自动关闭定时器
 */
const resetAutoClose = (delay: number) => {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer)
    autoCloseTimer = null
  }
  if (delay > 0) {
    autoCloseTimer = setTimeout(() => {
      handleClose()
    }, delay)
  }
}

/**
 * 处理弹窗数据更新
 */
const handlePopupData = (payload: { version?: string; direction?: string; state?: string }) => {
  if (payload.version) version.value = payload.version
  if (payload.direction) direction.value = payload.direction as 'above' | 'below'
  if (payload.state) {
    state.value = payload.state as 'checking' | 'available' | 'latest'
    // 根据状态重置自动关闭时间
    const delay = payload.state === 'latest' ? 3000 : payload.state === 'available' ? 10000 : 0
    resetAutoClose(delay)
  }
}

onMounted(async () => {
  // 从主进程获取待显示的数据（解决窗口创建时序问题）
  const data = await window.electron.ipcRenderer.invoke('to-main-TestFrame:getUpdateData')
  if (data) {
    handlePopupData(data)
  }

  // 监听弹窗数据更新
  window.electron.ipcRenderer.on('to-renderer-TestFrame:showUpdatePopup', (_event, payload) => {
    handlePopupData(payload)
  })

  // 监听更新服务发现新版本（直接 IPC 推送）
  window.electron.ipcRenderer.on('lan-update-available', (_event, payload: { version: string }) => {
    if (payload.version) version.value = payload.version
    state.value = 'available'
    resetAutoClose(10000)
  })

  // 下一帧触发动画
  requestAnimationFrame(() => {
    visible.value = true
  })

  // 初始状态为 checking 时不自动关闭（等检查结果）
  if (state.value !== 'checking') {
    const delay = state.value === 'latest' ? 3000 : 10000
    resetAutoClose(delay)
  }
})

onUnmounted(() => {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer)
  }
})
</script>

<style scoped>
/* ========== 弹窗基础样式（与悬浮球主题契合） ========== */
.update-popup {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 0 14px;
  background: linear-gradient(135deg, #ffffff 0%, #f5f5f7 100%);
  border-radius: 10px;
  box-sizing: border-box;
  user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  border: 1.5px solid transparent;
  background-clip: padding-box;
  box-shadow:
    0 0 0 1.5px rgba(61, 139, 255, 0.25),
    0 2px 8px rgba(0, 0, 0, 0.08),
    0 0 12px rgba(255, 106, 176, 0.1);
  opacity: 0;
  transform: scale(0.6);
  transition: opacity 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
              transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* ========== 方向感知动画 ========== */
.pop-above { transform-origin: bottom center; }
.pop-above.pop-visible { opacity: 1; transform: scale(1) translateY(0); }
.pop-below { transform-origin: top center; }
.pop-below.pop-visible { opacity: 1; transform: scale(1) translateY(0); }

/* ========== 文字 ========== */
.update-text {
  font-size: 12px;
  font-weight: 500;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

/* ========== 检查中状态 ========== */
.checking-text {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #888;
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid #e0e0e0;
  border-top-color: #3d8bff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ========== 已是最新版状态 ========== */
.latest-text {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #34c759;
  font-weight: 600;
}

.check-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #34c759;
  color: #fff;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

/* ========== 按钮组 ========== */
.update-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.btn-update {
  padding: 3px 12px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #3d8bff 0%, #5b9dff 100%);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  line-height: 1.3;
  transition: all 0.15s ease;
  box-shadow: 0 1px 4px rgba(61, 139, 255, 0.3);
}

.btn-update:hover {
  background: linear-gradient(135deg, #2d7af0 0%, #4b8def 100%);
  box-shadow: 0 2px 8px rgba(61, 139, 255, 0.4);
  transform: translateY(-0.5px);
}

.btn-update:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(61, 139, 255, 0.3);
}

.btn-later {
  padding: 3px 12px;
  font-size: 11px;
  font-weight: 500;
  color: #888;
  background: transparent;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  line-height: 1.3;
  transition: all 0.15s ease;
}

.btn-later:hover {
  color: #555;
  border-color: #ccc;
  background: #f5f5f5;
}
</style>

<style>
html, body { background: transparent !important; }
</style>
