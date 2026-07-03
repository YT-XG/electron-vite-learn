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
│   │   │   └── searchService.ts   # 搜索服务（工具、剪贴板、应用搜索）
│   │   ├── frame/              # 窗口框架（封装所有窗口逻辑）
│   │       ├── index.ts        # 统一导出
│   │       ├── BaseFrame.ts    # 窗口基类（通用逻辑）
│   │       ├── NoticeNewFrame.ts   # 通知弹窗（底部居中，支持翻译按钮）
│   │       ├── NoticeManager.ts    # 通知管理器（多通知堆叠、自定义时长、移动动画）
│   │       ├── PermissionNoticeFrame.ts # 权限确认弹窗（Claude Code 权限请求交互）
│   │       ├── ClaudeCodeStatusFrame.ts # Claude Code 状态通知（常驻状态条）
│   │       ├── UpdateNewFrame.ts # 更新窗口（底部居中弹出，含局域网更新逻辑）
│   │       ├── MainPageFrame.ts  # 主页面窗口（无边框，屏幕正中心显示）
│   │       ├── SearchBoxFrame.ts  # 搜索框窗口（全局搜索，快捷键呼出）
│   │       ├── MarkdownPreviewFrame.ts # Markdown 预览窗口（多标签页分屏预览）
│   │       ├── ContextMenuFrame.ts # 右键菜单窗口（Markdown 编辑器菜单）
│   │       └── WindowFactory.ts # 窗口工厂（统一管理）
│   │   ├── core/              # 核心功能模块
│   │   │   └── downloadEngine/  # 多线程下载引擎
│   │   │       ├── index.ts    # MultiThreadDownloadEngine 类
│   │   │       ├── config/      # 下载引擎配置
│   │   │       │   └── index.ts # 配置常量（线程数、进度推送间隔、分片大小）
│   │   │       └── utils/       # 工具函数
│   │   │           └── index.ts # 工具函数
│   │   └── utils/              # 主进程工具函数
│   │       └── platform.ts     # 平台相关工具函数（macOS/Windows 差异处理）
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
│           │   ├── index.ts    # Store 入口
│           │   ├── userStore.ts # 用户状态管理
│           │   └── noticeStore.ts # 通知状态管理
│           ├── views/          # 页面视图组件
│           │   ├── About.vue  # 关于页
│           │   ├── Notice.vue # 通知窗口（剪贴板通知）
│           │   ├── NoticeNew.vue   # 通知弹窗（蓝粉渐变胶囊样式，支持翻译按钮）
│           │   ├── UpdateNew.vue   # 更新窗口（底部居中弹出）
│           │   ├── MainPage.vue  # 主页面（侧边栏布局，托盘左键打开）
│           │   ├── ClipboardManager.vue # 剪贴板管理（历史记录 + 收藏）
│           │   ├── Translate.vue    # 翻译页面
│           │   ├── PermissionNotice.vue # 权限确认弹窗（Claude Code 权限请求交互）
│           │   ├── ClaudeCodeStatus.vue # Claude Code 状态通知（常驻状态条）
│           │   ├── SearchBox.vue    # 搜索框组件（全局搜索）
│           │   ├── MarkdownPreview.vue # Markdown 预览组件（多标签页分屏）
│           │   ├── ContextMenu.vue  # 右键菜单组件（Markdown 编辑器菜单）
│           │   ├── Test.vue   # 测试页面
│           │   └── tools/      # 工具页面
│           │       └── Toolbox.vue  # 工具箱页面
│           ├── components/     # 可复用组件
│           │   ├── Versions.vue
│           │   ├── BaseDialog.vue    # 统一对话框组件
│           │   └── EmptyState.vue    # 统一空状态组件
│           ├── composables/    # 组合式函数
│           │   └── useTimeFormat.ts  # 时间格式化工具
│           ├── utils/          # 工具函数
│           │   ├── request.ts  # HTTP 请求工具
│           │   └── pinyinSearch.ts # 拼音首字母搜索工具
│           └── assets/         # 静态资源（CSS、图片）
│               ├── base.css
│               ├── main.css
│               ├── electron.svg
│               └── wavy-lines.svg
├── types/                      # 类型声明
├── build/                      # 构建配置
├── .github/                    # GitHub Actions CI/CD
│   └── workflows/
│       └── build.yml           # 多平台构建配置（Linux/macOS/Windows）
├── resources/                  # 应用资源（图标等）
├── .github/
│   └── workflows/
│       └── build.yml           # GitHub Actions 自动构建（macOS）
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

## 模块说明

### 主进程 (src/main/)
- **职责**: 管理应用生命周期、创建窗口、处理系统级操作
- **关键文件**:
  - `index.ts` - 主进程入口，应用生命周期管理
  - `trayService.ts` - 系统托盘服务（支持 macOS 菜单栏和 Windows 托盘）
  - `clipboardService.ts` - 剪贴板历史服务（sql.js SQLite 持久化）
  - `inputService.ts` - 模拟输入服务（跨平台键盘模拟，支持自动粘贴）
  - `utils/platform.ts` - 平台工具函数（macOS/Windows 差异处理，如 Dock 高度计算）
- **依赖**: electron, @electron-toolkit/utils, sql.js, @nut-tree/nut-js

### 窗口框架 (src/main/frame/)
- **职责**: 封装所有窗口的通用逻辑，提供统一的窗口管理接口
- **关键文件**:
  - `BaseFrame.ts` - 窗口基类，封装创建、销毁、IPC 通信等通用逻辑
  - `NoticeNewFrame.ts` - 通知弹窗，底部居中显示，蓝粉渐变胶囊风格，支持翻译按钮（仅剪贴板通知显示），时长由 NoticeManager 管理
  - `NoticeManager.ts` - 通知管理器，管理多个通知窗口实例，支持通知堆叠、自定义时长和移动动画
  - `UpdateNewFrame.ts` - 更新窗口，底部居中弹出，包含局域网更新完整逻辑
  - `MainPageFrame.ts` - 主页面窗口，无边框，屏幕正中心显示，左键托盘打开
  - `WindowFactory.ts` - 窗口工厂，统一管理所有窗口的创建和生命周期
- **设计模式**: 工厂模式 + 模板方法模式
- **IPC 通信方式**:
  - `recvOne(channel, handler)` - 渲染→主 单向（通知模式）
  - `recvTwo(channel, handler)` - 渲染→主 双向（请求模式）
  - `sendOne(channel, ...data)` - 主→渲染 单向（通知模式）
  - `sendTwo(channel, timeout, ...args)` - 主→渲染 双向（请求模式）
- **使用方式**:
  ```typescript
  import { windowFactory } from './frame'

  // 显示通知弹窗（底部居中，通过 NoticeManager 管理）
  windowFactory.getNoticeManager().show({
    text: '剪贴板内容',
    showTranslate: true,
    duration: 5000
  })

  // 显示更新通知（不显示翻译按钮）
  windowFactory.getNoticeManager().show({
    text: '正在检查更新...',
    duration: 3000
  })

  // 显示更新窗口（底部居中弹出）
  windowFactory.showUpdateNew({ version: '1.0.1', description: '修复了一些 bug' })

  // 显示/隐藏主页面（左键托盘自动调用）
  windowFactory.getMainPageFrame().showCentered()
  ```

### 通知弹窗 (src/main/frame/NoticeNewFrame.ts)
- **职责**: 底部居中弹出的通知提示窗口，支持翻译按钮和打开链接按钮
- **功能**:
  - 窗口宽度固定为屏幕宽度（透明背景），给渲染进程更多扩展空间
  - 通知卡片在窗口内居中显示，宽度根据文字内容自动适应（160px~500px）
  - 透明区域鼠标穿透，仅卡片区域可交互
  - 屏幕底部定位（距底部 60px）
  - 按需创建，不自动启动
  - 带有弹出/收起 CSS 动画
  - 透明无边框窗口，蓝粉渐变胶囊风格
  - 显示时长由 NoticeManager 管理（可自定义）
  - **不抢占焦点**：使用 `showInactive()` 显示窗口，避免影响搜索框等前台窗口
  - **翻译按钮**：仅剪贴板复制文字时显示，其他通知（如检查更新）不显示
  - **打开链接按钮**：自动检测文本中是否包含链接，如果包含则显示打开链接按钮（绿色渐变）
- **IPC 接口**:
  - `to-main-NoticeNewFrame:ready` - 渲染进程已就绪，触发消息发送
  - `to-renderer-NoticeNewFrame:sendMsg` - 主进程发送通知消息（包含 showTranslate、showOpenLink 参数）
  - `to-main-NoticeNewFrame:mouse-enter-card` - 鼠标进入通知卡片区域（关闭鼠标穿透）
  - `to-main-NoticeNewFrame:mouse-leave-card` - 鼠标离开通知卡片区域（恢复鼠标穿透）
  - `to-main-NoticeNewFrame:translate` - 翻译按钮点击，打开翻译页面
  - `to-main-NoticeNewFrame:openLink` - 打开链接按钮点击，使用系统默认浏览器打开链接
- **公开方法**:
  - `setMsg(text, showTranslate?)` - 设置通知消息，自动检测链接并设置 showOpenLink
  - `showAtBottomCenter()` - 在屏幕底部居中显示通知弹窗
- **使用方式**:
  ```typescript
  import { windowFactory } from './frame'

  // 获取通知弹窗实例
  const noticeFrame = windowFactory.getNoticeNewFrame()

  // 显示剪贴板通知（显示翻译按钮）
  noticeFrame.setMsg('复制的文本内容', true)
  noticeFrame.showAtBottomCenter()

  // 显示包含链接的通知（自动显示打开链接按钮）
  noticeFrame.setMsg('请访问 https://example.com 查看详情')
  noticeFrame.showAtBottomCenter()

  // 显示其他通知（不显示翻译按钮和打开链接按钮）
  noticeFrame.setMsg('正在检查更新...')
  noticeFrame.showAtBottomCenter()
  ```

### 通知管理器 (src/main/frame/NoticeManager.ts)
- **职责**: 管理多个通知窗口实例，支持通知堆叠、自定义时长和移动动画，以及 Claude Code 常驻状态通知
- **功能**:
  - 维护通知实例池（最多 5 个）
  - 新通知从底部出现，旧通知被向上顶起
  - 平滑过渡动画（300ms easeOutCubic）
  - 每个通知可自定义显示时长
  - 超过上限时自动销毁最早的通知
  - **Claude Code 状态管理**: 管理常驻状态通知的显示/更新/隐藏/销毁
- **IPC 接口**: 无（内部管理，不直接暴露 IPC）
- **使用方式**:
  ```typescript
  import { windowFactory } from './frame'

  // 显示剪贴板通知（显示翻译按钮，5秒后自动销毁）
  windowFactory.getNoticeManager().show({
    text: '复制的文本内容',
    showTranslate: true,
    duration: 5000
  })

  // 显示更新通知（3秒后自动销毁）
  windowFactory.getNoticeManager().show({
    text: '正在检查更新...',
    duration: 3000
  })

  // 显示包含链接的通知（自动检测并显示打开链接按钮）
  windowFactory.getNoticeManager().show({
    text: '请访问 https://example.com 查看详情'
  })

  // 显示 Claude Code 状态通知（常驻显示）
  windowFactory.getNoticeManager().showClaudeCodeStatus('running', '🟢 Claude Code 会话运行中')

  // 更新 Claude Code 状态
  windowFactory.getNoticeManager().updateClaudeCodeStatus('waiting_permission', '⏳ 等待权限: Bash')

  // 隐藏 Claude Code 状态通知（带淡出动画）
  windowFactory.getNoticeManager().hideClaudeCodeStatus()

  // 销毁 Claude Code 状态通知
  windowFactory.getNoticeManager().destroyClaudeCodeStatus()
  ```

### 更新窗口 (src/main/frame/UpdateNewFrame.ts)
- **职责**: 底部居中弹出的更新提示窗口，包含完整的局域网更新逻辑
- **功能**:
  - 屏幕底部居中定位（距底部 60px，macOS 自动适配 Dock 高度）
  - 按需创建，不自动启动
  - 带有弹出/收起 CSS 动画
  - 透明无边框窗口，玻璃拟态卡片风格
  - 蓝粉配色（#3d8bff / #ff6ab0）
  - 显示版本号、更新说明、下载进度条
  - 底部装饰旋转环
  - 局域网更新：读取 SMB 共享文件夹的 `latest.yml` 版本信息
  - 本地缓存检查：优先检查本地是否已下载该版本
  - 下载进度实时显示
  - 下载完成后显示安装按钮
  - **跨平台安装**：Windows 启动 `.exe`，macOS 支持 `.dmg`（挂载）和 `.app`（直接启动）
  - **跨平台路径验证**：自动检测平台，提供友好的错误提示（macOS 提示挂载共享文件夹）
  - **自动清理缓存**：安装前自动清理 `update-cache` 目录下的旧安装包，释放磁盘空间
- **IPC 接口**:
  - `update-new:ready` - 渲染进程已就绪，触发检查更新
  - `update-new:download` - 渲染进程请求下载更新
  - `update-new:install` - 渲染进程请求安装更新
  - `update-new:hide` - 渲染进程请求隐藏窗口
  - `update-new:destroy` - 渲染进程请求销毁窗口
  - `lan-update-progress` - 主进程发送下载进度
  - `lan-update-downloaded` - 主进程发送下载完成通知
  - `lan-update-error` - 主进程发送错误信息
- **配置方式**:
  - 设置页面: 用户可在「设置 → 更新服务器」中修改路径
  - Windows 默认值: `\\10.15.8.28\dist`（UNC 路径）
  - macOS 默认值: `/Volumes/dist`（需先在 Finder 中挂载 SMB 共享）
  - macOS 挂载方法: Finder → 前往 → 连接服务器（⌘K）→ 输入 `smb://10.15.8.28/dist`
- **使用方式**:
  ```typescript
  import { windowFactory } from './frame'

  // 显示更新窗口（按需创建）
  windowFactory.showUpdateNew({ version: '1.0.1', description: '修复了一些 bug' })

  // 隐藏更新窗口
  windowFactory.getUpdateNewFrame().hide()
  ```

### 主页面窗口 (src/main/frame/MainPageFrame.ts)
- **职责**: 无边框主窗口，左键点击托盘图标打开，初始位置屏幕正中心
- **功能**:
  - 800x600 透明无边框窗口（最小尺寸 600x450）
  - 始终悬浮屏幕最上方（alwaysOnTop: true）
  - 支持拖拽缩放（resizable: true）
  - 左键点击托盘图标切换显示/隐藏
  - 初始位置在屏幕正中心
  - 自定义标题栏：app 名称 + 版本号 + 最小化/关闭按钮
  - 顶部渐变色条（蓝→粉，品牌标识）
  - 入场动画：scale + opacity 弹性过渡
  - 侧边栏布局：左侧菜单栏（支持收缩/展开） + 右侧内容区
  - **翻译跳转**：支持从通知弹窗跳转到翻译页面并自动填充文本
  - **跨平台焦点恢复**：
    - Windows: `minimize()` 自动恢复焦点到上一个窗口
    - macOS: `hide()` + `app.hide()` 隐藏应用，让系统焦点回到上一个应用
- **IPC 接口**:
  - `main-page:minimize` - 最小化窗口
  - `main-page:ready` - 渲染进程已就绪，触发版本号发送
  - `main-page:version` - 主进程发送应用版本号
  - `to-main-MainPage:openTranslate` - 从剪贴板历史记录跳转到翻译页面
  - `to-renderer-MainPage:setPage` - 主进程发送页面切换指令
  - `close-window` - 关闭/隐藏窗口（继承自 BaseFrame）
- **公开方法**:
  - `showCentered()` - 在屏幕正中心显示/隐藏窗口（toggle）
  - `showAndTranslate(text)` - 显示窗口并跳转到翻译页面（不触发退场动画）
  - `openTranslate(text)` - 打开翻译页面并填充指定文本（窗口需已显示）
- **使用方式**:
  ```typescript
  import { windowFactory } from './frame'

  // 左键点击托盘自动调用
  windowFactory.getMainPageFrame().showCentered()

  // 显示窗口并跳转到翻译页面（从通知弹窗调用）
  windowFactory.getMainPageFrame().showAndTranslate('要翻译的文本')
  ```

### 剪贴板历史服务 (src/main/service/clipboardService.ts)
- **职责**: 剪贴板历史记录的存储、查询、推送
- **功能**:
  - 使用 sql.js（纯 JS SQLite）持久化存储，数据文件位于 userData/clipboard.db
  - 每秒监控剪贴板变化，新内容自动入库（自动去重）
  - 支持分页查询、搜索、删除、清空
  - 变化时通过 IPC 推送到可见窗口
  - 自动清理 30 天前的过期数据，最多保留 1000 条
  - **收藏独立存储**：支持手动添加、分类管理、编辑、删除
- **数据库表结构**:
  - **clipboard_history 表（历史记录）**:
    - `id` INTEGER PRIMARY KEY AUTOINCREMENT
    - `content` TEXT - 剪贴板内容
    - `created_at` INTEGER - 创建时间戳
  - **favorites 表（收藏）**:
    - `id` INTEGER PRIMARY KEY AUTOINCREMENT
    - `content` TEXT - 收藏内容
    - `category` TEXT DEFAULT '' - 分类（如：Linux命令、常用代码）
    - `description` TEXT DEFAULT '' - 描述/备注
    - `created_at` INTEGER - 创建时间戳
- **IPC 接口**:
  - **历史记录**:
    - `clipboard-history:get` - 获取历史记录（分页）
    - `clipboard-history:search` - 搜索历史记录
    - `clipboard-history:delete` - 删除一条记录
    - `clipboard-history:clearAll` - 清空所有历史记录
    - `clipboard-history:new` - 推送新记录到渲染进程
  - **收藏**:
    - `favorites:getAll` - 获取所有收藏列表
    - `favorites:getByCategory` - 按分类获取收藏列表
    - `favorites:getCategories` - 获取所有分类及其数量
    - `favorites:add` - 手动添加收藏
    - `favorites:update` - 更新收藏内容
    - `favorites:delete` - 删除收藏
    - `favorites:clearAll` - 清空所有收藏

### 模拟输入服务 (src/main/service/inputService.ts)
- **职责**: 封装键盘模拟功能，支持跨平台的自动粘贴和焦点窗口管理
- **功能**:
  - 使用 @nut-tree/nut-js 实现跨平台键盘模拟
  - 自动识别操作系统：macOS 用 Cmd+V，Windows/Linux 用 Ctrl+V
  - 支持剪贴板管理器点击记录后自动粘贴到上一个聚焦的窗口
  - Windows 平台支持焦点窗口保存和恢复（通过 PowerShell 调用 user32.dll）
- **IPC 接口**:
  - `input:paste` - 仅模拟粘贴操作（Ctrl+V 或 Cmd+V）
  - `input:paste-to-previous` - 恢复焦点到上一个窗口并粘贴
  - `input:save-active-window` - 保存当前焦点窗口句柄
- **依赖**: @nut-tree/nut-js
- **使用方式**:
  ```typescript
  import { inputService } from './service/inputService'

  // 在主进程启动时自动初始化
  // 显示主页面前调用
  inputService.saveActiveWindow()

  // 点击记录后调用
  inputService.pasteToPreviousWindow()
  ```

### 应用设置服务 (src/main/service/settingsService.ts)
- **职责**: 管理 settings.json 中的用户配置，支持全局快捷键、更新服务器地址、翻译 API 配置和开机自启
- **功能**:
  - 设置持久化到 userData/settings.json
  - 支持快捷键自定义（跨平台 CommandOrControl 格式）
  - 支持局域网更新服务器路径配置（**跨平台自动适配**）
  - 支持翻译 API 地址和 Key 配置（可选，用于自定义翻译服务）
  - 支持开机自启动（通过 Electron app.setLoginItemSettings 实现）
  - 热重载：update() 后立即重新注册全局快捷键和开机自启
  - 边界处理：文件损坏/不存在时自动返回默认值
  - **跨平台路径自动修正**：加载配置时自动检测并修正不匹配当前平台的 serverUrl
  - **更新源切换**：支持局域网更新和 GitHub 更新两种模式
- **配置项**:
  - `shortcut` - 全局快捷键（默认 `CommandOrControl+Alt+V`）
  - `serverUrl` - 局域网更新服务器路径（**跨平台默认值**）
    - Windows 默认: `\\10.15.8.28\dist`（UNC 路径）
    - macOS 默认: `/Volumes/dist`（**macOS 用户只需挂载共享文件夹，无需手动填写路径**）
  - `autoStart` - 开机自启动（默认 `false`）
  - `translateApiUrl` - 翻译 API 地址（可选，默认使用 MyMemory 免费 API）
  - `translateApiKey` - 翻译 API Key（可选，用于自定义翻译服务认证）
  - `updateSource` - 更新源选择（默认 `lan`）
    - `lan`: 局域网更新（从共享文件夹检查更新）
    - `github`: GitHub 更新（从 GitHub Releases 检查更新）
  - `githubRepo` - GitHub 仓库地址（默认 `YT-XG/electron-vite-learn`，格式：owner/repo）
- **macOS 使用方法**:
  1. 在 Finder 中挂载共享文件夹（⌘K → 输入 `smb://10.15.8.28/dist`）
  2. 挂载成功后路径自动为 `/Volumes/dist`，**无需手动填写**
  3. 应用会自动从挂载的共享文件夹检查更新
- **IPC 接口**:
  - `settings:get` - 获取所有设置
  - `settings:update` - 更新设置（合并写入）
- **使用方式**:
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

### 翻译服务 (src/main/service/translateService.ts)
- **职责**: 处理翻译 API 调用和翻译历史管理
- **功能**:
  - 使用 MyMemory API 提供免费翻译，支持自定义 API 配置
  - 使用 sql.js（纯 JS SQLite）持久化存储翻译历史，数据文件位于 userData/translate.db
  - 支持分页查询、删除、清空翻译历史
  - 翻译成功后自动保存历史记录
- **数据库表结构**:
  - **translate_history 表（翻译历史）**:
    - `id` INTEGER PRIMARY KEY AUTOINCREMENT
    - `source_lang` TEXT - 源语言
    - `target_lang` TEXT - 目标语言
    - `source_text` TEXT - 原文
    - `result_text` TEXT - 译文
    - `created_at` INTEGER - 创建时间戳
- **IPC 接口**:
  - `to-service-TranslateService:translate` - 翻译文本
  - `to-service-TranslateService:getHistory` - 获取翻译历史（分页）
  - `to-service-TranslateService:delete` - 删除一条翻译历史
  - `to-service-TranslateService:clearAll` - 清空所有翻译历史
- **使用方式**:
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

### Claude Code 监控服务 (src/main/service/claudeCodeService.ts)
- **职责**: 监控 Claude Code CLI 运行状态，提供权限请求交互和常驻状态通知
- **功能**:
  - **自动启用**: 应用启动时自动安装 Hook 并启动 HTTP 服务器
  - 通过 Hook 脚本拦截 Claude Code 的事件（SessionStart/End, Stop, PermissionRequest）
  - 启动 HTTP 服务器（127.0.0.1:17861）接收 Hook 事件
  - 权限请求：暂存 HTTP 响应，显示权限确认窗口，同时更新常驻状态为"等待权限"
  - 非权限事件：通过 NoticeManager 更新常驻状态通知
  - 支持安装/卸载 Hook 到 ~/.claude/settings.json
  - **状态管理**: 跟踪活跃会话计数，管理常驻状态通知的显示/隐藏
- **工作流程**:
  ```
  应用启动 → 自动安装 Hook → 启动 HTTP 服务器
  Claude Code CLI → Hook 脚本 → HTTP POST → 主进程 HTTP 服务器
      → SessionStart: 显示"会话运行中"状态，5 秒后自动隐藏
      → PermissionRequest: 更新为"等待权限: 工具名"
      → Stop/StopFailure: 短暂显示"任务完成"
      → SessionEnd: 延迟 3 秒隐藏状态通知
  ```
- **IPC 接口**:
  - `to-service-ClaudeCodeService:installHook` - 安装 Hook
  - `to-service-ClaudeCodeService:uninstallHook` - 卸载 Hook
  - `to-service-ClaudeCodeService:resolvePermission` - 解决权限请求
  - `to-service-ClaudeCodeService:isInstalled` - 检查 Hook 是否已安装
  - `to-service-ClaudeCodeService:isRunning` - 检查服务器是否运行
- **使用方式**:
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

### 权限确认弹窗 (src/main/frame/PermissionNoticeFrame.ts)
- **职责**: 底部居中弹出的权限确认窗口，用于 Claude Code 权限请求交互
- **功能**:
  - 显示工具名称、命令内容
  - 提供拒绝/同意/全部同意三个按钮（**AskUserQuestion 工具显示关闭按钮**）
  - 点击按钮后通过 IPC 通知主进程，主进程写回 HTTP 响应
  - 透明无边框窗口，蓝粉渐变胶囊风格
  - 支持鼠标穿透（透明区域可点击）
  - **不抢占焦点**：使用 `showInactive()` 显示窗口，避免影响搜索框等前台窗口
  - **自动隐藏**：权限被解决或超时后，窗口自动淡出隐藏
  - **自动关闭**：当收到 PreToolUse/PostToolUse 事件时，如果权限请求弹窗还在显示，则自动隐藏（适用于 AskUserQuestion 和普通权限请求）
- **IPC 接口**:
  - `to-renderer-PermissionNoticeFrame:show` - 显示权限确认窗口（主进程发送）
  - `to-renderer-PermissionNoticeFrame:hide` - 隐藏窗口（主进程发送，权限解决后）
  - `to-main-PermissionNoticeFrame:resolve` - 用户点击按钮（渲染进程发送）
  - `to-main-PermissionNoticeFrame:destroy` - 销毁窗口（渲染进程发送，动画完成后）
  - `to-main-PermissionNoticeFrame:mouse-enter-card` - 鼠标进入卡片区域
  - `to-main-PermissionNoticeFrame:mouse-leave-card` - 鼠标离开卡片区域
- **使用方式**:
  ```typescript
  import { windowFactory } from './frame'

  // 显示权限确认窗口（由 claudeCodeService 自动调用）
  const noticeFrame = windowFactory.getPermissionNoticeFrame()
  noticeFrame.showPermissionNotice({
    sessionId: 'xxx',
    toolName: 'Bash',
    command: 'rm -rf /tmp/test',
    description: ''
  })
  ```

### Claude Code 状态通知 (src/main/frame/ClaudeCodeStatusFrame.ts)
- **职责**: 底部居中显示的常驻状态条，用于显示 Claude Code 的运行状态
- **功能**:
  - 显示 Claude Code 的当前状态（会话运行中、等待权限确认、任务完成等）
  - 支持更新状态文本（无需销毁重建窗口）
  - 不设置自动销毁定时器，持续显示直到手动隐藏
  - 透明无边框窗口，蓝粉渐变胶囊风格
  - 支持鼠标穿透（透明区域可点击）
  - **不抢占焦点**：使用 `showInactive()` 显示窗口，避免影响搜索框等前台窗口
  - 支持淡入/淡出动画
- **状态类型**:
  - `running` - 🟢 会话运行中
  - `thinking` - 💭 思考中...
  - `executing` - ⚡ 执行任务中
  - `waiting_permission` - ⏳ 等待权限确认
  - `completed` - ✅ 任务完成
- **IPC 接口**:
  - `to-renderer-ClaudeCodeStatusFrame:updateStatus` - 更新状态文本（主进程发送）
  - `to-renderer-ClaudeCodeStatusFrame:show` - 显示窗口（主进程发送）
  - `to-renderer-ClaudeCodeStatusFrame:hide` - 隐藏窗口（主进程发送）
  - `to-main-ClaudeCodeStatusFrame:ready` - 渲染进程已就绪（渲染进程发送）
- **使用方式**:
  ```typescript
  import { windowFactory } from './frame'

  // 显示状态通知（通过 NoticeManager）
  windowFactory.getNoticeManager().showClaudeCodeStatus('running', '🟢 Claude Code 会话运行中')

  // 更新状态
  windowFactory.getNoticeManager().updateClaudeCodeStatus('waiting_permission', '⏳ 等待权限: Bash')

  // 隐藏状态通知（带淡出动画）
  windowFactory.getNoticeManager().hideClaudeCodeStatus()

  // 销毁状态通知
  windowFactory.getNoticeManager().destroyClaudeCodeStatus()
  ```

### GitHub 更新服务 (src/main/service/githubUpdateService.ts)
- **职责**: 从 GitHub Releases 检查和下载应用更新
- **功能**:
  - 从 GitHub Releases API 获取最新版本信息
  - 比较本地版本与远程版本
  - **跨平台支持**：自动根据当前平台选择对应的安装包
    - macOS: `.dmg` 文件
    - Windows: `-setup.exe` 或 `.exe` 文件
  - 支持下载进度回调（使用 content-length 或文件大小作为备用）
  - 本地缓存已下载的更新（避免重复下载）
- **依赖**: electron net 模块（无需额外依赖）
- **IPC 接口**: 无（内部服务，由 UpdateNewFrame 调用）
- **使用方式**:
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

### 剪贴板管理页面 (src/renderer/src/views/ClipboardManager.vue)
- **职责**: 剪贴板历史记录和收藏的展示与交互
- **功能**:
  - 历史记录 / 收藏双标签页导航
  - 支持搜索过滤（前端过滤）
  - 点击记录自动复制并粘贴到上一个聚焦的窗口
  - **历史记录一键清空**：点击"清空"按钮可清空所有历史记录（需确认）
  - **收藏手动添加**：点击"添加"按钮，手动输入内容、分类、描述
  - **收藏分类管理**：按分类筛选收藏，支持自定义分类（如：Linux命令）
  - 编辑收藏内容
  - **在 Markdown 编辑器中编辑**：点击历史记录的编辑按钮，在 Markdown 预览窗口中编辑内容
  - 删除单条记录
  - 空状态提示
  - 监听主进程推送，实时更新列表
  - 时间智能显示（刚刚、X分钟前、X小时前、具体日期）

### 下载引擎配置 (src/main/core/downloadEngine/config/index.ts)
- **职责**: 定义多线程下载引擎的配置常量
- **配置项**:
  - `DEFAULT_THREADS` - 默认下载线程数（8）
  - `MAX_THREADS` - 最大下载线程数（16）
  - `MIN_THREADS` - 最小下载线程数（1）
  - `EMIT_INTERVAL_MS` - 进度推送间隔（160ms）
  - `MIN_CHUNK_BYTES` - 最小分片大小（1MB）
- **使用方式**:
  ```typescript
  import { DEFAULT_THREADS, MAX_THREADS, MIN_THREADS, EMIT_INTERVAL_MS, MIN_CHUNK_BYTES } from './core/downloadEngine/config'
  ```

### 下载服务 (src/main/service/downloadService.ts)
- **职责**: 封装下载引擎，提供全局单例、任务持久化和 IPC 接口
- **功能**:
  - 多线程分片下载（默认 8 线程，最大 16）
  - 暂停/恢复/取消下载任务
  - 任务持久化（保存到 userData/download-tasks.json）
  - IPC 接口：download:start, download:pause, download:resume, download:cancel, download:remove, download:list, download:get, download:pick-save-path
  - 进度广播到所有可见窗口
- **依赖**: downloadEngine

### 搜索服务 (src/main/service/searchService.ts)
- **职责**: 统一管理工具、剪贴板、应用的搜索逻辑
- **功能**:
  - 搜索工具（支持多维度匹配：名称、别名、拼音首字母、描述）
  - 搜索剪贴板历史
  - 打开文件/网页
  - 执行工具动作
- **内置工具**：
  | 工具 ID | 名称 | 别名 | 说明 |
  |---------|------|------|------|
  | `markdown-preview` | Markdown 预览 | md, 预览, markdown | 打开 Markdown 预览窗口 |
  | `clipboard-manager` | 剪贴板管理 | cb, 剪贴板, 复制 | 打开剪贴板管理页面 |
  | `translate` | 翻译 | fy, 翻译, translate | 打开翻译页面 |
  | `download-manager` | 下载管理 | xiazai, 下载, download | 打开下载管理页面 |
  | `check-update` | 检查更新 | gx, 更新, update | 检查应用更新 |
  | `settings` | 设置 | sz, 设置, settings | 打开设置页面 |
  | `json-tool` | JSON 工具 | json, json工具, 格式化 | JSON 格式化、压缩、转义、校验 |
- **搜索匹配方式**（按优先级排序）：
  - 精确匹配：工具名称完全匹配
  - 前缀匹配：工具名称以查询词开头
  - 别名精确匹配：别名完全匹配
  - 别名前缀匹配：别名以查询词开头
  - 拼音首字母匹配：工具名称拼音首字母以查询词开头
  - 包含匹配：工具名称包含查询词
  - 别名包含匹配：别名包含查询词
  - 拼音包含匹配：拼音首字母包含查询词
  - 描述包含匹配：工具描述包含查询词
- **IPC 接口**:
  - `to-main-SearchBox:searchTools` - 搜索工具
  - `to-main-SearchBox:searchClipboard` - 搜索剪贴板
  - `to-main-SearchBox:executeTool` - 执行工具
  - `to-main-SearchBox:openFile` - 打开文件
  - `to-main-SearchBox:openUrl` - 打开网页
  - `to-main-SearchBox:copyClipboard` - 复制剪贴板内容
  - `to-main-SearchBox:hide` - 隐藏搜索框
- **使用方式**:
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
  searchService.executeTool('json-tool')         // 打开 JSON 工具
  ```

### 搜索框窗口 (src/main/frame/SearchBoxFrame.ts)
- **职责**: 全局搜索框，快捷键呼出，支持工具搜索、剪贴板搜索
- **功能**:
  - 屏幕居中显示，毛玻璃效果
  - 快捷键 `Ctrl+K` / `⌘K` 呼出/隐藏
  - 支持拼音首字母搜索
  - 搜索工具、剪贴板历史、应用、文件、网页
  - **Preload 脚本**：已修复 webPreferences 覆盖问题，确保 preload 脚本正确加载
- **IPC 接口**:
  - `to-main-SearchBox:searchTools` - 搜索工具
  - `to-main-SearchBox:searchClipboard` - 搜索剪贴板
  - `to-main-SearchBox:executeTool` - 执行工具
  - `to-main-SearchBox:hide` - 隐藏搜索框
- **使用方式**:
  ```typescript
  import { windowFactory } from './frame'

  // 显示搜索框
  windowFactory.getSearchBoxFrame().show()

  // 隐藏搜索框
  windowFactory.getSearchBoxFrame().hide()

  // 切换显示/隐藏
  windowFactory.getSearchBoxFrame().toggle()
  ```

### Markdown 预览窗口 (src/main/frame/MarkdownPreviewFrame.ts)
- **职责**: 多标签页实时分屏预览 Markdown
- **功能**:
  - 透明背景，与渲染进程大小一致
  - 左右分屏：编辑区 + 预览区
  - 多标签页支持
  - 拖入 .md 文件
  - 保存功能 (Ctrl+S)：已有文件直接保存，新文件弹出文件选择对话框
  - **右键菜单**：通过独立的 ContextMenuFrame 窗口显示，不会被父窗口边界截断
  - **换行支持**：单换行符自动转换为 `<br>`（启用 markdown-it breaks 选项）
- **窗口配置**:
  - `transparent: true` - 透明背景
  - `frame: false` - 无边框
  - 窗口大小与渲染进程一致（900x600）
- **IPC 接口**:
  - `to-main-MarkdownPreview:readFile` - 读取文件
  - `to-main-MarkdownPreview:saveFile` - 保存文件到指定路径
  - `to-main-MarkdownPreview:saveFileAs` - 另存为（弹出文件选择对话框）
  - `to-main-MarkdownPreview:minimize` - 最小化窗口
  - `to-main-MarkdownPreview:toggleMaximize` - 切换最大化
  - `to-main-MarkdownPreview:close` - 关闭窗口
  - `to-main-MarkdownPreview:showContextMenu` - 显示右键菜单（转发到 ContextMenuFrame）
  - `to-main-MarkdownPreview:openWithContent` - 从剪贴板打开并填充内容（新标签页）
  - `to-renderer-MarkdownPreview:newTab` - 创建新标签页并填充内容
- **使用方式**:
  ```typescript
  import { windowFactory } from './frame'

  // 创建并显示 Markdown 预览窗口
  windowFactory.createMarkdownPreviewFrame().show()
  ```

### 右键菜单窗口 (src/main/frame/ContextMenuFrame.ts)
- **职责**: Markdown 编辑器右键菜单的独立窗口
- **功能**:
  - 透明无边框小窗口，独立于父窗口显示
  - 支持动态计算菜单高度
  - 自动调整位置，确保不超出屏幕边界
  - **失去焦点后自动隐藏**（点击菜单项或点击外部区域）
  - 菜单项点击后将焦点返回到 Markdown 预览窗口
  - 菜单项点击后通过 BroadcastChannel 广播到所有窗口
- **窗口配置**:
  - `transparent: true` - 透明背景
  - `frame: false` - 无边框
  - `skipTaskbar: true` - 不显示在任务栏
  - `alwaysOnTop: true` - 悬浮在最上层
  - 大小根据菜单项数量动态调整
  - 监听 `blur` 事件自动隐藏
- **IPC 接口**:
  - `to-main-ContextMenu:click` - 菜单项被点击
  - `to-main-ContextMenu:close` - 关闭菜单
  - `to-renderer-ContextMenu:show` - 显示菜单（发送菜单数据到渲染进程）
  - `broadcast:context-menu-action` - 广播菜单操作到所有窗口
- **使用方式**:
  ```typescript
  import { windowFactory } from './frame'

  // 显示右键菜单
  windowFactory.showContextMenu(x, y, items)
  ```

### 系统托盘 (src/main/trayService.ts)
- **职责**: 管理系统托盘图标、右键菜单、窗口显示/隐藏
- **功能**:
  - 创建系统托盘图标
  - **Windows**: 左键单击切换主页面显示/隐藏，右键弹出菜单
  - **macOS**: 左键单击弹出菜单（菜单栏托盘行为），菜单包含"显示主窗口"选项
  - 右键菜单：检查更新、退出
  - 点击"检查更新"：打开更新窗口
  - 点击"退出"菜单才真正退出应用
- **使用方式**:
  ```typescript
  import { TrayService } from './trayService'

  // 在主进程启动时初始化
  const trayService = new TrayService()

  // 退出时销毁
  trayService.destroy()
  ```

### 主进程工具函数 (src/main/utils/)
- **职责**: 封装主进程通用工具函数
- **关键文件**:
  - `platform.ts` - 平台相关工具函数（macOS/Windows 差异处理）
- **主要函数**:
  - `getBottomMargin(baseMargin)` - 获取屏幕底部安全间距（macOS 自动加上 Dock 高度）
  - `isMacOS()` - 判断是否为 macOS 平台

### 预加载脚本 (src/preload/)
- **职责**: 在主进程和渲染进程之间建立安全的桥梁
- **关键文件**: `index.ts` - 暴露安全的 API 给渲染进程
- **依赖**: @electron-toolkit/preload

### 渲染进程 (src/renderer/)
- **职责**: 用户界面展示和交互
- **设计系统**: Modern Dark (Cinema) 风格，Slate/Blue 配色方案
  - 深色主题背景: `#0f172a` (Slate 900)
  - 品牌色: `#3b82f6` (Blue 500)
  - 语义色: 成功 `#22c55e`、危险 `#ef4444`、警告 `#f59e0b`
  - 按钮: 统一 `border-radius: 8px`，hover 上浮 1px
  - 对话框: `backdrop-filter: blur(4px)`，`border-radius: 16px`
- **关键文件**:
  - `src/main.ts` - Vue 应用初始化
  - `src/App.vue` - 根组件
  - `src/router/index.ts` - 路由配置
  - `src/store/` - Pinia 状态管理
  - `src/components/` - 可复用组件
  - `src/composables/` - 组合式函数
  - `src/views/` - 页面视图组件
  - `src/utils/` - 工具函数
- **依赖**: vue, vue-router, pinia, @vitejs/plugin-vue

### 路由配置 (src/renderer/src/router/)
- **职责**: 管理单页面应用的路由导航
- **关键文件**:
  - `index.ts` - 路由实例、路由表
  - `routes.ts` - 路由定义
  - `guards.ts` - 导航守卫
- **依赖**: vue-router

### 状态管理 (src/renderer/src/store/)
- **职责**: 集中管理应用状态，实现组件间数据共享
- **关键文件**:
  - `index.ts` - Store 入口
  - `userStore.ts` - 用户状态管理
  - `noticeStore.ts` - 通知状态管理（剪贴板通知文本、显示状态）
- **依赖**: pinia, pinia-plugin-persistedstate

### 工具函数 (src/renderer/src/utils/)
- **职责**: 封装通用工具函数
- **关键文件**: `request.ts` - Axios 请求封装
- **依赖**: axios

### 可复用组件 (src/renderer/src/components/)
- **职责**: 跨页面复用的 UI 组件
- **关键文件**:
  - `BaseDialog.vue` - 统一对话框组件（遮罩 + 弹窗容器 + 头部/内容/底部插槽）
  - `EmptyState.vue` - 统一空状态组件（图标 + 提示文字 + 辅助说明）
- **使用方式**:
  ```vue
  <BaseDialog :visible="showDialog" title="标题" @close="showDialog = false">
    <p>对话框内容</p>
    <template #footer>
      <button class="btn btn-secondary" @click="showDialog = false">取消</button>
      <button class="btn btn-primary" @click="confirm">确定</button>
    </template>
  </BaseDialog>

  <EmptyState icon="search" text="未找到匹配结果" hint="试试其他关键词" />
  ```
- **图标选项**: `search` | `clipboard` | `download` | `translate` | `folder` | `tool` | `success`

### 组合式函数 (src/renderer/src/composables/)
- **职责**: 可复用的逻辑函数
- **关键文件**:
  - `useTimeFormat.ts` - 时间格式化工具（相对时间、绝对时间、文件大小、下载速度）
- **使用方式**:
  ```typescript
  import { formatTimeAgo, formatFileSize, formatSpeed } from '@/composables/useTimeFormat'

  // 相对时间：刚刚、5分钟前、3小时前
  const time = formatTimeAgo(timestamp)

  // 文件大小：1.5 MB
  const size = formatFileSize(bytes)

  // 下载速度：2.3 MB/s
  const speed = formatSpeed(bytesPerSecond)
  ```

### 页面视图 (src/renderer/src/views/)
- **职责**: 各页面的视图组件
- **关键文件**:
  - `About.vue` - 关于页
  - `Notice.vue` - 剪贴板通知窗口，显示复制的文字（最多两行，超出省略），支持拖拽、关闭按钮、10秒自动关闭
  - `NoticeNew.vue` - 通知弹窗，蓝粉渐变胶囊样式，单行文字显示，支持翻译按钮（仅剪贴板通知显示），显示时长由 NoticeManager 管理
  - `UpdateNew.vue` - 更新窗口，底部居中弹出，支持下载进度显示和安装
  - `MainPage.vue` - 主页面，侧边栏布局，显示应用名称和版本号，支持菜单导航
  - `ClipboardManager.vue` - 剪贴板管理（历史记录 + 收藏）
  - `Translate.vue` - 翻译页面，支持多语言文本翻译和历史记录
  - `Settings.vue` - 设置页面，支持外观主题、开机自启、全局快捷键、更新服务器、翻译 API 配置
    - **跨平台更新服务器**：Windows 显示 UNC 路径选择器，macOS 显示 SMB 挂载路径输入框
    - **macOS 挂载帮助**：可展开的步骤说明，指导用户如何在 Finder 中挂载共享文件夹
  - `Test.vue` - 测试页面

## 开发命令

```bash
# 开发模式（热重载）
npm run dev

# 类型检查
npm run typecheck

# 构建应用
npm run build

# 打包为可执行文件
npm run build:win      # Windows
npm run build:mac      # macOS
npm run build:linux    # Linux

# 代码格式化
npm run format

# 代码检查
npm run lint
```

## 规范

### 代码修改规范
1. 如果改动内容涉及到文件删除添加，要更新 claude.md 文档目录索引
2. 不要 git 提交无关的文件
3. 在修改代码后必须要编译检查是否有报错，不需要启动应用
4. **【重要】模块业务逻辑、数据库结构都发生更改后必须要更新相关 md 文件**
5. 在遇到用户需求模糊时必须要向用户提问，不要自己猜
6. **【重要】跨平台兼容性**：此项目同时支持 Windows 和 macOS，写代码前必须评估兼容性：
   - 使用 `process.platform` 检测平台差异
   - 路径处理：Windows 使用 `\` 或 UNC 路径，macOS 使用 `/` 或 SMB 挂载路径
   - 焦点管理：Windows 使用 `minimize()`，macOS 使用 `hide()` + `app.hide()`
   - 快捷键：Windows 使用 `Ctrl`，macOS 使用 `Command`
   - 文件操作：注意跨平台路径分隔符和权限差异

### 窗口框架规范（必须遵守）
1. **创建窗口时必须继承 BaseFrame**：新增窗口类时，必须继承 `BaseFrame` 基类，复用其通用逻辑（窗口创建、IPC 注册、生命周期管理等）
2. **四种通信方式命名规范**：
   - `recvOne` - 渲染→主 单向（通知模式）
   - `recvTwo` - 渲染→主 双向（请求模式）
   - `sendOne` - 主→渲染 单向（通知模式）
   - `sendTwo` - 主→渲染 双向（请求模式）
3. **频道命名规范**：
   - 主→渲染：`to-renderer-{渲染组件名}:{方法名}`
   - 渲染→主：`to-main-{主进程窗口名}:{方法名}`
   - 示例：`to-renderer-MainPage:getVersion`（主进程向 MainPage 发送版本信息）

### 服务类通信规范
1. **Service 保持全局注册**：Service 是全局单例，不绑定特定窗口生命周期，使用 `ipcMain.handle()` / `ipcMain.on()` 全局注册
2. **频道命名规范**：
   - 渲染→服务：`to-service-{ServiceName}:{方法名}`
   - 服务→渲染：广播事件使用 `broadcast:{事件名}` 格式
   - 示例：`to-service-ClipboardService:getHistory`（获取剪贴板历史）

示例：
```typescript
// clipboardService.ts
private registerIPC(): void {
  // 渲染→服务（双向）
  ipcMain.handle('to-service-ClipboardService:getHistory', (_event, limit, offset) => {
    return this.getAll(limit ?? 50, offset ?? 0)
  })

  ipcMain.handle('to-service-ClipboardService:delete', (_event, id) => {
    this.delete(id)
  })
}

// 广播到所有窗口（服务→渲染）
broadcastNewItem(item: HistoryItem): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed() && w.isVisible()) {
      w.webContents.send('broadcast:clipboard-new', item)
    }
  })
}
```

示例（Frame）：
```typescript
export default class MyFrame extends BaseFrame {
  protected readonly options: BrowserWindowConstructorOptions = { /* ... */ }
  protected readonly routePath: string = '/myRoute'

  protected registerIPC(): void {
    super.registerIPC()

    // 渲染→主 单向（通知）
    this.recvOne('to-main-MyFrame:onReady', () => {
      console.log('渲染进程已就绪')
    })

    // 渲染→主 双向（请求）
    this.recvTwo('to-main-MyFrame:getData', (event, id) => {
      return { id, name: 'test' }
    })

    // 主→渲染 单向（通知）
    this.sendOne('to-renderer-MyPage:updateAvailable', { version: '1.0.0' })

    // 主→渲染 双向（请求，等待渲染进程返回）
    const rendererData = await this.sendTwo('to-renderer-MyPage:getUserInfo', 5000, userId)
  }
}
```

### 代码注释规范
1. **方法级注释**：每个函数/方法上方必须添加注释，说明其功能、参数和返回值
2. **行内注释**：复杂逻辑或关键代码行上方添加行内注释，解释"为什么这样做"
3. 注释应简洁明了，不要重复代码本身能表达的内容
4. 使用 JSDoc 格式（TypeScript/Vue）或其他语言对应的注释规范

示例：
```typescript
/**
 * 处理用户登录请求
 * @param username - 用户名
 * @param password - 密码
 * @returns 登录结果，包含 token 和用户信息
 */
async function login(username: string, password: string): Promise<LoginResult> {
  // 验证输入参数，防止空值导致后续错误
  if (!username || !password) {
    throw new Error('用户名和密码不能为空')
  }

  const result = await api.post('/login', { username, password })
  return result.data
}
```

### ⚠️ 文档更新要求（必须遵守）

**修改代码后，必须同步更新相关文档，这是强制要求！**

需要更新文档的场景：
- 新增/删除/重命名文件 → 更新 `claude.md` 的目录索引
- 新增/删除模块 → 更新模块说明
- API 接口变更 → 更新相关 API 文档
- 数据库结构变更 → 更新数据库文档
- 业务逻辑重大变更 → 更新业务流程文档
- 新增配置项 → 更新配置说明
- 状态管理变更 → 更新状态管理文档

文档更新检查清单：
- [ ] 目录索引是否反映最新文件结构
- [ ] 模块说明是否准确描述功能
- [ ] 相关 md 文件是否同步更新
- [ ] 注释是否清晰易懂

**忘记更新文档会导致：**
- AI 辅助开发时产生误解
- 新成员难以理解项目结构
- 代码与文档不一致，造成混乱

### 编译检查命令

```bash
# TypeScript 类型检查（必须执行）
npm run typecheck

# 完整构建检查（包含类型检查）
npm run build
```

### 代码风格
- 使用 TypeScript 严格模式
- Vue 组件使用 `<script setup>` 语法
- 遵循 ESLint 和 Prettier 配置
- 组件命名：PascalCase（如 `Versions.vue`）
- 文件命名：camelCase（如 `index.ts`）

## IPC 通信模式

主进程和渲染进程通过 IPC 通信：
- **主进程**: 使用 `ipcMain.on()` 监听事件
- **渲染进程**: 使用 `window.electron.ipcRenderer.send()` 发送事件

示例：
```typescript
// 渲染进程 (App.vue)
const ipcHandle = () => window.electron.ipcRenderer.send('ping')

// 主进程 (src/main/index.ts)
ipcMain.on('ping', () => console.log('pong'))
```

## 路由配置

### 创建路由实例
```typescript
// src/renderer/src/router/index.ts
import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/Home.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/about',
      name: 'about',
      // 路由懒加载
      component: () => import('../views/About.vue')
    }
  ]
})

export default router
```

### 在 Vue 应用中注册
```typescript
// src/renderer/src/main.ts
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(router)
app.mount('#app')
```

### 在组件中使用
```vue
<!-- 使用 router-link 进行导航 -->
<template>
  <nav>
    <router-link to="/">首页</router-link>
    <router-link to="/about">关于</router-link>
  </nav>
  <router-view />
</template>

<!-- 编程式导航 -->
<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const goToAbout = () => {
  router.push('/about')
}
</script>
```

## 状态管理 (Pinia)

### 创建 Store
```typescript
// src/renderer/src/store/userStore.ts
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', () => {
  // state
  const name = ref('')
  const token = ref('')

  // getters
  const isLoggedIn = computed(() => !!token.value)

  // actions
  function setUser(data: { name: string; token: string }) {
    name.value = data.name
    token.value = data.token
  }

  return { name, token, isLoggedIn, setUser }
})
```

### 在 Vue 应用中注册
```typescript
// src/renderer/src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
```

### 在组件中使用
```vue
<script setup>
import { useUserStore } from '@/store/userStore'

const userStore = useUserStore()
</script>

<template>
  <div>
    <p>用户名: {{ userStore.name }}</p>
    <p>已登录: {{ userStore.isLoggedIn }}</p>
  </div>
</template>
```

### 使用 StoreToRefs（推荐）
```vue
<script setup>
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/store/userStore'

const userStore = useUserStore()
// 使用 storeToRefs 保持响应式
const { name, isLoggedIn } = storeToRefs(userStore)
// actions 可以直接解构
const { setUser } = userStore
</script>

<template>
  <div>
    <p>用户名: {{ name }}</p>
    <p>已登录: {{ isLoggedIn }}</p>
  </div>
</template>
```

## HTTP 请求 (Axios)

### 请求工具封装
```typescript
// src/renderer/src/utils/request.ts
import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 15000
})

// 请求拦截器
service.interceptors.request.use(
  (config) => {
    // 添加 token 等
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
service.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data
  },
  (error) => {
    return Promise.reject(error)
  }
)

export default service
```

### 使用示例
```typescript
// 在组件中使用
import request from '@/utils/request'

const fetchData = async () => {
  try {
    const data = await request.get('/api/data')
    console.log(data)
  } catch (error) {
    console.error(error)
  }
}
```

## 构建配置

### electron.vite.config.ts
- **主进程**: 使用 externalizeDepsPlugin 和 bytecodePlugin
- **预加载脚本**: 同上
- **渲染进程**: 使用 vue 插件，配置 @renderer 别名

### electron-builder.yml
- 配置应用打包选项
- 支持 Windows、macOS、Linux 平台

## 注意事项

1. **安全**: 预加载脚本只暴露必要的 API，遵循 Electron 安全最佳实践
2. **性能**: 使用 bytecodePlugin 优化主进程和预加载脚本性能
3. **开发体验**: 开发模式下支持 HMR（热模块替换）
4. **跨平台**: 支持 Windows、macOS、Linux 三平台打包

## 相关资源

- [Electron-Vite 官方文档](https://electron-vite.org/)
- [Vue 3 文档](https://vuejs.org/)
- [Electron 文档](https://www.electronjs.org/)
