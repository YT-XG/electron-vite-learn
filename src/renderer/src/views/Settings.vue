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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          浅色
        </button>
        <button
          class="theme-btn"
          :class="{ active: currentTheme === 'dark' }"
          @click="setTheme('dark')"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          深色
        </button>
      </div>
    </div>

    <!-- 开机自启 -->
    <div class="setting-card">
      <div class="setting-info">
        <span class="setting-label">开机自启动</span>
        <span class="setting-hint">系统登录时自动启动应用（后台静默运行）</span>
      </div>

      <div class="toggle-row">
        <label class="toggle-switch">
          <input type="checkbox" v-model="autoStart" @change="saveAutoStart" />
          <span class="toggle-slider"></span>
        </label>
        <span class="toggle-label">{{ autoStart ? '已开启' : '已关闭' }}</span>
      </div>
    </div>

    <!-- Claude Code 状态通知 -->
    <div class="setting-card">
      <div class="setting-info">
        <span class="setting-label">Claude Code 状态通知</span>
        <span class="setting-hint">运行 Claude Code 时在右下角显示会话状态和工具调用信息</span>
      </div>

      <div class="toggle-row">
        <label class="toggle-switch">
          <input type="checkbox" v-model="showClaudeStatus" @change="saveClaudeStatus" />
          <span class="toggle-slider"></span>
        </label>
        <span class="toggle-label">{{ showClaudeStatus ? '已开启' : '已关闭' }}</span>
      </div>
    </div>

    <!-- 更新源选择 -->
    <div class="setting-card">
      <div class="setting-info">
        <span class="setting-label">更新源</span>
        <span class="setting-hint">选择应用检查更新的来源</span>
      </div>

      <div class="update-source-row">
        <label class="radio-option" :class="{ active: updateSource === 'lan' }">
          <input type="radio" v-model="updateSource" value="lan" @change="saveUpdateSource" />
          <div class="radio-content">
            <span class="radio-title">局域网更新</span>
            <span class="radio-desc">从共享文件夹检查更新（需要在同一网络）</span>
          </div>
        </label>

        <label class="radio-option" :class="{ active: updateSource === 'github' }">
          <input type="radio" v-model="updateSource" value="github" @change="saveUpdateSource" />
          <div class="radio-content">
            <span class="radio-title">GitHub 更新</span>
            <span class="radio-desc">从 GitHub Releases 检查更新（需要网络连接）</span>
          </div>
        </label>
      </div>

      <!-- GitHub 仓库地址（仅 GitHub 模式显示） -->
      <Transition name="fade">
        <div v-if="updateSource === 'github'" class="github-config">
          <div class="form-group">
            <label>仓库地址（owner/repo）</label>
            <input
              v-model="githubRepo"
              type="text"
              class="form-input"
              placeholder="YT-XG/electron-vite-learn"
              spellcheck="false"
              @input="onGithubRepoInput"
            />
          </div>
          <button class="btn btn-primary" @click="saveGithubRepo" :disabled="!isGithubRepoDirty">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            保存
          </button>
        </div>
      </Transition>

      <Transition name="fade">
        <p v-if="showUpdateSourceTip" class="save-tip">✅ 更新源已保存</p>
      </Transition>
    </div>

    <!-- 局域网更新服务器（仅局域网模式显示） -->
    <Transition name="fade">
      <div v-if="updateSource === 'lan'" class="setting-card">
        <div class="setting-info">
          <span class="setting-label">更新服务器</span>
          <span class="setting-hint">选择或输入服务器 IP，检查更新时会从该地址读取 latest.yml</span>
        </div>

      <!-- Windows: UNC 路径选择器 -->
      <template v-if="!isMacOS">
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
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            保存
          </button>
        </div>

        <p class="server-preview">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          {{ fullServerUrl || '未选择服务器' }}
        </p>
      </template>

      <!-- macOS: SMB 挂载说明 -->
      <template v-else>
        <div class="mac-mount-status">
          <div class="status-icon" :class="{ mounted: isMacMounted }">
            <svg v-if="isMacMounted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
          <div class="status-info">
            <p class="status-text">{{ isMacMounted ? '共享文件夹已挂载' : '共享文件夹未挂载' }}</p>
            <p class="status-hint">{{ isMacMounted ? '当前路径: ' + macServerPath : '请先在 Finder 中挂载共享文件夹' }}</p>
          </div>
        </div>

        <!-- macOS 挂载帮助 -->
        <div class="mac-mount-help">
          <div class="help-header" @click="showMountHelp = !showMountHelp">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <span>{{ isMacMounted ? '如何更换共享文件夹？' : '如何连接共享文件夹？' }}</span>
            <svg class="help-arrow" :class="{ open: showMountHelp }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
          <Transition name="fade">
            <div v-if="showMountHelp" class="help-content">
              <div class="help-tip">
                <strong>💡 只需挂载共享文件夹，无需手动填写路径</strong><br>
                挂载成功后，应用会自动使用 <code>/Volumes/dist</code> 路径检查更新
              </div>
              <ol class="help-steps">
                <li>打开 <strong>Finder</strong>（访达）</li>
                <li>菜单栏 → <strong>前往</strong> → <strong>连接服务器</strong>（快捷键 <kbd>⌘</kbd><kbd>K</kbd>）</li>
                <li>输入服务器地址：<code>smb://10.15.8.28/dist</code></li>
                <li>点击 <strong>连接</strong>，输入 Windows 用户名和密码</li>
                <li>挂载成功后，共享文件夹会出现在 <code>/Volumes/dist</code></li>
              </ol>
              <p class="help-tip">💡 挂载后路径通常为 <code>/Volumes/dist</code>，请在上方输入框中填写此路径</p>
            </div>
          </Transition>
        </div>
      </template>

      <Transition name="fade">
        <p v-if="showServerUrlTip" class="save-tip">✅ 更新服务器地址已保存</p>
      </Transition>
      </div>
    </Transition>

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
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        保存
      </button>

      <Transition name="fade">
        <p v-if="showTranslateApiTip" class="save-tip">✅ 翻译 API 配置已保存</p>
      </Transition>
    </div>

    <!-- 文件互传 -->
    <div class="setting-card">
      <div class="setting-info">
        <span class="setting-label">文件互传</span>
        <span class="setting-hint">配置局域网文件互传相关设置</span>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">设备名称</span>
          <span class="setting-desc">在局域网中显示的名称</span>
        </div>
        <input
          class="setting-input"
          type="text"
          :value="transferDeviceName"
          @change="updateSetting('transferDeviceName', ($event.target as HTMLInputElement).value)"
          placeholder="自动使用系统主机名"
        />
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">接收文件保存位置</span>
          <span class="setting-desc">接收文件默认保存到此目录</span>
        </div>
        <div class="setting-dir-row">
          <input
            class="setting-input"
            type="text"
            :value="transferSaveDir"
            readonly
            placeholder="系统默认下载目录"
            style="flex:1; min-width:0;"
          />
          <button class="btn btn-secondary" @click="pickTransferDir">选择</button>
        </div>
      </div>

      <!-- TCP 扫描网段 -->
      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">扫描网段</span>
          <span class="setting-desc">TCP 扫描这些网段发现跨子网设备（如 10.15.8.0/24）</span>
        </div>
        <div class="scan-subnets-col">
          <div class="scan-subnet-tags" v-if="scanSubnets.length > 0">
            <div v-for="(subnet, idx) in scanSubnets" :key="idx" class="scan-subnet-tag">
              <span>{{ subnet }}</span>
              <button class="tag-remove" @click="removeSubnet(idx)" title="移除">×</button>
            </div>
          </div>
          <div class="scan-subnet-add-row">
            <input
              v-model="newSubnetInput"
              type="text"
              class="form-input"
              placeholder="10.15.8.0/24"
              spellcheck="false"
              @keydown.enter="addSubnet"
              @keydown.comma="addSubnet"
            />
            <button class="btn btn-ghost" @click="addSubnet" :disabled="!newSubnetInput.trim()">添加</button>
          </div>
          <p class="scan-hint">每 60 秒自动扫描一次。本机所在 /24 子网会自动加入扫描</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

/** 当前主题 */
const currentTheme = ref<'light' | 'dark'>(
  (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
)

/** 开机自启动 */
const autoStart = ref(false)

/** Claude Code 状态通知 */
const showClaudeStatus = ref(false)

/** 是否为 macOS 平台 */
const isMacOS = navigator.platform.includes('Mac')

/** macOS 挂载帮助展开状态 */
const showMountHelp = ref(false)

/** macOS 共享文件夹是否已挂载 */
const isMacMounted = computed(() => {
  return macServerPath.value === '/Volumes/dist'
})

/**
 * 设置主题
 * @param theme - 主题名称
 */
const setTheme = (theme: 'light' | 'dark') => {
  currentTheme.value = theme
  localStorage.setItem('theme', theme)
  document.documentElement.setAttribute('data-theme', theme)
}

/**
 * 保存开机自启动设置
 */
async function saveAutoStart(): Promise<void> {
  await window.electron.ipcRenderer.invoke('to-service-SettingsService:update', { autoStart: autoStart.value })
}

/**
 * 保存 Claude Code 状态通知设置
 */
async function saveClaudeStatus(): Promise<void> {
  await window.electron.ipcRenderer.invoke('to-service-SettingsService:update', { showClaudeStatus: showClaudeStatus.value })
}

/** 更新服务器配置 */
const ipOptions = [
  { label: '10.15.8.28', value: '10.15.8.28' },
  { label: '10.15.66.216', value: '10.15.66.216' }
]
const selectedIp = ref('')
const customIp = ref('')
const showServerUrlTip = ref(false)
const serverUrlOrig = ref('')

/** macOS 服务器路径 */
const macServerPath = ref('')

/** 更新源配置 */
const updateSource = ref<'lan' | 'github'>('lan')
const githubRepo = ref('')
const showUpdateSourceTip = ref(false)
const githubRepoOrig = ref('')

/** GitHub 仓库地址是否有改动 */
const isGithubRepoDirty = computed(() => {
  return githubRepo.value !== '' && githubRepo.value !== githubRepoOrig.value
})

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

/** 拼接完整路径（跨平台） */
const fullServerUrl = computed(() => {
  if (isMacOS) {
    // macOS: 直接使用输入的路径
    return macServerPath.value.trim()
  }
  // Windows: 拼接 UNC 路径
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

/** 文件互传设备名称 */
const transferDeviceName = ref('')

/** 文件互传保存目录 */
const transferSaveDir = ref('')

/** TCP 扫描网段列表 */
const scanSubnets = ref<string[]>([])

/** 新增扫描网段输入 */
const newSubnetInput = ref('')

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

/** 翻译 API 配置是否有改动 */
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
 * 保存更新源
 */
async function saveUpdateSource(): Promise<void> {
  await window.electron.ipcRenderer.invoke('to-service-SettingsService:update', {
    updateSource: updateSource.value
  })
  showUpdateSourceTip.value = true
  setTimeout(() => {
    showUpdateSourceTip.value = false
  }, 3000)
}

/**
 * 保存 GitHub 仓库地址
 */
async function saveGithubRepo(): Promise<void> {
  await window.electron.ipcRenderer.invoke('to-service-SettingsService:update', {
    githubRepo: githubRepo.value
  })
  githubRepoOrig.value = githubRepo.value
  showUpdateSourceTip.value = true
  setTimeout(() => {
    showUpdateSourceTip.value = false
  }, 3000)
}

/** GitHub 仓库地址输入 */
function onGithubRepoInput(): void {
  // 确保输入格式正确
  githubRepo.value = githubRepo.value.trim()
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

/**
 * 更新单个设置项
 */
async function updateSetting(key: string, value: unknown): Promise<void> {
  await window.electron.ipcRenderer.invoke('to-service-SettingsService:update', { [key]: value })
}

/**
 * 选择接收文件保存目录
 */
async function pickTransferDir(): Promise<void> {
  const dir = await window.electron.ipcRenderer.invoke('to-service-FileTransferService:pickDirectory')
  if (dir) {
    await updateSetting('transferSaveDir', dir)
    transferSaveDir.value = dir
  }
}

/**
 * 添加扫描网段
 */
async function addSubnet(): Promise<void> {
  const val = newSubnetInput.value.trim().replace(/,+$/, '')
  if (!val) return
  // 简单格式校验：x.x.x.x/xx
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(val)) return
  if (scanSubnets.value.includes(val)) {
    newSubnetInput.value = ''
    return
  }
  scanSubnets.value.push(val)
  newSubnetInput.value = ''
  await window.electron.ipcRenderer.invoke('to-service-FileTransferService:setScanSubnets', scanSubnets.value)
}

/**
 * 移除扫描网段
 */
async function removeSubnet(idx: number): Promise<void> {
  scanSubnets.value.splice(idx, 1)
  await window.electron.ipcRenderer.invoke('to-service-FileTransferService:setScanSubnets', scanSubnets.value)
}

// ═══════════════════════════════════════════════════════════════
//  生命周期
// ═══════════════════════════════════════════════════════════════

onMounted(async () => {
  // 初始化主题
  document.documentElement.setAttribute('data-theme', currentTheme.value)

  const settings = await window.electron.ipcRenderer.invoke('to-service-SettingsService:get')
  autoStart.value = settings.autoStart ?? false
  showClaudeStatus.value = settings.showClaudeStatus ?? false

  // 初始化更新服务器
  if (isMacOS) {
    // macOS: 直接使用路径
    macServerPath.value = settings.serverUrl || '/Volumes/dist'
  } else {
    // Windows: 从 UNC 路径反解 IP
    const ip = extractIpFromUrl(settings.serverUrl)
    selectedIp.value = ip || '10.15.8.28'
    if (ip === '__custom') {
      customIp.value = settings.serverUrl.match(/^\\\\([^\\]+)/)?.[1] || ''
    }
  }
  serverUrlOrig.value = settings.serverUrl

  // 初始化更新源配置
  updateSource.value = settings.updateSource || 'lan'
  githubRepo.value = settings.githubRepo || 'YT-XG/electron-vite-learn'
  githubRepoOrig.value = githubRepo.value

  // 初始化翻译 API 配置
  translateApiUrl.value = settings.translateApiUrl || ''
  translateApiKey.value = settings.translateApiKey || ''
  translateApiOrig.value = {
    apiUrl: settings.translateApiUrl || '',
    apiKey: settings.translateApiKey || ''
  }

  // 初始化文件互传配置
  transferDeviceName.value = settings.transferDeviceName || ''
  transferSaveDir.value = settings.transferSaveDir || ''
  scanSubnets.value = settings.scanSubnets || []
})

onUnmounted(() => {
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
  background: var(--border);
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

/* ========== 设置卡片 ========== */
.server-url-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.server-url-select {
  width: 180px;
  height: 38px;
  padding: 0 32px 0 14px;
  border: 1px solid var(--border-hover);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  background: var(--bg-base) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 10px center;
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  transition: all 0.15s ease;
  box-shadow: var(--shadow-sm);
}

.server-url-select:hover {
  border-color: var(--border-hover);
  box-shadow: var(--shadow-md);
}

.server-url-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.server-url-input {
  flex: 1;
  height: 38px;
  padding: 0 14px;
  border: 1px solid var(--border-hover);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  background: var(--bg-base);
  outline: none;
  transition: all 0.15s ease;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  box-shadow: var(--shadow-sm);
}

.server-url-input:hover {
  border-color: var(--border-hover);
  box-shadow: var(--shadow-md);
}

.server-url-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.server-preview {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  margin: 10px 0 0;
  padding: 6px 10px;
  background: var(--bg-surface);
  border-radius: 6px;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
}

/* ========== macOS 挂载状态 ========== */
.mac-mount-status {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-surface);
  border-radius: 8px;
  border: 1px solid var(--border);
  margin-bottom: 12px;
}

.status-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-base);
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.status-icon.mounted {
  background: var(--success-bg);
  color: var(--success);
}

.status-info {
  flex: 1;
}

.status-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0;
}

.status-hint {
  font-size: 11px;
  color: var(--text-secondary);
  margin: 2px 0 0;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
}

/* ========== macOS 挂载帮助 ========== */
.mac-mount-help {
  margin-top: 12px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.help-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--accent);
  cursor: pointer;
  user-select: none;
  transition: color 0.2s ease;
}

.help-header:hover {
  color: var(--accent-secondary);
}

.help-arrow {
  margin-left: auto;
  transition: transform 0.2s ease;
}

.help-arrow.open {
  transform: rotate(180deg);
}

.help-content {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-surface);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.help-steps {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.8;
}

.help-steps li {
  margin-bottom: 4px;
}

.help-steps strong {
  color: var(--text-primary);
  font-weight: 600;
}

.help-steps code {
  display: inline-block;
  padding: 2px 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 11px;
  color: var(--accent);
}

.help-steps kbd {
  display: inline-block;
  padding: 2px 6px;
  background: var(--bg-base);
  border: 1px solid var(--border-hover);
  border-radius: 4px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  box-shadow: 0 1px 0 var(--text-tertiary);
}

.help-tip {
  margin: 10px 0 0;
  padding: 8px 10px;
  background: var(--accent-light);
  border-radius: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.help-tip code {
  display: inline-block;
  padding: 1px 5px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 11px;
  color: var(--accent);
}

/* macOS 路径输入框 */
.mac-path-input {
  flex: 1;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
}

/* ========== 保存成功提示 ========== */
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
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(196, 96, 58, 0.1);
}

/* ========== 更新源选择 ========== */
.update-source-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-base);
  border: 1px solid var(--border-hover);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.radio-option:hover {
  border-color: var(--accent);
}

.radio-option.active {
  border-color: var(--accent);
  background: var(--accent-light);
}

.radio-option input[type="radio"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}

.radio-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.radio-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.radio-desc {
  font-size: 11px;
  color: var(--text-secondary);
}

.github-config {
  padding-top: 12px;
  border-top: 1px solid var(--border);
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ========== 主题切换器 ========== */
.theme-switcher {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--bg-surface);
  border-radius: 8px;
  border: 1px solid var(--border);
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
  background: var(--accent);
  color: #fff;
  box-shadow: 0 2px 8px rgba(var(--accent-rgb), 0.3);
}

/* ========== 开关 ========== */
.toggle-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toggle-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  inset: 0;
  background: var(--border);
  border-radius: 24px;
  transition: all 0.3s ease;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: all 0.3s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.toggle-switch input:checked + .toggle-slider {
  background: var(--accent);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

/* ========== 文件互传设置 ========== */
.setting-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}

.setting-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.setting-row .setting-info {
  flex: 1;
  min-width: 0;
  margin-bottom: 0;
}

.setting-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.setting-input {
  width: 240px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border-hover);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-base);
  outline: none;
  transition: all 0.15s ease;
  box-sizing: border-box;
  flex-shrink: 0;
}

.setting-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.setting-dir-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

/* ── 扫描网段 ── */
.scan-subnets-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.scan-subnet-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.scan-subnet-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-family: JetBrains Mono, monospace;
  background: var(--accent-light, rgba(59,130,246,0.12));
  color: var(--accent);
  padding: 3px 8px;
  border-radius: 6px;
}
.tag-remove {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  line-height: 1;
}
.tag-remove:hover {
  color: var(--danger);
}
.scan-subnet-add-row {
  display: flex;
  gap: 6px;
}
.scan-subnet-add-row .form-input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  font-size: 12px;
  font-family: JetBrains Mono, monospace;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  outline: none;
  transition: border-color 200ms;
}
.scan-subnet-add-row .form-input:focus {
  border-color: var(--accent);
}
.scan-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin: 0;
}
</style>
