<template>
  <div class="w-full h-full flex flex-col select-none" @mousedown="dragMouseDown">
    <!-- 白色卡片 -->
    <div class="flex flex-col h-full bg-white rounded-xl overflow-hidden shadow-lg border border-gray-100">
      <!-- 标题栏 -->
      <div class="flex items-center justify-between px-3 py-2 border-b border-gray-100 shrink-0">
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-pink-400"></span>
          <span class="text-xs font-semibold text-gray-700">软件更新</span>
          <span class="text-[10px] text-gray-400">v{{ currentVersion }}</span>
        </div>
        <button
          class="w-4 h-4 flex items-center justify-center rounded text-gray-300 hover:text-white hover:bg-red-400 transition-all duration-200 text-[10px]"
          @click.stop="skipUpdate"
        >
          ✕
        </button>
      </div>

      <!-- 内容区 -->
      <div class="flex-1 flex flex-col items-center justify-center px-5 py-2 overflow-hidden">

        <!-- 检查更新中：横向布局 -->
        <template v-if="status === 'checking'">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 border-[2.5px] border-indigo-100 border-t-indigo-400 rounded-full animate-spin shrink-0"></div>
            <p class="text-xs font-medium text-gray-600">正在检查更新...</p>
          </div>
        </template>

        <!-- 已是最新 -->
        <template v-else-if="status === 'not-available'">
          <div class="flex flex-col items-center text-center">
            <div class="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mb-3 ring-2 ring-emerald-100">
              <svg class="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p class="text-xs font-semibold text-gray-800 mb-0.5">已是最新版本</p>
            <p class="text-[10px] text-gray-400 mb-5">v{{ latestVersion }}</p>
            <button
              class="w-full py-2 bg-gradient-to-r from-indigo-400 to-pink-400 text-white text-[11px] font-medium rounded-lg shadow hover:shadow-md transition-all duration-200"
              @click="checkForUpdates"
            >
              再次检查
            </button>
          </div>
        </template>

        <!-- 发现新版本 -->
        <template v-else-if="status === 'available'">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0 ring-2 ring-amber-100">
              <svg class="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p class="text-xs font-semibold text-gray-800">发现新版本</p>
              <p class="text-[10px] text-gray-400">v{{ newVersion }}</p>
            </div>
          </div>
          <div v-if="releaseNotes" class="w-full max-h-12 overflow-y-auto text-left mb-3 p-2 bg-gray-50 rounded-lg border border-gray-100">
            <div class="text-[10px] text-gray-500 leading-relaxed whitespace-pre-wrap">{{ releaseNotes }}</div>
          </div>
          <div class="flex gap-2 w-full">
            <button
              class="flex-1 py-2 bg-gradient-to-r from-indigo-400 to-pink-400 text-white text-[11px] font-medium rounded-lg shadow hover:shadow-md transition-all duration-200"
              @click="startDownload"
            >
              下载
            </button>
            <button
              class="flex-1 py-2 bg-gray-100 text-gray-500 text-[11px] font-medium rounded-lg hover:bg-gray-200 transition-colors duration-200"
              @click="skipUpdate"
            >
              稍后
            </button>
          </div>
        </template>

        <!-- 下载中 -->
        <template v-else-if="status === 'downloading'">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 ring-2 ring-indigo-100">
              <svg class="w-5 h-5 text-indigo-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold text-gray-800 truncate">正在下载...</p>
              <p class="text-[10px] text-gray-400 truncate">{{ downloadSpeed }}</p>
            </div>
          </div>
          <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div
              class="h-full bg-gradient-to-r from-indigo-400 to-pink-400 rounded-full transition-all duration-300 ease-out"
              :style="{ width: progress + '%' }"
            ></div>
          </div>
          <div class="flex items-center justify-between w-full">
            <span class="text-sm font-bold bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">{{ progress.toFixed(0) }}%</span>
            <button
              class="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
              @click="cancelDownload"
            >
              取消
            </button>
          </div>
        </template>

        <!-- 下载完成 -->
        <template v-else-if="status === 'downloaded'">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 ring-2 ring-emerald-100">
              <svg class="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p class="text-xs font-semibold text-gray-800">下载完成</p>
              <p class="text-[10px] text-gray-400">点击安装并重启</p>
            </div>
          </div>
          <div class="flex gap-2 w-full">
            <button
              class="flex-1 py-2 bg-gradient-to-r from-emerald-400 to-teal-400 text-white text-[11px] font-medium rounded-lg shadow hover:shadow-md transition-all duration-200"
              @click="installUpdate"
            >
              立即安装
            </button>
            <button
              class="flex-1 py-2 bg-gray-100 text-gray-500 text-[11px] font-medium rounded-lg hover:bg-gray-200 transition-colors duration-200"
              @click="skipUpdate"
            >
              稍后
            </button>
          </div>
        </template>

        <!-- 错误 -->
        <template v-else-if="status === 'error'">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0 ring-2 ring-red-100">
              <svg class="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div class="min-w-0">
              <p class="text-xs font-semibold text-gray-800">更新失败</p>
              <p class="text-[10px] text-gray-400 truncate" :title="errorMessage">{{ errorMessage }}</p>
            </div>
          </div>
          <button
            class="w-full py-2 bg-gradient-to-r from-indigo-400 to-pink-400 text-white text-[11px] font-medium rounded-lg shadow hover:shadow-md transition-all duration-200"
            @click="checkForUpdates"
          >
            重试
          </button>
        </template>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

/** 更新状态类型 */
type UpdateStatus =
  | 'checking'
  | 'not-available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

/** 拖拽状态 */
const isKeyDown = ref(false)
const dinatesX = ref(0)
const dinatesY = ref(0)

/** 拖拽移动窗口 */
const dragMouseDown = (event: MouseEvent) => {
  isKeyDown.value = true
  dinatesX.value = event.x
  dinatesY.value = event.y
  document.onmousemove = (ev: MouseEvent) => {
    if (isKeyDown.value) {
      window.electron.ipcRenderer.invoke('custom-adsorption', {
        mouseX: ev.screenX,
        mouseY: ev.screenY,
        offsetLeft: dinatesX.value,
        offsetTop: dinatesY.value,
        windowWidth: 320,
        windowHeight: 200
      })
    }
  }
  document.onmouseup = () => {
    isKeyDown.value = false
  }
}

/** 更新信息接口 */
interface UpdateInfo {
  version: string
  file: string
  size: number
  sha512: string
  releaseNotes?: string
  releaseDate?: string
}

/** 当前版本 */
const currentVersion = ref('1.0.0')

/** 最新版本 */
const latestVersion = ref('')

/** 新版本号 */
const newVersion = ref('')

/** 更新说明 */
const releaseNotes = ref('')

/** 更新状态 */
const status = ref<UpdateStatus>('checking')

/** 下载进度 */
const progress = ref(0)

/** 下载速度 */
const downloadSpeed = ref('')

/** 错误信息 */
const errorMessage = ref('')

/** 更新信息（用于下载） */
const updateInfo = ref<UpdateInfo | null>(null)

/** 下载后的安装包路径 */
const installerPath = ref('')

/**
 * 格式化文件大小
 * @param bytes - 字节数
 * @returns 格式化后的字符串
 */
const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 检查更新
 */
const checkForUpdates = async () => {
  status.value = 'checking'
  try {
    await window.electron.ipcRenderer.invoke('lan-update:check')
  } catch (error) {
    console.error('检查更新失败:', error)
  }
}

/**
 * 开始下载更新
 */
const startDownload = async () => {
  if (!updateInfo.value) {
    console.error('没有可下载的更新信息')
    return
  }

  status.value = 'downloading'
  progress.value = 0
  try {
    // 将响应式对象转换为普通对象，避免 IPC 结构化克隆失败
    const plainInfo: UpdateInfo = {
      version: updateInfo.value.version,
      file: updateInfo.value.file,
      size: updateInfo.value.size,
      sha512: updateInfo.value.sha512,
      releaseNotes: updateInfo.value.releaseNotes,
      releaseDate: updateInfo.value.releaseDate
    }
    const path = await window.electron.ipcRenderer.invoke('lan-update:download', plainInfo)
    installerPath.value = path
  } catch (error) {
    console.error('下载失败:', error)
    status.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : '下载失败'
  }
}

/**
 * 取消下载
 */
const cancelDownload = () => {
  window.electron.ipcRenderer.invoke('lan-update:cancel')
  status.value = 'available'
}

/**
 * 安装更新
 */
const installUpdate = async () => {
  if (!installerPath.value) {
    console.error('没有可安装的更新包')
    return
  }

  try {
    await window.electron.ipcRenderer.invoke('lan-update:install', installerPath.value)
  } catch (error) {
    console.error('安装失败:', error)
    status.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : '安装失败'
  }
}

/**
 * 跳过更新
 */
const skipUpdate = () => {
  window.electron.ipcRenderer.send('close-window')
}

/**
 * 设置 IPC 事件监听器
 */
const setupIPCListeners = () => {
  // 没有可用更新
  window.electron.ipcRenderer.on('lan-update-not-available', (_event, data) => {
    status.value = 'not-available'
    latestVersion.value = data.currentVersion || data.remoteVersion || ''
  })

  // 发现可用更新
  window.electron.ipcRenderer.on('lan-update-available', (_event, data: UpdateInfo) => {
    status.value = 'available'
    updateInfo.value = data
    newVersion.value = data.version
    releaseNotes.value = data.releaseNotes || ''
  })

  // 下载进度
  window.electron.ipcRenderer.on('lan-update-progress', (_event, data) => {
    progress.value = data.percent
    const transferred = formatSize(data.transferred)
    const total = formatSize(data.total)
    const speed = formatSize(data.bytesPerSecond) + '/s'
    downloadSpeed.value = `${transferred} / ${total} (${speed})`
  })

  // 更新下载完成
  window.electron.ipcRenderer.on('lan-update-downloaded', (_event, data) => {
    status.value = 'downloaded'
    installerPath.value = data.path
  })

  // 更新错误
  window.electron.ipcRenderer.on('lan-update-error', (_event, data) => {
    status.value = 'error'
    errorMessage.value = data.message || '未知错误'
  })
}

/**
 * 移除 IPC 事件监听器
 */
const removeIPCListeners = () => {
  window.electron.ipcRenderer.removeAllListeners('lan-update-not-available')
  window.electron.ipcRenderer.removeAllListeners('lan-update-available')
  window.electron.ipcRenderer.removeAllListeners('lan-update-progress')
  window.electron.ipcRenderer.removeAllListeners('lan-update-downloaded')
  window.electron.ipcRenderer.removeAllListeners('lan-update-error')
}

onMounted(() => {
  console.log('更新窗口已加载')
  setupIPCListeners()
  checkForUpdates()
})

onUnmounted(() => {
  removeIPCListeners()
})
</script>

<!-- 全局样式：确保更新窗口透明背景 -->
<style>
html,
body {
  background: transparent !important;
  cursor: default;
}
</style>
