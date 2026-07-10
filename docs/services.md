# Services 模块文档

> 本文档从 CLAUDE.md 中提取，涵盖 `src/main/service/` 下所有服务模块及关联模块（下载引擎、搜索服务）。

---

## 目录

- [Clipboard Service (剪贴板历史服务)](#clipboard-service-srcmainserviceclipboardservicets)
- [Input Service (模拟输入服务)](#input-service-srcmainserviceinputservicets)
- [Settings Service (应用设置服务)](#settings-service-srcmainservicesettingsservicets)
- [Translate Service (翻译服务)](#translate-service-srcmainservicetranslateservicets)
- [Text Share Service (文本分享服务)](#text-share-service-srcmainservicetextshareservicets)
- [Claude Code Service (Claude Code 监控服务)](#claude-code-service-srcmainserviceclaudecodeservicets)
- [GitHub Update Service (GitHub 更新服务)](#github-update-service-srcmainservicegithubupdateservicets)
- [Download Engine (下载引擎)](#download-engine-srcmaincoredownloadengineconfigindexts)
- [Download Service (下载服务)](#download-service-srcmainservicedownloadservicets)
- [Search Service (搜索服务)](#search-service-srcmainservicesearchservicets)

---

## Clipboard Service (`src/main/service/clipboardService.ts`)

剪贴板历史记录的存储、查询、推送。

### 功能

- 使用 sql.js（纯 JS SQLite）持久化存储，数据文件位于 `userData/clipboard.db`
- 每秒监控剪贴板变化，新内容自动入库（自动去重）
- 支持分页查询、搜索、删除、清空
- 变化时通过 IPC 推送到可见窗口
- 自动清理 30 天前的过期数据，最多保留 1000 条
- **收藏独立存储**：支持手动添加、分类管理、编辑、删除

### 数据库表结构

**clipboard_history 表（历史记录）**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | 主键 |
| `content` | TEXT | 剪贴板内容 |
| `created_at` | INTEGER | 创建时间戳 |

**favorites 表（收藏）**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | 主键 |
| `content` | TEXT | 收藏内容 |
| `category` | TEXT DEFAULT '' | 分类（如：Linux命令、常用代码） |
| `description` | TEXT DEFAULT '' | 描述/备注 |
| `created_at` | INTEGER | 创建时间戳 |

### IPC 接口

**历史记录**:

| 频道 | 方向 | 说明 |
|------|------|------|
| `clipboard-history:get` | 渲染 -> 主 | 获取历史记录（分页） |
| `clipboard-history:search` | 渲染 -> 主 | 搜索历史记录 |
| `clipboard-history:delete` | 渲染 -> 主 | 删除一条记录 |
| `clipboard-history:clearAll` | 渲染 -> 主 | 清空所有历史记录 |
| `clipboard-history:new` | 主 -> 渲染 | 推送新记录到渲染进程 |

**收藏**:

| 频道 | 方向 | 说明 |
|------|------|------|
| `favorites:getAll` | 渲染 -> 主 | 获取所有收藏列表 |
| `favorites:getByCategory` | 渲染 -> 主 | 按分类获取收藏列表 |
| `favorites:getCategories` | 渲染 -> 主 | 获取所有分类及其数量 |
| `favorites:add` | 渲染 -> 主 | 手动添加收藏 |
| `favorites:update` | 渲染 -> 主 | 更新收藏内容 |
| `favorites:delete` | 渲染 -> 主 | 删除收藏 |
| `favorites:clearAll` | 渲染 -> 主 | 清空所有收藏 |

---

## Input Service (`src/main/service/inputService.ts`)

封装键盘模拟功能，支持跨平台的自动粘贴和焦点窗口管理。

### 功能

- 使用 @nut-tree/nut-js 实现跨平台键盘模拟
- 自动识别操作系统：macOS 用 Cmd+V，Windows/Linux 用 Ctrl+V
- 支持剪贴板管理器点击记录后自动粘贴到上一个聚焦的窗口
- Windows 平台支持焦点窗口保存和恢复（通过 PowerShell 调用 user32.dll）

### IPC 接口

| 频道 | 方向 | 说明 |
|------|------|------|
| `input:paste` | 渲染 -> 主 | 仅模拟粘贴操作（Ctrl+V 或 Cmd+V） |
| `input:paste-to-previous` | 渲染 -> 主 | 恢复焦点到上一个窗口并粘贴 |
| `input:save-active-window` | 渲染 -> 主 | 保存当前焦点窗口句柄 |

### 使用方式

```typescript
import { inputService } from './service/inputService'

// 在主进程启动时自动初始化
// 显示主页面前调用
inputService.saveActiveWindow()

// 点击记录后调用
inputService.pasteToPreviousWindow()
```

### 依赖

- `@nut-tree/nut-js`

---

## Settings Service (`src/main/service/settingsService.ts`)

管理 `settings.json` 中的用户配置，支持全局快捷键、更新服务器地址、翻译 API 配置和开机自启。

### 功能

- 设置持久化到 `userData/settings.json`
- 支持快捷键自定义（跨平台 `CommandOrControl` 格式）
- 支持局域网更新服务器路径配置（**跨平台自动适配**）
- 支持翻译 API 地址和 Key 配置（可选，用于自定义翻译服务）
- 支持开机自启动（通过 Electron `app.setLoginItemSettings` 实现）
- 热重载：`update()` 后立即重新注册全局快捷键和开机自启
- 边界处理：文件损坏/不存在时自动返回默认值
- **跨平台路径自动修正**：加载配置时自动检测并修正不匹配当前平台的 `serverUrl`
- **更新源切换**：支持局域网更新和 GitHub 更新两种模式

### 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `shortcut` | string | `CommandOrControl+Alt+V` | 全局快捷键 |
| `snippetShortcut` | string | `CommandOrControl+Shift+V` | 片段选择快捷键 |
| `searchBoxShortcut` | string | `CommandOrControl+K` | 搜索框快捷键 |
| `serverUrl` | string | Windows: `\\10.15.8.28\dist`<br>macOS: `/Volumes/dist` | 局域网更新服务器路径 |
| `autoStart` | boolean | `false` | 开机自启动 |
| `showClaudeStatus` | boolean | `false` | Claude Code 状态通知显示 |
| `translateApiUrl` | string | (使用 MyMemory 免费 API) | 翻译 API 地址（可选） |
| `translateApiKey` | string | - | 翻译 API Key（可选） |
| `updateSource` | `'lan'` \| `'github'` | `'lan'` | 更新源选择 |
| `githubRepo` | string | `YT-XG/electron-vite-learn` | GitHub 仓库地址（格式：owner/repo） |

### IPC 接口

| 频道 | 方向 | 说明 |
|------|------|------|
| `settings:get` | 渲染 -> 主 | 获取所有设置 |
| `settings:update` | 渲染 -> 主 | 更新设置（合并写入） |

### 使用方式

```typescript
import { settingsService } from './service/settingsService'

// 在主进程启动时初始化
await settingsService.init()

// 获取设置
const settings = settingsService.getAll()

// 更新设置（Windows）
settingsService.update({ serverUrl: '\\\\192.168.1.100\\dist' })

// 更新设置（macOS，通常不需要手动调用，默认值已正确）
settingsService.update({ serverUrl: '/Volumes/dist' })

// 切换到 GitHub 更新源
settingsService.update({
  updateSource: 'github',
  githubRepo: 'YT-XG/electron-vite-learn'
})
```

### macOS 使用方法

1. 在 Finder 中挂载共享文件夹（`Cmd+K` -> 输入 `smb://10.15.8.28/dist`）
2. 挂载成功后路径自动为 `/Volumes/dist`，**无需手动填写**
3. 应用会自动从挂载的共享文件夹检查更新

---

## Translate Service (`src/main/service/translateService.ts`)

处理翻译 API 调用和翻译历史管理。

### 功能

- 使用 MyMemory API 提供免费翻译，支持自定义 API 配置
- 使用 sql.js（纯 JS SQLite）持久化存储翻译历史，数据文件位于 `userData/translate.db`
- 支持分页查询、删除、清空翻译历史
- 翻译成功后自动保存历史记录

### 数据库表结构

**translate_history 表（翻译历史）**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | 主键 |
| `source_lang` | TEXT | 源语言 |
| `target_lang` | TEXT | 目标语言 |
| `source_text` | TEXT | 原文 |
| `result_text` | TEXT | 译文 |
| `created_at` | INTEGER | 创建时间戳 |

### IPC 接口

| 频道 | 方向 | 说明 |
|------|------|------|
| `to-service-TranslateService:translate` | 渲染 -> 主 | 翻译文本 |
| `to-service-TranslateService:getHistory` | 渲染 -> 主 | 获取翻译历史（分页） |
| `to-service-TranslateService:delete` | 渲染 -> 主 | 删除一条翻译历史 |
| `to-service-TranslateService:clearAll` | 渲染 -> 主 | 清空所有翻译历史 |

### 使用方式

```typescript
import { translateService } from './service/translateService'

// 在主进程启动时初始化
await translateService.init()

// 翻译文本
const result = await translateService.translate({
  text: 'Hello',
  sourceLang: 'en',
  targetLang: 'zh'
})

// 获取翻译历史
const history = translateService.getHistory(50, 0)
```

---

## Text Share Service (`src/main/service/textShareService.ts`)

基于文件互传的设备发现能力，提供跨设备的文本分享功能。

### 功能

- 获取在线设备列表（从 `fileTransferService.getDevices()` 获取）
- 发送文本到目标设备（先 ping 验证在线，后 POST `/share-text`）
- 接收文本后通过 PopupManager 显示持久通知（含复制/关闭按钮）
- 复制文本到系统剪贴板

### 工作流程

```
发送方: 剪贴板通知 -> 点击分享按钮 -> ShareSelectFrame(选设备) -> POST /share-text
接收方: HTTP Server -> textShareService.onReceiveText() -> PopupManager -> 持久通知
```

### 通信协议

`POST http://{target}:{port}/share-text`

JSON body:

```json
{
  "text": "分享的文本内容",
  "senderName": "发送方设备名称",
  "timestamp": 1700000000000
}
```

### IPC 接口

| 频道 | 方向 | 说明 |
|------|------|------|
| `to-service-TextShareService:getOnlineDevices` | 渲染 -> 主 | 获取在线设备列表 |
| `to-service-TextShareService:sendText` | 渲染 -> 主 | 发送文本到目标设备 |
| `to-service-TextShareService:getLastReceivedText` | 渲染 -> 主 | 获取最近收到的文本 |

### 使用方式

```typescript
import { textShareService } from './service/textShareService'
const devices = textShareService.getOnlineDevices()
await textShareService.sendText(device, 'Hello!')
```

---

## Claude Code Service (`src/main/service/claudeCodeService.ts`)

监控 Claude Code CLI 运行状态，提供权限请求交互和常驻状态通知。

### 功能

- **自动启用**: 应用启动时自动安装 Hook 并启动 HTTP 服务器
- 通过 Hook 脚本拦截 Claude Code 的事件（SessionStart/End, Stop, PermissionRequest）
- 启动 HTTP 服务器（`127.0.0.1:17861`）接收 Hook 事件
- 权限请求：暂存 HTTP 响应，显示权限确认窗口，同时更新常驻状态为"等待权限"
- 非权限事件：通过 PopupManager 更新常驻状态通知
- 支持安装/卸载 Hook 到 `~/.claude/settings.json`
- **状态管理**: 跟踪活跃会话计数，管理常驻状态通知的显示/隐藏

### 工作流程

```
应用启动 -> 自动安装 Hook -> 启动 HTTP 服务器
Claude Code CLI -> Hook 脚本 -> HTTP POST -> 主进程 HTTP 服务器
    -> SessionStart: 显示"会话运行中"状态，5 秒后自动隐藏
    -> PermissionRequest: 更新为"等待权限: 工具名"
    -> Stop/StopFailure: 短暂显示"任务完成"
    -> SessionEnd: 延迟 3 秒隐藏状态通知
```

### IPC 接口

| 频道 | 方向 | 说明 |
|------|------|------|
| `to-service-ClaudeCodeService:installHook` | 渲染 -> 主 | 安装 Hook |
| `to-service-ClaudeCodeService:uninstallHook` | 渲染 -> 主 | 卸载 Hook |
| `to-service-ClaudeCodeService:resolvePermission` | 渲染 -> 主 | 解决权限请求 |
| `to-service-ClaudeCodeService:isInstalled` | 渲染 -> 主 | 检查 Hook 是否已安装 |
| `to-service-ClaudeCodeService:isRunning` | 渲染 -> 主 | 检查服务器是否运行 |

### 使用方式

```typescript
import { claudeCodeService } from './service/claudeCodeService'

// 在主进程启动时初始化
await claudeCodeService.init()

// 安装 Hook（启动 HTTP 服务器）
await claudeCodeService.installHook()

// 检查 Hook 是否已安装
const installed = claudeCodeService.isHookInstalled()

// 解决权限请求
claudeCodeService.resolvePermission(sessionId, 'allow')
```

---

## GitHub Update Service (`src/main/service/githubUpdateService.ts`)

从 GitHub Releases 检查和下载应用更新。

### 功能

- 从 GitHub Releases API 获取最新版本信息
- 比较本地版本与远程版本
- **跨平台支持**：自动根据当前平台选择对应的安装包
  - macOS: `.dmg` 文件
  - Windows: `-setup.exe` 或 `.exe` 文件
- 支持下载进度回调（使用 content-length 或文件大小作为备用）
- 本地缓存已下载的更新（避免重复下载）

### IPC 接口

无（内部服务，由 `UpdateNewFrame` 调用）。

### 使用方式

```typescript
import { githubUpdateService } from './service/githubUpdateService'

// 检查更新
const updateInfo = await githubUpdateService.checkForUpdates('YT-XG/electron-vite-learn')
if (updateInfo) {
  console.log('发现新版本:', updateInfo.version)
}

// 下载更新
const localPath = await githubUpdateService.downloadUpdate(updateInfo, (percent) => {
  console.log('下载进度:', percent + '%')
})
```

### 依赖

- Electron `net` 模块（无需额外依赖）

---

## Download Engine (`src/main/core/downloadEngine/config/index.ts`)

多线程下载引擎的配置常量。

### 配置项

| 常量 | 值 | 说明 |
|------|-----|------|
| `DEFAULT_THREADS` | 8 | 默认下载线程数 |
| `MAX_THREADS` | 16 | 最大下载线程数 |
| `MIN_THREADS` | 1 | 最小下载线程数 |
| `EMIT_INTERVAL_MS` | 160 | 进度推送间隔（毫秒） |
| `MIN_CHUNK_BYTES` | 1MB | 最小分片大小 |

### 使用方式

```typescript
import {
  DEFAULT_THREADS,
  MAX_THREADS,
  MIN_THREADS,
  EMIT_INTERVAL_MS,
  MIN_CHUNK_BYTES
} from './core/downloadEngine/config'
```

---

## Download Service (`src/main/service/downloadService.ts`)

封装下载引擎，提供全局单例、任务持久化和 IPC 接口。

### 功能

- 多线程分片下载（默认 8 线程，最大 16）
- 暂停/恢复/取消下载任务
- 任务持久化（保存到 `userData/download-tasks.json`）
- 进度广播到所有可见窗口

### IPC 接口

| 频道 | 说明 |
|------|------|
| `download:start` | 开始下载 |
| `download:pause` | 暂停下载 |
| `download:resume` | 恢复下载 |
| `download:cancel` | 取消下载 |
| `download:remove` | 移除下载任务 |
| `download:list` | 获取下载任务列表 |
| `download:get` | 获取单个下载任务 |
| `download:pick-save-path` | 选择保存路径 |

### 依赖

- `downloadEngine`（多线程下载引擎）

---

## Search Service (`src/main/service/searchService.ts`)

统一管理工具、剪贴板、应用的搜索逻辑。

### 功能

- 搜索工具（支持多维度匹配：名称、别名、拼音首字母、描述）
- 搜索剪贴板历史
- 打开文件/网页
- 执行工具动作

### 内置工具

| 工具 ID | 名称 | 别名 | 说明 |
|---------|------|------|------|
| `markdown-preview` | Markdown 预览 | `md`, `预览`, `markdown` | 打开 Markdown 预览窗口 |
| `clipboard-manager` | 剪贴板管理 | `cb`, `剪贴板`, `复制` | 打开剪贴板管理页面 |
| `translate` | 翻译 | `fy`, `翻译`, `translate` | 打开翻译页面 |
| `download-manager` | 下载管理 | `xiazai`, `下载`, `download` | 打开下载管理页面 |
| `check-update` | 检查更新 | `gx`, `更新`, `update` | 检查应用更新 |
| `settings` | 设置 | `sz`, `设置`, `settings` | 打开设置页面 |
| `shortcuts` | 快捷键 | `kj`, `快捷键`, `shortcuts`, `shortcut` | 自定义应用快捷键 |
| `json-tool` | JSON 工具 | `json`, `json工具`, `格式化` | JSON 格式化、压缩、转义、校验 |

### 搜索匹配方式（按优先级排序）

1. 精确匹配：工具名称完全匹配
2. 前缀匹配：工具名称以查询词开头
3. 别名精确匹配：别名完全匹配
4. 别名前缀匹配：别名以查询词开头
5. 拼音首字母匹配：工具名称拼音首字母以查询词开头
6. 包含匹配：工具名称包含查询词
7. 别名包含匹配：别名包含查询词
8. 拼音包含匹配：拼音首字母包含查询词
9. 描述包含匹配：工具描述包含查询词

### IPC 接口

| 频道 | 方向 | 说明 |
|------|------|------|
| `to-main-SearchBox:searchTools` | 渲染 -> 主 | 搜索工具 |
| `to-main-SearchBox:searchClipboard` | 渲染 -> 主 | 搜索剪贴板 |
| `to-main-SearchBox:executeTool` | 渲染 -> 主 | 执行工具 |
| `to-main-SearchBox:openFile` | 渲染 -> 主 | 打开文件 |
| `to-main-SearchBox:openUrl` | 渲染 -> 主 | 打开网页 |
| `to-main-SearchBox:copyClipboard` | 渲染 -> 主 | 复制剪贴板内容 |
| `to-main-SearchBox:hide` | 渲染 -> 主 | 隐藏搜索框 |

### 使用方式

```typescript
import { searchService } from './service/searchService'

// 搜索工具（支持别名：md、预览、markdown）
const results = searchService.searchTools('md')

// 搜索剪贴板
const clipboardResults = await searchService.searchClipboard('关键词')

// 执行工具（打开 Markdown 预览会自动隐藏主界面）
searchService.executeTool('markdown-preview')

// 其他可执行的工具
searchService.executeTool('download-manager')  // 打开下载管理
searchService.executeTool('check-update')      // 检查更新
searchService.executeTool('settings')          // 打开设置
searchService.executeTool('shortcuts')         // 打开快捷键
searchService.executeTool('json-tool')         // 打开 JSON 工具
```
