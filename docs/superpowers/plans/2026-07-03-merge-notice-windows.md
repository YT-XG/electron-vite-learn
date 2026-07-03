# 合并 Claude Code 状态通知和通用通知窗口实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 `ClaudeCodeStatusFrame`，用 `NoticeNewFrame` 完全替代 Claude Code 状态通知功能

**Architecture:** 在 `NoticeNewFrame` 中增加 `isPersistent` 属性，当 `isPersistent=true` 时禁用自动销毁，显示 "Claude" 标识，状态改变时只更新内容不创建新实例。`NoticeManager` 对持久通知做特殊堆叠处理（始终在最顶部）。

**Tech Stack:** Electron, Vue 3, TypeScript

## Global Constraints

- 项目同时支持 Windows 和 macOS，跨平台兼容性必须考虑
- 使用 `process.platform` 检测平台差异
- 遵循现有 IPC 通信规范（`recvOne`/`recvTwo`/`sendOne`/`sendTwo`）
- 频道命名规范：主→渲染 `to-renderer-{组件名}:{方法名}`，渲染→主 `to-main-{窗口名}:{方法名}`
- 修改代码后必须执行 `npm run typecheck` 编译检查
- 修改代码后必须更新 `CLAUDE.md` 文档目录索引

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/main/frame/NoticeNewFrame.ts` | 修改 | 增加 `isPersistent` 属性，支持持久通知模式 |
| `src/renderer/src/views/NoticeNew.vue` | 修改 | 增加 Claude 标识和持久通知样式 |
| `src/main/frame/NoticeManager.ts` | 修改 | 支持持久通知管理，特殊堆叠规则 |
| `src/main/frame/WindowFactory.ts` | 修改 | 无需修改（ClaudeCodeStatusFrame 未在此文件中） |
| `src/main/frame/ClaudeCodeStatusFrame.ts` | 删除 | 不再需要 |
| `src/renderer/src/views/ClaudeCodeStatus.vue` | 删除 | 不再需要 |
| `CLAUDE.md` | 修改 | 更新目录索引 |

---

## Task 1: 修改 NoticeNewFrame.ts - 增加持久通知支持

**Files:**
- Modify: `src/main/frame/NoticeNewFrame.ts`

**Interfaces:**
- Consumes: 无
- Produces: `NoticeNewFrame.setMsg(data, showTranslate, type, isPersistent)`, `NoticeNewFrame.isPersistent()`, `NoticeNewFrame.isShown()`

- [ ] **Step 1: 在 NoticeNewFrame 类中添加私有属性**

在 `#animationFrameId` 属性下方添加：

```typescript
/** 是否为持久通知（Claude Code 状态通知） */
#isPersistent = false

/** 是否已显示（持久通知复用同一实例） */
#isShown = false
```

- [ ] **Step 2: 修改 setMsg 方法签名**

将 `setMsg` 方法修改为：

```typescript
/**
 * 设置待发送的消息
 * @param data - 通知文本内容
 * @param showTranslate - 是否显示翻译按钮，默认 false
 * @param type - 通知类型，默认 'default'
 * @param isPersistent - 是否为持久通知，默认 false
 */
setMsg(data: string, showTranslate = false, type: NoticeType = 'default', isPersistent = false) {
  this.#msg = data
  this.#showTranslate = showTranslate
  this.#type = type
  this.#isPersistent = isPersistent
  // 自动检测链接并设置显示打开链接按钮
  this.#showOpenLink = NoticeNewFrame.#containsUrl(data)
  // 自动检测 JSON 格式并设置显示 JSON 工具按钮
  this.#showJsonTool = NoticeNewFrame.#containsJson(data)
  return this
}
```

- [ ] **Step 3: 修改 showAtBottomCenter 方法**

将 `showAtBottomCenter` 方法修改为：

```typescript
/**
 * 在屏幕底部居中显示通知弹窗
 * @description 定位 → 发送消息 → 显示窗口（CSS 处理入场放大动画）
 *              支持重复调用：窗口销毁后会自动重建
 *              持久通知：如果已显示，只更新内容，不重新创建
 */
async showAtBottomCenter(): Promise<void> {
  // 持久通知：如果已显示，只更新内容，不重新创建
  if (this.#isPersistent && this.#isShown) {
    if (this.isAlive()) {
      this.sendOne(
        'to-renderer-NoticeNewFrame:sendMsg',
        this.#msg,
        this.#showTranslate,
        this.#showOpenLink,
        this.#showJsonTool,
        this.#type,
        this.#isPersistent  // 新增参数
      )
    }
    return
  }

  // 非持久通知：清除定时器
  if (!this.#isPersistent) {
    this.#clearDestroyTimer()
  }

  const pos = this.#calcBottomCenterPosition()

  if (!this.isAlive()) {
    // 窗口不存在 → 创建新窗口（IPC handler 会在页面加载后补发消息）
    this.#msgSent = false
    this.create()
    // 设置鼠标穿透：透明区域可点击，forward 保证渲染进程能收到 mousemove 事件
    this.window!.setIgnoreMouseEvents(true, { forward: true })
  } else {
    // 窗口已存在 → 直接发送消息
    this.sendOne(
      'to-renderer-NoticeNewFrame:sendMsg',
      this.#msg,
      this.#showTranslate,
      this.#showOpenLink,
      this.#showJsonTool,
      this.#type,
      this.#isPersistent  // 新增参数
    )
    this.#msgSent = true
  }

  // 定位到屏幕底部（窗口宽度固定为屏幕宽度）
  this.window!.setBounds({
    x: pos.x,
    y: pos.y,
    width: NoticeNewFrame.getScreenWidth(),
    height: NoticeNewFrame.POPUP_HEIGHT
  })

  // 显示窗口（不抢占焦点，避免影响搜索框等前台窗口）
  this.window!.showInactive()

  // 持久通知：标记已显示，不启动自动销毁定时器
  if (this.#isPersistent) {
    this.#isShown = true
  } else {
    // 启动自动销毁定时器（使用实例级 duration）
    this.#destroyTimer = setTimeout(() => {
      this.destroy()
    }, this.#duration)
  }
}
```

- [ ] **Step 4: 修改 destroy 方法**

将 `destroy` 方法修改为：

```typescript
/**
 * 销毁窗口（附带收起动画和清理定时器）
 * @description 向下滑出后销毁窗口
 */
async destroy(): Promise<void> {
  this.#clearDestroyTimer()

  if (this.isAlive()) {
    // 播放向下滑出动画
    await this.#animateSlideDown(250)
  }

  // 清理动画帧
  if (this.#animationFrameId) {
    clearTimeout(this.#animationFrameId)
    this.#animationFrameId = null
  }

  // 重置消息发送状态，下次 showAtBottomCenter 时重新创建窗口并发送消息
  this.#msgSent = false
  // 重置持久通知状态
  this.#isShown = false

  super.destroy()
}
```

- [ ] **Step 5: 添加公开方法**

在 `getY()` 方法下方添加：

```typescript
/**
 * 获取是否为持久通知
 * @returns 是否为持久通知
 */
isPersistent(): boolean {
  return this.#isPersistent
}

/**
 * 获取是否已显示（持久通知复用判断）
 * @returns 是否已显示
 */
isShown(): boolean {
  return this.#isShown
}
```

- [ ] **Step 6: 修改 registerIPC 中的消息发送**

在 `registerIPC` 方法中，找到 `to-renderer-NoticeNewFrame:sendMsg` 的发送，添加 `this.#isPersistent` 参数：

```typescript
// 渲染进程已就绪，发送缓存的消息并显示弹窗
this.recvOne('to-main-NoticeNewFrame:ready', async () => {
  // 如果消息还没发过（窗口创建时 send 丢失的情况），现在补发
  if (!this.#msgSent) {
    this.sendOne(
      'to-renderer-NoticeNewFrame:sendMsg',
      this.#msg,
      this.#showTranslate,
      this.#showOpenLink,
      this.#showJsonTool,
      this.#type,
      this.#isPersistent  // 新增参数
    )
  }
  await this.showAtBottomCenter()
})
```

- [ ] **Step 7: 编译检查**

Run: `npm run typecheck`
Expected: 无错误（会有 NoticeNew.vue 的类型错误，稍后修复）

---

## Task 2: 修改 NoticeNew.vue - 增加 Claude 标识和持久通知样式

**Files:**
- Modify: `src/renderer/src/views/NoticeNew.vue`

**Interfaces:**
- Consumes: `isPersistent` 参数（从 IPC 接收）
- Produces: 渲染持久通知样式和 Claude 标识

- [ ] **Step 1: 在 script setup 中添加 isPersistent 响应式变量**

在 `noticeType` 变量下方添加：

```typescript
/** 是否为持久通知（Claude Code 状态通知） */
const isPersistent = ref(false)
```

- [ ] **Step 2: 修改 setMsg 函数**

将 `setMsg` 函数修改为：

```typescript
/**
 * 设置通知消息内容并触发入场动画
 * @param data - 通知文本
 * @param translate - 是否显示翻译按钮
 * @param openLink - 是否显示打开链接按钮
 * @param jsonTool - 是否显示 JSON 工具按钮
 * @param type - 通知类型
 * @param persistent - 是否为持久通知
 */
const setMsg = (data: string, translate = false, openLink = false, jsonTool = false, type: 'default' | 'success' | 'error' | 'warning' = 'default', persistent = false) => {
  msg.value = data
  showTranslate.value = translate
  showOpenLink.value = openLink
  showJsonTool.value = jsonTool
  noticeType.value = type
  isPersistent.value = persistent
}
```

- [ ] **Step 3: 修改 IPC 监听**

将 `onMounted` 中的 IPC 监听修改为：

```typescript
// 监听主进程发送的消息
window.electron.ipcRenderer.on(
  'to-renderer-NoticeNewFrame:sendMsg',
  (_e, data: string, translate: boolean, openLink: boolean, jsonTool: boolean, type: 'default' | 'success' | 'error' | 'warning', persistent: boolean) => {
    setMsg(data, translate, openLink, jsonTool, type, persistent)
    // 下一帧触发 CSS 缩放动画（从 scale(0.2) → scale(1)）
    nextTick(() => {
      isVisible.value = true
    })
  }
)
```

- [ ] **Step 4: 修改模板**

将模板修改为：

```vue
<template>
  <div class="notice-container">
    <div
      class="notice-border"
      :class="[{ 'scale-in': isVisible }, `notice-${noticeType}`, { 'notice-persistent': isPersistent }]"
      @mouseenter="onCardEnter"
      @mouseleave="onCardLeave"
    >
      <div class="notice-card">
        <!-- Claude 标识（仅持久通知显示） -->
        <div v-if="isPersistent" class="claude-badge">
          <span class="claude-icon">Claude</span>
        </div>
        <span class="notice-text">{{ msg }}</span>
        <!-- 按钮组（持久通知不显示按钮） -->
        <div v-if="!isPersistent && (showOpenLink || showTranslate || showJsonTool)" class="btn-group">
          <button v-if="showJsonTool" class="json-btn" @click="openJsonTool" title="在 JSON 工具中打开">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/>
              <path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1-2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>
            </svg>
          </button>
          <button v-if="showOpenLink" class="link-btn" @click="openLink" title="打开链接">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
          <button v-if="showTranslate" class="translate-btn" @click="openTranslate" title="翻译">
            <svg viewBox="0 0 1024 1024" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
              <path d="M414.25 595.78H172.22c-86.11 0-155.93-67.49-155.93-148.95V218.76C16.29 137.31 86.11 69.82 172.22 69.82h242.04c86.11 0 155.93 67.49 155.93 148.95v228.07c-2.33 81.45-69.82 148.95-155.93 148.94zM172.22 137.31c-48.87 0-86.11 34.91-86.11 81.45v228.07c0 44.22 39.56 81.45 86.11 81.45h242.04c48.87 0 86.11-34.91 86.11-81.45V218.76c0-44.22-39.56-81.45-86.11-81.45H172.22z" fill="currentColor"/>
              <path d="M837.82 861.09H595.78c-90.76 0-155.93-69.82-155.93-167.56v-141.96c0-18.62 16.29-34.91 34.91-34.91s34.91 16.29 34.91 34.91v141.96c0 58.18 34.91 100.07 86.11 100.07H837.82c48.87 0 86.11-34.91 86.11-81.45v-228.07c0-44.22-39.56-81.45-86.11-81.45H544.58c-18.62 0-34.91-16.29-34.91-34.91s16.29-34.91 34.91-34.91h293.24c86.11 0 155.93 67.49 155.93 148.95v228.27c0 86.11-69.82 151.27-155.93 151.27zM262.98 847.13c-102.4 0-183.85-74.47-183.85-167.56 0-18.62 16.29-34.91 34.91-34.91s34.91 16.29 34.91 34.91c0 55.85 51.2 100.07 116.36 100.07 18.62 0 34.91 16.29 34.91 34.91-4.65 18.62-18.62 32.58-37.24 32.58zM861.09 281.6c-18.62 0-34.91-16.29-34.91-34.91 0-55.85-51.2-100.07-116.36-100.07-18.62 0-34.91-16.29-34.91-34.91s16.29-34.91 34.91-34.91c102.4 0 183.85 74.47 183.85 167.56 2.33 20.95-11.64 37.24-32.58 37.24z" fill="currentColor"/>
              <path d="M660.95 686.55h-39.56l88.44-165.24h41.89l88.44 165.24h-41.89l-23.27-46.55h-93.09l-20.95 46.55zm69.82-139.64l-37.24 72.15H768l-37.24-72.15z" fill="currentColor"/>
              <path d="M286.25 200.15h23.27v39.56h93.09V349.09h-23.27v-13.96h-62.84v76.8h-23.27v-76.8h-86.11v13.96h-23.27v-109.38h86.11v22.95zm-62.84 116.37h62.84v-55.86H223.42v55.86zm86.11 0H372.36v-55.86h-62.84v55.86z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: 添加持久通知 CSS 样式**

在 `<style scoped>` 中添加：

```css
/* 持久通知样式 - 蓝紫渐变边框 */
.notice-persistent::before {
  background: conic-gradient(
    from var(--border-angle),
    #667eea,
    #764ba2,
    #667eea,
    #5a67d8,
    #667eea,
    #764ba2,
    #667eea
  );
}

/* 持久通知卡片 */
.notice-persistent .notice-card {
  padding: 0 16px;
  gap: 0;
}

/* Claude 标识容器 */
.claude-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
  border-radius: 12px;
  padding: 2px 10px;
  margin-right: 10px;
  flex-shrink: 0;
}

/* Claude 标识文本 */
.claude-icon {
  font-size: 11px;
  font-weight: 700;
  color: white;
  letter-spacing: 0.5px;
}
```

- [ ] **Step 6: 编译检查**

Run: `npm run typecheck`
Expected: 无错误

---

## Task 3: 修改 NoticeManager.ts - 支持持久通知管理

**Files:**
- Modify: `src/main/frame/NoticeManager.ts`

**Interfaces:**
- Consumes: `NoticeNewFrame.isPersistent()`, `NoticeNewFrame.isShown()`
- Produces: `NoticeManager.showClaudeCodeStatus()`, `NoticeManager.updateClaudeCodeStatus()`, `NoticeManager.hideClaudeCodeStatus()`

- [ ] **Step 1: 删除 ClaudeCodeStatusFrame 导入**

删除第 4 行的导入：

```typescript
import ClaudeCodeStatusFrame, { type ClaudeCodeStatus } from './ClaudeCodeStatusFrame'
```

- [ ] **Step 2: 添加 Claude Code 状态类型定义**

在 `NoticeType` 类型定义下方添加：

```typescript
/** Claude Code 状态类型 */
export type ClaudeCodeStatus =
  | 'running' // 🟢 会话运行中
  | 'thinking' // 💭 思考中...
  | 'executing' // ⚡ 执行任务中
  | 'waiting_permission' // ⏳ 等待权限确认
  | 'completed' // ✅ 任务完成

/** 状态配置映射 */
const STATUS_CONFIG: Record<ClaudeCodeStatus, { icon: string; text: string }> = {
  running: { icon: '🟢', text: 'Claude Code 会话运行中' },
  thinking: { icon: '💭', text: '思考中...' },
  executing: { icon: '⚡', text: '执行任务中' },
  waiting_permission: { icon: '⏳', text: '等待权限确认' },
  completed: { icon: '✅', text: '任务完成' }
}
```

- [ ] **Step 3: 修改 NoticeManager 类的属性**

将 `claudeCodeStatusFrame` 和 `claudeCodeStatusVisible` 替换为：

```typescript
/** 持久通知实例（Claude Code 状态通知） */
private persistentNotice: NoticeNewFrame | null = null

/** 持久通知是否正在显示 */
private persistentNoticeVisible = false
```

- [ ] **Step 4: 修改 show 方法**

将 `show` 方法修改为：

```typescript
/**
 * 显示一个新通知
 * @param options - 通知配置
 * @param isPersistent - 是否为持久通知，默认 false
 */
show(options: NoticeOptions, isPersistent = false): void {
  const { text, showTranslate = false, duration = 5000, type = 'default' } = options

  // 持久通知：如果已存在，只更新内容
  if (isPersistent && this.persistentNotice) {
    this.persistentNotice.setMsg(text, false, type, true)
    this.persistentNotice.showAtBottomCenter()
    return
  }

  // 如果已达到上限，销毁最早的（最上面的）通知
  if (this.notices.length >= this.MAX_NOTICES) {
    const oldest = this.notices[this.notices.length - 1]
    oldest.destroy()
    this.notices.pop()
  }

  // 创建新通知实例
  const notice = new NoticeNewFrame()
  notice.onDestroyCallback = () => {
    this.removeNotice(notice)
  }

  // 设置消息和时长
  notice.setMsg(text, showTranslate, type, isPersistent)
  notice.setDuration(duration)

  if (isPersistent) {
    // 持久通知单独管理
    this.persistentNotice = notice
    this.persistentNoticeVisible = true
  } else {
    // 普通通知插入到列表头部
    this.notices.unshift(notice)
  }

  // 重新排列所有通知位置
  this.repositionAll()

  // 显示通知
  notice.showAtBottomCenter().catch(() => {})
}
```

- [ ] **Step 5: 修改 repositionAll 方法**

将 `repositionAll` 方法修改为：

```typescript
/**
 * 重新计算所有通知位置并平滑移动
 * @description 持久通知始终在最顶部，普通通知从底部开始堆叠
 */
private repositionAll(): void {
  // 持久通知始终在最顶部（索引 = notices.length）
  if (this.persistentNoticeVisible && this.persistentNotice) {
    const statusY = this.calcY(this.notices.length)
    this.persistentNotice.moveTo(statusY, true)
  }

  // 普通通知从底部开始堆叠
  for (let i = 0; i < this.notices.length; i++) {
    const notice = this.notices[i]
    const targetY = this.calcY(i)
    notice.moveTo(targetY, true)
  }
}
```

- [ ] **Step 6: 修改 removeNotice 方法**

将 `removeNotice` 方法修改为：

```typescript
/**
 * 移除指定通知并重新排列
 * @param notice - 要移除的通知实例
 */
private removeNotice(notice: NoticeNewFrame): void {
  // 如果是持久通知，清空引用
  if (notice === this.persistentNotice) {
    this.persistentNotice = null
    this.persistentNoticeVisible = false
  }

  const index = this.notices.indexOf(notice)
  if (index !== -1) {
    this.notices.splice(index, 1)
  }

  // 重新排列所有通知
  this.repositionAll()
}
```

- [ ] **Step 7: 删除旧的 Claude Code 状态管理方法**

删除以下方法（从 `showClaudeCodeStatus` 开始到文件末尾的所有 Claude Code 相关方法）：
- `showClaudeCodeStatus`
- `hideClaudeCodeStatus`
- `updateClaudeCodeStatus`
- `destroyClaudeCodeStatus`

- [ ] **Step 8: 添加新的 Claude Code 状态管理方法**

在 `getCount()` 方法下方添加：

```typescript
// ========== Claude Code 状态通知管理 ==========

/**
 * 显示 Claude Code 状态通知
 * @description 状态通知作为持久通知，始终在最顶部，不自动销毁
 * @param status - 状态类型
 * @param customText - 自定义状态文本（可选）
 */
showClaudeCodeStatus(status: ClaudeCodeStatus, customText?: string): void {
  const config = STATUS_CONFIG[status]
  const text = customText || config.text
  this.show({ text, duration: 0 }, true) // duration=0 表示不自动销毁
}

/**
 * 更新 Claude Code 状态（如果窗口未显示则不显示）
 * @param status - 状态类型
 * @param customText - 自定义状态文本（可选）
 */
updateClaudeCodeStatus(status: ClaudeCodeStatus, customText?: string): void {
  if (this.persistentNotice) {
    const config = STATUS_CONFIG[status]
    const text = customText || config.text
    this.persistentNotice.setMsg(text, false, 'default', true)
    this.persistentNotice.showAtBottomCenter()
  }
}

/**
 * 隐藏 Claude Code 状态通知（带淡出动画）
 * @description 隐藏后将下方普通通知向上移动填补空位
 */
hideClaudeCodeStatus(): void {
  if (this.persistentNotice) {
    this.persistentNotice.destroy()
  }
}
```

- [ ] **Step 9: 编译检查**

Run: `npm run typecheck`
Expected: 无错误

---

## Task 4: 删除 ClaudeCodeStatusFrame 相关文件

**Files:**
- Delete: `src/main/frame/ClaudeCodeStatusFrame.ts`
- Delete: `src/renderer/src/views/ClaudeCodeStatus.vue`

**Interfaces:**
- Consumes: 无
- Produces: 无

- [ ] **Step 1: 删除 ClaudeCodeStatusFrame.ts**

Run: `rm src/main/frame/ClaudeCodeStatusFrame.ts`

- [ ] **Step 2: 删除 ClaudeCodeStatus.vue**

Run: `rm src/renderer/src/views/ClaudeCodeStatus.vue`

- [ ] **Step 3: 验证 claudeCodeService.ts 调用方式**

检查 `src/main/service/claudeCodeService.ts` 中的调用：

```typescript
// 这些调用方式保持不变，无需修改
windowFactory.getNoticeManager().showClaudeCodeStatus('running', '🟢 Claude Code 会话运行中')
windowFactory.getNoticeManager().showClaudeCodeStatus('thinking', '📝 准备工作中...')
windowFactory.getNoticeManager().showClaudeCodeStatus('executing', `🔨 正在调用 ${toolName}...`)
windowFactory.getNoticeManager().hideClaudeCodeStatus()
```

由于 `NoticeManager` 的 `showClaudeCodeStatus`、`updateClaudeCodeStatus`、`hideClaudeCodeStatus` 方法签名保持不变，`claudeCodeService.ts` 无需修改。

- [ ] **Step 4: 编译检查**

Run: `npm run typecheck`
Expected: 无错误

---

## Task 5: 更新 CLAUDE.md 文档

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: 无
- Produces: 更新后的目录索引

- [ ] **Step 1: 删除目录索引中的 ClaudeCodeStatusFrame 条目**

在 `src/main/frame/` 部分，删除：

```markdown
│   │       ├── ClaudeCodeStatusFrame.ts # Claude Code 状态通知（常驻状态条）
```

在 `src/renderer/src/views/` 部分，删除：

```markdown
│   │   ├── ClaudeCodeStatus.vue # Claude Code 状态通知（常驻状态条）
```

- [ ] **Step 2: 更新 NoticeNewFrame 模块说明**

在「通知弹窗」部分，添加状态通知功能说明：

```markdown
### 通知弹窗 (src/main/frame/NoticeNewFrame.ts)
- **职责**: 底部居中弹出的通知提示窗口，支持翻译按钮、打开链接按钮和 Claude Code 状态通知
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
  - **Claude Code 状态通知**：通过 `isPersistent` 属性支持持久通知模式，显示 "Claude" 标识，不自动销毁
```

- [ ] **Step 3: 更新 NoticeManager 模块说明**

在「通知管理器」部分，添加 Claude Code 状态管理说明：

```markdown
### 通知管理器 (src/main/frame/NoticeManager.ts)
- **职责**: 管理多个通知窗口实例，支持通知堆叠、自定义时长和移动动画，以及 Claude Code 常驻状态通知
- **功能**:
  - 维护通知实例池（最多 5 个）
  - 新通知从底部出现，旧通知被向上顶起
  - 平滑过渡动画（300ms easeOutCubic）
  - 每个通知可自定义显示时长
  - 超过上限时自动销毁最早的通知
  - **Claude Code 状态管理**: 管理常驻状态通知的显示/更新/隐藏/销毁
  - **持久通知特殊堆叠**: 持久通知始终显示在最顶部，不受普通通知上限限制
```

- [ ] **Step 4: 编译检查**

Run: `npm run typecheck`
Expected: 无错误

---

## Task 6: 最终验证

**Files:**
- 无

**Interfaces:**
- Consumes: 无
- Produces: 完整合并后的通知系统

- [ ] **Step 1: 完整编译检查**

Run: `npm run build`
Expected: 构建成功，无错误

- [ ] **Step 2: 检查文件完整性**

确认以下文件已删除：
- `src/main/frame/ClaudeCodeStatusFrame.ts`
- `src/renderer/src/views/ClaudeCodeStatus.vue`

确认以下文件已修改：
- `src/main/frame/NoticeNewFrame.ts`
- `src/renderer/src/views/NoticeNew.vue`
- `src/main/frame/NoticeManager.ts`
- `CLAUDE.md`

- [ ] **Step 3: 检查 IPC 通信一致性**

确认 `claudeCodeService.ts` 中的调用方式仍然有效：
- `showClaudeCodeStatus(status, customText)` - 显示状态通知
- `updateClaudeCodeStatus(status, customText)` - 更新状态通知
- `hideClaudeCodeStatus()` - 隐藏状态通知

- [ ] **Step 4: 提交代码**

```bash
git add -A
git commit -m "refactor: 合并 Claude Code 状态通知和通用通知窗口

- 删除 ClaudeCodeStatusFrame，用 NoticeNewFrame 替代
- NoticeNewFrame 增加 isPersistent 属性支持持久通知
- NoticeNew.vue 增加 Claude 标识和持久通知样式
- NoticeManager 支持持久通知特殊堆叠规则
- 更新 CLAUDE.md 文档目录索引"
```
