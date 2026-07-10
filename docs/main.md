# 主进程模块

本文档涵盖了 Electron 主进程的核心模块，包括应用入口、系统托盘、工具函数和预加载脚本。

---

## 主进程入口 (`src/main/index.ts`)

应用启动的入口文件，负责管理应用生命周期、创建窗口、处理系统级操作。

### 功能

- **全局错误处理**: 捕获未捕获的异常和未处理的 Promise 拒绝，使用 `electron-log` 记录到文件
- **单实例锁**: 防止应用启动多个实例
- **应用初始化**: 设置应用名称为 `Prism`，配置日志（写入 `userData` 目录）
- **服务初始化**: 依次初始化所有主进程服务（剪贴板、设置、翻译、Claude Code 监控、下载、文件互传、文本分享、Shell 集成）
- **窗口管理**: 创建系统托盘，注册全局快捷键，管理窗口显示/隐藏
- **IPC 注册**: 处理来自渲染进程的 IPC 请求
- **系统事件监听**: 处理 `window-all-closed`、`activate`（macOS）等系统事件

### 启动流程

```
app.whenReady()
  → 安装 electron-builder 自动更新
  → 初始化设置服务 (settingsService.init())
  → 创建系统托盘 (TrayService)
  → 初始化剪贴板监控 (clipboardService.init())
  → 初始化翻译服务 (translateService.init())
  → 初始化 Claude Code 监控 (claudeCodeService.init())
  → 初始化下载服务 (downloadService.init())
  → 初始化文件互传服务 (fileTransferService.init())
  → 初始化文本分享服务 (textShareService.init())
  → 初始化 Shell 集成 (shellIntegrationService.init())
  → 注册全局快捷键
  → 处理命令行参数（--send-files 文件分享）
```

### 关键依赖

- `@electron-toolkit/utils` — Electron 工具包（`electronApp`, `optimizer`）
- `electron-log` — 日志记录

---

## 系统托盘 (`src/main/service/trayService.ts`)

管理系统托盘图标、右键菜单以及窗口显示/隐藏。

### 功能

- 创建系统托盘图标（应用图标，尺寸 16x16）
- 托盘提示文字设置为 `妙妙屋`

### 平台差异

| 操作 | Windows | macOS |
|------|---------|-------|
| 左键单击 | 切换主页面显示/隐藏 | 弹出上下文菜单（macOS 菜单栏托盘行为） |
| 右键单击 | 弹出上下文菜单 | 弹出上下文菜单 |

### 右键菜单

| 菜单项 | 操作 |
|--------|------|
| 显示主窗口 | macOS 专属，调用 `windowFactory.getMainPageFrame().showCentered()` |
| 检查更新 | 显示通知弹窗并触发更新检查（带防抖，避免重复点击） |
| 退出 | 设置退出标志 `app.isQuitting = true`，销毁托盘，调用 `app.quit()` |

### 使用方法

```typescript
import { TrayService } from './service/trayService'

// 在主进程启动时创建
const trayService = new TrayService()

// 退出时销毁
trayService.destroy()
```

---

## 主进程工具函数 (`src/main/utils/platform.ts`)

封装平台相关的工具函数，处理 macOS/Windows 差异。

### 函数列表

#### `getBottomMargin(baseMargin: number): number`

获取屏幕底部安全间距。macOS 会自动加上 Dock 高度，Windows 直接返回传入的间距值。

- `baseMargin` — 基础间距（像素）
- **返回值**: 实际间距

```typescript
import { getBottomMargin } from '../utils/platform'

// macOS: 返回 baseMargin + DockHeight
// Windows: 返回 baseMargin
const margin = getBottomMargin(60)
```

**实现原理**:
- macOS 下通过 `screen.getPrimaryDisplay()` 获取工作区与屏幕边界的差值计算出 Dock 高度
- Windows 下直接返回 `baseMargin`

#### `isMacOS(): boolean`

判断当前是否为 macOS 平台。

```typescript
import { isMacOS } from '../utils/platform'

if (isMacOS()) {
  // macOS 专属逻辑
}
```

---

## 预加载脚本 (`src/preload/index.ts`)

在主进程和渲染进程之间建立安全的通信桥梁，使用 `contextBridge` 安全地暴露 Electron API。

### 功能

- **安全隔离**: 在上下文隔离（contextIsolation）启用时，通过 `contextBridge.exposeInMainWorld()` 暴露 API
- **Electron API**: 暴露 `@electron-toolkit/preload` 提供的 `electronAPI`
- **自定义 API**: 暴露空对象 `api`，供后续扩展

### 暴露的全局对象

```typescript
// 在渲染进程中通过 window.electron 访问
window.electron.ipcRenderer.send('channel')
window.electron.ipcRenderer.invoke('channel', args)
window.electron.ipcRenderer.on('channel', listener)
```

### IPC 频道类型声明 (`src/preload/index.d.ts`)

全局类型 `IPCChannels` 定义了所有可用的 IPC 频道及其参数类型，涵盖：

- **历史记录**: `clipboard-history:get`, `clipboard-history:search`, `clipboard-history:delete`, `clipboard-history:clearAll`
- **收藏**: `favorites:getAll`, `favorites:getByCategory`, `favorites:add`, `favorites:update`, `favorites:delete`, `favorites:clearAll`
- **窗口控制**: `main-page:minimize`, `close-window`
- **设置**: `settings:get`, `settings:update`
- **Claude Code 监控**: `to-service-ClaudeCodeService:installHook`, `uninstallHook`, `resolvePermission`, `isInstalled`, `isRunning`
- **文件互传**: `to-service-FileTransferService:getDevices`, `sendRequest`, `respondToRequest`, `getRecords`, `pickFiles`, `cancelTransfer`, `getServerInfo`, `pickDirectory`, `addDevice`, `scanNow`
- **文本分享**: `to-service-TextShareService:getOnlineDevices`, `sendText`, `getLastReceivedText`
- **通知按钮**: `to-main-NoticeNewFrame:share`, `copyReceivedText`, `closeReceivedText`
- **ShareSelect**: `to-renderer-ShareSelectFrame:show`, `animate`, `sendResult`, `to-main-ShareSelectFrame:ready`, `sendText`, `close`
- **QuickShare**: `to-renderer-QuickShareFrame:show`, `animate`, `sendResult`, `to-main-QuickShareFrame:ready`, `sendFiles`, `close`
- **广播事件**: `broadcast:transfer-devices-updated`, `broadcast:transfer-records-updated`, `broadcast:transfer-request`, `broadcast:transfer-scan-completed`, `broadcast:text-received`

### 数据模型

```typescript
interface HistoryItem {
  id: number
  content: string
  created_at: number
}

interface FavoriteItem {
  id: number
  content: string
  category: string
  description: string
  created_at: number
}

interface AppSettings {
  shortcut: string          // Electron accelerator 格式的全局快捷键
  serverUrl: string         // 局域网更新服务器路径
}

interface DeviceInfo {
  name: string
  address: string
  port: number
  version: string
  offline?: boolean
}
```

### 使用方法

```typescript
// 渲染进程：发送 IPC 请求
const history = await window.electron.invoke('clipboard-history:get', 50, 0)

// 渲染进程：发送单向消息
window.electron.send('main-page:minimize')

// 渲染进程：监听主进程推送
window.electron.on('clipboard-history:new', (_event, item) => {
  console.log('新剪贴板记录:', item)
})
```

### 依赖

- `@electron-toolkit/preload` — 提供安全的 Electron API 封装
