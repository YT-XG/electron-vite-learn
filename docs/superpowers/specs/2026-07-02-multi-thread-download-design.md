# 多线程下载工具设计文档

## 概述

将 eIsland 项目的多线程下载引擎移植到 electron-vite-learn 项目，提供通用的多线程下载能力，同时用于 GitHub 更新下载和通用下载场景。

## 目标

1. 提供高性能的多线程下载能力（默认 8 线程，最大 16 线程）
2. 支持暂停/恢复/取消下载任务
3. 下载任务持久化存储，应用重启后可恢复
4. 提供完整的下载管理 UI 界面
5. 集成到现有更新流程，替换原有的单线程下载
6. 跨平台兼容（Windows + macOS）

## 架构设计

### 模块结构

```
src/main/core/
├── downloadEngine/
│   ├── index.ts              # MultiThreadDownloadEngine 类
│   ├── config/
│   │   └── index.ts          # 配置常量
│   └── utils/
│       └── index.ts          # 工具函数

src/main/service/
├── downloadService.ts        # 下载服务（全局单例）

src/renderer/src/views/
├── DownloadManager.vue       # 下载管理页面
```

### 核心组件

#### 1. MultiThreadDownloadEngine（下载引擎核心）

**职责**：多线程分片下载的核心实现

**功能特性**：
- 自动检测服务器是否支持 Range 请求
- 支持多线程分片下载（默认 8 线程）
- 支持单线程下载（服务器不支持 Range 时自动降级）
- 实时进度和速度计算
- 暂停/恢复/取消操作
- 自动合并分片文件

**配置常量**：
```typescript
DEFAULT_THREADS = 8    // 默认线程数
MAX_THREADS = 16       // 最大线程数
MIN_THREADS = 1        // 最小线程数
EMIT_INTERVAL_MS = 160 // 进度推送间隔（毫秒）
MIN_CHUNK_BYTES = 1MB  // 最小分片大小
```

**数据结构**：
```typescript
interface DownloadTaskSnapshot {
  id: string
  url: string
  savePath: string
  fileName: string
  totalBytes: number
  downloadedBytes: number
  progress: number          // 0-1
  speedBytesPerSecond: number
  estimatedFinishAt: number | null
  threads: number
  status: DownloadTaskStatus
  errorMessage?: string
  createdAt: number
  updatedAt: number
}

type DownloadTaskStatus = 'downloading' | 'paused' | 'completed' | 'failed' | 'canceled'
```

**工作流程**：
```
startDownload()
  → probeRemoteFile()  // HEAD 请求检测文件信息
  → 检查是否支持 Range
  → 创建临时目录和分片文件
  → 执行下载
    → 支持 Range: 多线程并行下载分片
    → 不支持 Range: 单线程下载
  → 合并分片文件
  → 清理临时文件
  → 标记任务完成
```

#### 2. DownloadService（下载服务）

**职责**：封装下载引擎，提供全局服务

**功能特性**：
- 全局单例模式
- 任务持久化（保存到 `userData/download-tasks.json`）
- IPC 接口注册
- 进度广播到所有可见窗口
- 任务列表管理

**IPC 接口**：

| 频道 | 方向 | 功能 |
|------|------|------|
| `download:start` | 渲染→主（双向） | 开始下载任务 |
| `download:pause` | 渲染→主（双向） | 暂停下载 |
| `download:resume` | 渲染→主（双向） | 恢复下载 |
| `download:cancel` | 渲染→主（双向） | 取消下载 |
| `download:remove` | 渲染→主（双向） | 移除任务 |
| `download:list` | 渲染→主（双向） | 获取任务列表 |
| `download:get` | 渲染→主（双向） | 获取单个任务详情 |
| `download:pick-save-path` | 渲染→主（双向） | 选择保存路径 |
| `download:task-updated` | 主→渲染（单向） | 任务状态更新推送 |

**持久化策略**：
- 任务状态变更时防抖保存（600ms）
- 最多保留 200 条历史任务
- 应用重启后，`downloading` 状态的任务标记为 `failed`

**使用示例**：
```typescript
import { downloadService } from './service/downloadService'

// 开始下载
const task = await downloadService.startDownload({
  url: 'https://example.com/file.zip',
  savePath: '/path/to/save/file.zip',
  threads: 8
})

// 暂停下载
downloadService.pauseDownload(task.id)

// 恢复下载
await downloadService.resumeDownload(task.id)

// 取消下载
downloadService.cancelDownload(task.id)

// 获取任务列表
const tasks = downloadService.listTasks()
```

#### 3. DownloadManager.vue（下载管理页面）

**职责**：提供下载任务的可视化管理界面

**功能特性**：
- 显示所有下载任务列表
- 实时显示每个任务的：文件名、进度、速度、状态
- 操作按钮：暂停/恢复、取消、移除、打开文件/文件夹
- 空状态提示
- 监听主进程推送，实时更新

**UI 布局**：
```
┌─────────────────────────────────────┐
│  下载管理                     [+添加] │
├─────────────────────────────────────┤
│  📄 file.zip                        │
│  ████████░░░░ 75%  2.3 MB/s  12s    │
│  [暂停] [取消] [打开文件夹]          │
├─────────────────────────────────────┤
│  📄 image.png                       │
│  ✅ 已完成                           │
│  [打开文件] [打开文件夹] [移除]       │
└─────────────────────────────────────┘
```

**状态显示**：
- `downloading` - 显示进度条 + 速度 + 剩余时间
- `paused` - 显示已下载进度 + 暂停标识
- `completed` - 显示完成状态 + 打开按钮
- `failed` - 显示错误信息 + 重试按钮
- `canceled` - 显示已取消 + 移除按钮

**样式**：与现有页面风格一致（蓝粉渐变按钮、圆角卡片）

### 与现有模块的集成

#### 1. GitHub 更新服务集成

修改 `src/main/service/githubUpdateService.ts`，将下载逻辑替换为使用新的下载服务。

**改动点**：
```typescript
// 原来：使用 electron net 直接下载
const response = await net.request(url)

// 改为：使用多线程下载服务
await downloadService.startDownload({
  url: assetUrl,
  savePath: localPath,
  threads: 4  // 更新下载用 4 线程即可
})
```

**注意**：
- 更新下载使用较少线程（4 线程），避免占用过多带宽
- 更新下载不需要持久化（临时文件，下载完直接安装）

#### 2. 更新窗口进度集成

修改 `src/main/frame/UpdateNewFrame.ts`，集成下载进度显示。

**新增 IPC 通道**：
```
to-renderer-UpdateNew:download-progress  // 主→渲染：下载进度推送
to-renderer-UpdateNew:download-complete  // 主→渲染：下载完成
to-renderer-UpdateNew:download-error     // 主→渲染：下载失败
```

**进度数据结构**：
```typescript
interface DownloadProgress {
  progress: number              // 0-100 百分比
  speedBytesPerSecond: number   // 下载速度
  downloadedBytes: number       // 已下载字节
  totalBytes: number            // 总字节
  estimatedFinishAt: number | null  // 预计完成时间戳
}
```

**工作流程**：
```
用户点击更新 → UpdateNewFrame 显示
  → 调用 downloadService.startDownload()
  → downloadService 监听 onTaskUpdated 回调
  → 通过 IPC 推送进度到 UpdateNewFrame
  → UpdateNewFrame 更新进度条 UI
  → 下载完成 → 显示安装按钮
```

#### 3. 主页面菜单集成

修改 `src/main/frame/MainPageFrame.ts`，在侧边栏添加下载管理菜单项。

**菜单项**：
```
📋 剪贴板管理
🌐 翻译
📥 下载管理  ← 新增
⚙️ 设置
```

## 跨平台兼容性

### 路径处理
- 使用 `path.join()`、`path.dirname()` 等 Node.js 路径函数
- 使用 `app.getPath('userData')` 获取应用数据目录
- 使用 `app.getPath('downloads')` 获取下载目录

### 文件操作
- 使用 `fs/promises` 异步 API
- 使用 `fs.createReadStream()` 和 `fs.createWriteStream()` 流式处理

### macOS 特殊处理
- 下载管理页面菜单位置与 Windows 一致（主页面侧边栏）
- 使用系统原生文件对话框选择保存路径

## 文件清单

### 新增文件
| 文件路径 | 说明 |
|----------|------|
| `src/main/core/downloadEngine/index.ts` | 下载引擎核心类 |
| `src/main/core/downloadEngine/config/index.ts` | 配置常量 |
| `src/main/core/downloadEngine/utils/index.ts` | 工具函数 |
| `src/main/service/downloadService.ts` | 下载服务 |
| `src/renderer/src/views/DownloadManager.vue` | 下载管理页面 |

### 修改文件
| 文件路径 | 修改内容 |
|----------|----------|
| `src/main/frame/MainPageFrame.ts` | 添加下载管理菜单 |
| `src/main/frame/UpdateNewFrame.ts` | 集成下载进度 |
| `src/main/service/githubUpdateService.ts` | 使用下载服务 |
| `src/renderer/src/router/routes.ts` | 添加路由 |
| `src/renderer/src/views/MainPage.vue` | 添加菜单项 |

## 验证方案

### 功能验证
1. 下载单个文件（单线程模式）
2. 下载大文件（多线程模式，验证进度和速度）
3. 暂停/恢复下载
4. 取消下载
5. 应用重启后恢复任务
6. 更新下载功能正常
7. 更新窗口进度显示正常

### 跨平台验证
1. Windows 平台功能正常
2. macOS 平台功能正常
3. 路径处理正确

### 性能验证
1. 多线程下载速度明显优于单线程
2. 进度更新流畅（160ms 间隔）
3. 内存占用合理

## 风险与注意事项

1. **服务器兼容性**：部分服务器可能限制并发连接数，需要适当调整线程数
2. **网络环境**：弱网环境下可能需要增加超时时间和重试机制
3. **磁盘空间**：大文件下载需要确保足够的磁盘空间
4. **文件权限**：macOS 可能需要额外的文件权限处理

## 后续扩展

1. 下载速度限制功能
2. 下载队列管理
3. 断点续传优化
4. 下载历史记录
5. 批量下载支持
