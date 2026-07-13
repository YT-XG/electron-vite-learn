# Electron-Vite-Learn 项目 AI 辅助开发指南

## 目录索引

```
electron-vite-learn/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts            # 主进程入口，应用生命周期管理
│   │   ├── service/            # 主进程服务
│   │   │   ├── trayService.ts      # 系统托盘服务
│   │   │   ├── clipboardService.ts # 剪贴板历史服务（sql.js SQLite）
│   │   │   ├── inputService.ts    # 模拟输入服务（键盘模拟，跨平台粘贴）
│   │   │   ├── settingsService.ts # 应用设置服务（持久化到 settings.json）
│   │   │   ├── translateService.ts # 翻译服务（MyMemory API + SQL.js 历史存储）
│   │   │   ├── claudeCodeService.ts # Claude Code 监控服务（Hook + HTTP 服务器）
│   │   │   ├── githubUpdateService.ts # GitHub 更新服务（从 GitHub Releases 检查和下载更新）
│   │   │   ├── downloadService.ts  # 下载服务（多线程分片下载、任务持久化）
│   │   │   ├── searchService.ts   # 搜索服务（工具、剪贴板、应用搜索）
│   │   │   ├── textShareService.ts # 文本分享服务（发送/接收文本，复用设备发现）
│   │   │   └── shellIntegrationService.ts # Shell 集成服务（Windows右键菜单/macOS服务注册）
│   │   ├── frame/              # 窗口框架（封装所有窗口逻辑）
│   │   │   ├── index.ts        # 统一导出
│   │   │   ├── BaseFrame.ts    # 窗口基类（通用逻辑）
│   │   │   ├── NoticeNewFrame.ts   # 通知弹窗（底部居中，支持翻译按钮）
│   │   │   ├── PermissionNoticeFrame.ts # 权限确认弹窗（Claude Code 权限请求交互）
│   │   │   ├── UpdateNewFrame.ts # 更新窗口（底部居中弹出，含局域网更新逻辑）
│   │   │   ├── MainPageFrame.ts  # 主页面窗口（无边框，屏幕正中心显示）
│   │   │   ├── SearchBoxFrame.ts  # 搜索框窗口（全局搜索，快捷键呼出）
│   │   │   ├── MarkdownPreviewFrame.ts # Markdown 预览窗口（多标签页分屏预览）
│   │   │   ├── ContextMenuFrame.ts # 右键菜单窗口（Markdown 编辑器菜单）
│   │   │   ├── SnippetPickerFrame.ts # 片段选择窗口（Ctrl+Shift+V 呼出，搜索并快速插入片段）
│   │   │   ├── ShareSelectFrame.ts # 设备选择弹窗（选择联机设备发送文本）
	│   │   │   ├── PopupManager.ts    # 统一弹窗管理器（管理所有底部弹窗）
│   │   │   ├── PopupItem.ts       # 弹窗元数据（封装窗口实例和动画）
│   │   │   ├── WindowFactory.ts # 窗口工厂（统一管理）
│   │   │   ├── QuickShareFrame.ts # 文件快捷分享弹窗（选择设备发送文件）
│   │   │   ├── JsonToolFrame.ts  # JSON 工具窗口（格式化/压缩/校验）
│   │   │   └── TransferConfirmFrame.ts # 文件传输确认弹窗（接收方确认/拒绝）
│   │   ├── core/              # 核心功能模块
│   │   │   └── downloadEngine/  # 多线程下载引擎
│   │   │       ├── index.ts    # MultiThreadDownloadEngine 类
│   │   │       ├── config/      # 下载引擎配置
│   │   │       │   └── index.ts # 配置常量（线程数、进度推送间隔、分片大小）
│   │   │       └── utils/       # 工具函数
│   │   │           └── index.ts # 工具函数
│   │   └── utils/              # 主进程工具函数
│   │       ├── platform.ts     # 平台相关工具函数（macOS/Windows 差异处理）
│   │       └── pinyinUtils.ts  # 拼音首字母匹配工具函数
│   ├── preload/                 # 预加载脚本
│   │   ├── index.ts            # 预加载脚本入口，暴露安全 API
│   │   └── index.d.ts          # 类型定义
│   └── renderer/               # 渲染进程（Vue 3 前端）
│       ├── index.html          # HTML 入口
│       └── src/
│           ├── main.ts         # Vue 应用入口
│           ├── App.vue         # 根组件
│           ├── env.d.ts        # 环境类型声明
│           ├── router/         # 路由配置
│           │   ├── index.ts    # 路由实例和路由表
│           │   ├── routes.ts   # 路由定义
│           │   └── guards.ts   # 导航守卫
│           ├── store/          # Pinia 状态管理
│           ├── views/          # 页面视图组件
│           │   ├── About.vue  # 关于页
│           │   ├── Notice.vue # 通知窗口（剪贴板通知）
│           │   ├── NoticeNew.vue   # 通知弹窗（蓝粉渐变胶囊样式，支持翻译按钮）
│           │   ├── UpdateNew.vue   # 更新窗口（底部居中弹出）
│           │   ├── MainPage.vue  # 主页面（侧边栏布局，托盘左键打开）
│           │   ├── ClipboardManager.vue # 剪贴板管理（历史记录 + 片段）
│           │   ├── Translate.vue    # 翻译页面
│           │   ├── PermissionNotice.vue # 权限确认弹窗（Claude Code 权限请求交互）
│           │   ├── SearchBox.vue    # 搜索框组件（全局搜索）
│           │   ├── MarkdownPreview.vue # Markdown 预览组件（多标签页分屏）
│           │   ├── ContextMenu.vue  # 右键菜单组件（Markdown 编辑器菜单）
│           │   ├── SnippetPicker.vue # 片段选择组件（Ctrl+Shift+V 呼出，搜索并快速插入片段）
│           │   ├── Online.vue       # 联机页面（设备发现/搜索/状态展示）
│           │   ├── ShareSelect.vue  # 设备选择弹窗（分享文本时选择目标设备）
│           │   ├── Shortcuts.vue # 快捷键设置（全局快捷键、片段选择、搜索框自定义）
│           │   ├── Settings.vue # 设置页面
│           │   ├── Test.vue   # 测试页面
│           │   └── tools/      # 工具页面
│           │       └── Toolbox.vue  # 工具箱页面
│           ├── components/     # 可复用组件
│           │   └── EmptyState.vue    # 统一空状态组件
│           ├── composables/    # 组合式函数
│           ├── utils/          # 工具函数
│           │   └── pinyinSearch.ts # 拼音首字母搜索工具
│           └── assets/         # 静态资源（CSS、图片）
│               ├── base.css
│               ├── main.css
│               ├── electron.svg
│               └── wavy-lines.svg
├── docs/                       # 详细模块文档
│   ├── main.md                 # 主进程入口 + 系统托盘 + 工具函数 + 预加载
│   ├── frames.md               # 所有窗口框架（BaseFrame + 各Frame + PopupManager）
│   ├── services.md             # 所有主进程服务
│   ├── renderer.md             # 渲染进程（路由、状态管理、组件、工具函数）
│   └── views.md                # 所有页面视图
├── types/                      # 类型声明
├── build/                      # 构建配置
├── .github/                    # GitHub Actions CI/CD
│   └── workflows/
│       └── build.yml           # 多平台构建配置（Linux/macOS/Windows）
├── resources/                  # 应用资源（图标等）
├── electron.vite.config.ts     # Electron-Vite 配置
├── electron-builder.yml        # 打包配置
├── .gitattributes              # Git 行尾符配置
├── .prettierrc.yaml            # Prettier 格式化配置
├── .editorconfig               # 编辑器配置
├── tsconfig.json               # TypeScript 基础配置
├── tsconfig.node.json          # Node.js TypeScript 配置
└── tsconfig.web.json           # 浏览器 TypeScript 配置
```

## 技术栈

- **框架**: Electron 28 + Vue 3.4 + TypeScript 5.3
- **构建工具**: Vite 5 + electron-vite 2
- **路由**: Vue Router 4
- **状态管理**: Pinia
- **HTTP 请求**: Axios
- **包管理**: npm
- **代码规范**: ESLint + Prettier
- **打包工具**: electron-builder 24

## 开发命令

```bash
npm run dev          # 开发模式（热重载）
npm run typecheck    # 类型检查
npm run build        # 构建应用
npm run build:win    # 打包 Windows
npm run build:mac    # 打包 macOS
npm run build:linux  # 打包 Linux
npm run format       # 代码格式化
npm run lint         # 代码检查
```

## 模块文档

各模块详细设计、功能说明、IPC 接口、数据库结构等见 `docs/` 目录：
- **[docs/main.md](docs/main.md)** — 主进程入口、系统托盘、工具函数、预加载脚本
- **[docs/frames.md](docs/frames.md)** — 所有窗口框架（BaseFrame、WindowFactory、PopupManager 及各窗口）
- **[docs/services.md](docs/services.md)** — 所有主进程服务（剪贴板、模拟输入、设置、翻译、文本分享、Claude Code 监控、GitHub 更新、下载、搜索）
- **[docs/renderer.md](docs/renderer.md)** — 渲染进程（路由、状态管理、组件、组合式函数、工具函数）
- **[docs/views.md](docs/views.md)** — 所有页面视图

---

## ⚠️ 必须遵守的规范和规则

### 0. AI 响应规则
- 【重要】回答前优先判断是否有合适的 **superpowers 下的 skill** 可用，若有则必须先使用 skill 再响应
- 若判断当前任务没有合适的 skill 可匹配，则忽略此规则正常处理

### 1. 代码修改规范
- 如果改动涉及文件删除/添加，必须更新本文件的**目录索引**
- 不要 git 提交无关的文件
- 修改代码后必须执行 `npm run typecheck` 编译检查是否有报错，**不需要启动应用**
- 【重要】模块业务逻辑、数据库结构发生更改后，必须同步更新 `docs/` 下对应文档
- 在遇到用户需求模糊时**必须**向用户提问，不要自己猜
- 【重要】**跨平台兼容性**：项目同时支持 Windows 和 macOS
  - 使用 `process.platform` 检测平台差异
  - 路径处理：Windows 使用 `\` 或 UNC 路径，macOS 使用 `/` 或 SMB 挂载路径
  - 焦点管理：Windows 使用 `minimize()`，macOS 使用 `hide()` + `app.hide()`
  - 快捷键：Windows 使用 `Ctrl`，macOS 使用 `Command`
  - 文件操作：注意跨平台路径分隔符和权限差异

### 2. 窗口框架规范（必须遵守）
- **创建窗口时必须继承 `BaseFrame`**，复用通用逻辑（窗口创建、IPC 注册、生命周期管理）
- **四种通信方式命名规范**：
  - `recvOne` — 渲染→主 单向（通知模式）
  - `recvTwo` — 渲染→主 双向（请求模式）
  - `sendOne` — 主→渲染 单向（通知模式）
  - `sendTwo` — 主→渲染 双向（请求模式）
- **频道命名规范**：
  - 主→渲染：`to-renderer-{渲染组件名}:{方法名}`
  - 渲染→主：`to-main-{主进程窗口名}:{方法名}`

### 3. 服务类通信规范
- Service 是全局单例，使用 `ipcMain.handle()` / `ipcMain.on()` 全局注册，不绑定特定窗口
- **频道命名规范**：
  - 渲染→服务：`to-service-{ServiceName}:{方法名}`
  - 服务→渲染：广播事件使用 `broadcast:{事件名}`
- 广播到所有窗口：遍历 `BrowserWindow.getAllWindows()` 发送

### 4. 代码注释规范
- 每个函数/方法上方必须有 JSDoc 注释，说明功能、参数和返回值
- 复杂逻辑或关键代码行上方添加行内注释，解释"为什么这样做"
- 注释应简洁明了，不要重复代码本身能表达的内容

### 5. 文档更新要求（强制）

**修改代码后，必须同步更新相关文档！**

| 变更场景 | 需更新文档 |
|---------|-----------|
| 新增/删除/重命名文件 | 本文件**目录索引** |
| 模块业务逻辑变更 | `docs/` 下对应文档 |
| API 接口变更 | `docs/` 下对应文档 |
| 数据库结构变更 | `docs/` 下对应文档 |
| 新增/修改配置项 | `docs/services.md` |

> 忘记更新文档会导致 AI 辅助开发时产生误解，新成员难以理解项目结构，代码与文档不一致。

### 6. 代码风格
- 使用 TypeScript 严格模式
- Vue 组件使用 `<script setup>` 语法
- 遵循 ESLint 和 Prettier 配置
- 文件命名：camelCase（如 `index.ts`）

### 7. 编译检查
```bash
npm run typecheck    # TypeScript 类型检查（必须执行）
npm run build        # 完整构建检查（包含类型检查）
```

### 8. 避免手写已知可复用的逻辑（强制）

**不要手写以下有成熟 npm 库的场景：**

| 场景 | 禁止的做法 | 正确的做法 |
|------|-----------|-----------|
| 版本号比较 | 手写 `compareVersions()` 解析 `.` 分割的数组 | 使用 `semver` 库（已在依赖中） |
| 中文拼音首字母提取 | 手写汉字→拼音映射表 | 使用 `pinyin-pro` 库 |
| 数据库初始化/CRUD | `clipboardService` / `translateService` 各自手写 95% 相同的 DB 逻辑 | 提取公共 `BaseDBService` 或工具函数 |
| 窗口拖拽 | `mousedown`/`mousemove`/`mouseup` + IPC `setPosition` | 使用 CSS `-webkit-app-region: drag` |

**判断标准：** 如果 npm 上有周下载量 > 10k、维护良好的库能直接解决问题，且该库体量合理，优先用库而非手写。

### 9. 窗口拖拽规范（强制）

- 无边框（`frame: false`）窗口必须使用 CSS `-webkit-app-region: drag` 处理拖拽
- 禁止使用 `mousedown`/`mousemove`/`mouseup` + IPC `setPosition` 手动实现窗口拖动
- 拖拽区域内需要点击交互的子元素使用 `-webkit-app-region: no-drag`
- 禁止同时使用 `setIgnoreMouseEvents` 和手动拖拽——两者会导致鼠标事件冲突

### 10. HTML/模板字符串规范

- 超过 50 行的内联模板字符串必须提取为独立文件（如 `.cjs` / `.html`）
- 打包时通过构建配置（`electron-builder.extraResources`）复制到应用目录

### 11. ⚠️ 禁止动态 require 项目源文件（强制）

**electron-vite 把主进程打包成单文件 `out/main/index.js`，动态 `require()` 项目内部源文件会在运行时找不到模块！**

```typescript
// ❌ 错误：运行时找不到文件
function getXXX() {
  return require('./xxxService').xxxService
}

// ✅ 正确：使用静态 import，编译时打包进 bundle
import { xxxService } from './xxxService'
```

| 可用的 require | 原因 |
|---------------|------|
| `require('fs')` / `require('http')` / `require('path')` 等 | Node.js 内置模块，运行时总有 |
| `require('electron')` | Electron 全局 API，运行时总有 |
| `require('some-npm-package')` | npm 包会被动态处理或打包 |

| 禁止的 require | 原因 |
|---------------|------|
| `require('./xxxService')` / `require('../frame/XXX')` | 项目源文件，打包后不存在独立文件 |

**例外**：如果确有循环依赖，改用延迟加载模式：

```typescript
// 在文件顶部用静态 import（ESM 循环引用 Vite 能正确处理）
import { someService } from './someService'
```

> 犯错记录：`fileTransferService.ts` 曾用 `require('./textShareService')` 绕过循环依赖，导致运行时 `Cannot find module`。改为静态 import 后修复。

## IPC 通信模式

```typescript
// 主进程 → 渲染进程
this.sendOne('to-renderer-{组件名}:{方法}', data)

// 渲染进程 → 主进程（双向）
const result = await this.recvTwo('to-main-{窗口名}:{方法}', args)

// 服务 → 所有窗口
BrowserWindow.getAllWindows().forEach(w => {
  if (!w.isDestroyed() && w.isVisible()) {
    w.webContents.send('broadcast:{事件名}', data)
  }
})
```

## 架构图

```
WindowFactory                          PopupManager
  ├── MainPageFrame                      ├── slots[5] 固定槽位
  ├── SearchBoxFrame                     ├── NoticeNewFrame
  ├── MarkdownPreviewFrame               ├── UpdateNewFrame
  ├── ContextMenuFrame                   ├── PermissionNoticeFrame
  ├── JsonToolFrame                      └── ShareSelectFrame (via PopupManager)
  ├── SnippetPickerFrame
  └── ShareSelectFrame (via WindowFactory)

所有窗口继承 BaseFrame（唯一 new BrowserWindow 入口）
```

## 相关资源

- [Electron-Vite 官方文档](https://electron-vite.org/)
- [Vue 3 文档](https://vuejs.org/)
- [Electron 文档](https://www.electronjs.org/)
