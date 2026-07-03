# 统一弹窗管理系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建统一的 PopupManager 管理所有底部弹窗，解决弹窗重叠问题

**Architecture:** 使用 PopupManager 统一管理所有底部弹窗（通知、权限请求、更新），按时间排序堆叠显示，自动重定位

**Tech Stack:** Electron, TypeScript, BrowserWindow

## Global Constraints

- 跨平台兼容：Windows 和 macOS
- macOS 需要处理 Dock 高度
- 使用 `getBottomMargin()` 计算底部间距
- 动画使用 easeOutCubic/easeInCubic 缓动函数
- 弹窗使用 `showInactive()` 显示，不抢占焦点

---

## 文件结构

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `src/main/frame/PopupItem.ts` | 弹窗元数据类 |
| 新增 | `src/main/frame/PopupManager.ts` | 统一弹窗管理器 |
| 修改 | `src/main/frame/NoticeNewFrame.ts` | 适配 PopupItem 接口 |
| 修改 | `src/main/frame/PermissionNoticeFrame.ts` | 适配 PopupItem 接口 |
| 修改 | `src/main/frame/UpdateNewFrame.ts` | 适配 PopupItem 接口 |
| 修改 | `src/main/frame/WindowFactory.ts` | 集成 PopupManager |
| 修改 | `src/main/service/claudeCodeService.ts` | 使用 PopupManager |
| 修改 | `src/main/frame/index.ts` | 导出 PopupManager |
| 删除 | `src/main/frame/NoticeManager.ts` | 功能被 PopupManager 吸收 |

---

### Task 1: 创建 PopupItem 类

**Files:**
- Create: `src/main/frame/PopupItem.ts`

**Interfaces:**
- Consumes: 无
- Produces: `PopupItem` 类，供 PopupManager 和现有弹窗类使用

- [ ] **Step 1: 创建 PopupItem.ts 文件**

```typescript
// src/main/frame/PopupItem.ts
import { BrowserWindow, screen } from 'electron'
import { isMacOS } from '../utils/platform'

/** 弹窗类型 */
export type PopupType = 'notice' | 'permission' | 'update'

/** 弹窗配置选项 */
export interface PopupOptions {
  /** 弹窗类型 */
  type: PopupType
  /** 弹窗宽度 */
  width: number
  /** 弹窗高度 */
  height: number
  /** 是否为 Claude 状态通知 */
  isClaudeStatus?: boolean
}

/**
 * 弹窗元数据
 * @description 封装弹窗窗口实例和元数据，供 PopupManager 统一管理
 */
export default class PopupItem {
  /** 唯一标识 */
  readonly id: string

  /** 弹窗类型 */
  readonly type: PopupType

  /** 是否为 Claude 状态通知 */
  readonly isClaudeStatus: boolean

  /** 窗口实例 */
  window: BrowserWindow | null

  /** 弹窗高度 */
  readonly height: number

  /** 弹窗宽度 */
  readonly width: number

  /** 创建时间（用于排序） */
  readonly createdAt: number

  /** 动画帧 ID */
  #animationFrameId: ReturnType<typeof setTimeout> | null = null

  /** 隐藏动画定时器 */
  #hideTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 构造函数
   * @param options - 弹窗配置
   * @param window - 浏览器窗口实例
   */
  constructor(options: PopupOptions, window: BrowserWindow) {
    this.id = `popup-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    this.type = options.type
    this.isClaudeStatus = options.isClaudeStatus ?? false
    this.window = window
    this.height = options.height
    this.width = options.width
    this.createdAt = Date.now()
  }

  /**
   * 移动到目标 Y 坐标
   * @param targetY - 目标 Y 坐标
   * @param animated - 是否使用动画，默认 true
   */
  moveTo(targetY: number, animated = true): void {
    if (!this.window || this.window.isDestroyed()) return

    if (!animated) {
      const [x] = this.window.getPosition()
      this.window.setPosition(x, targetY)
      return
    }

    const [x, startY] = this.window.getPosition()
    if (startY === targetY) return

    // 清除之前的动画
    if (this.#animationFrameId) {
      clearTimeout(this.#animationFrameId)
    }

    const duration = 300
    const startTime = Date.now()

    const animate = (): void => {
      if (!this.window || this.window.isDestroyed()) return

      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      // easeOutCubic 缓动函数：先快后慢，自然停止
      const easeOutCubic = 1 - Math.pow(1 - progress, 3)
      const currentY = Math.round(startY + (targetY - startY) * easeOutCubic)

      this.window.setPosition(x, currentY)

      if (progress < 1) {
        this.#animationFrameId = setTimeout(animate, 8)
      } else {
        this.#animationFrameId = null
      }
    }

    animate()
  }

  /**
   * 执行窗口收起动画（向下滑出）
   * @param duration - 动画时长（毫秒）
   * @returns Promise 动画完成后 resolve
   */
  animateSlideDown(duration = 250): Promise<void> {
    return new Promise((resolve) => {
      if (!this.window || this.window.isDestroyed()) {
        resolve()
        return
      }

      // 清除之前的动画
      if (this.#animationFrameId) {
        clearTimeout(this.#animationFrameId)
      }

      const startTime = Date.now()
      const [x, startY] = this.window.getPosition()

      // 目标位置：屏幕底部外
      const display = screen.getPrimaryDisplay()
      const { workArea, bounds } = display
      const dockHeight = isMacOS()
        ? bounds.y + bounds.height - (workArea.y + workArea.height)
        : 0
      const screenHeight = workArea.height + workArea.y + dockHeight
      const targetY = screenHeight + 10

      const animate = (): void => {
        if (!this.window || this.window.isDestroyed()) {
          resolve()
          return
        }

        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)

        // easeInCubic 缓动函数：先慢后快，自然离开
        const easeInCubic = progress * progress * progress
        const currentY = Math.round(startY + (targetY - startY) * easeInCubic)

        this.window.setPosition(x, currentY)

        if (progress < 1) {
          this.#animationFrameId = setTimeout(animate, 8)
        } else {
          this.#animationFrameId = null
          resolve()
        }
      }

      animate()
    })
  }

  /**
   * 销毁弹窗（带收起动画）
   * @returns Promise 动画完成后 resolve
   */
  async destroy(): Promise<void> {
    // 清除定时器
    if (this.#hideTimer) {
      clearTimeout(this.#hideTimer)
      this.#hideTimer = null
    }

    // 播放收起动画
    if (this.window && !this.window.isDestroyed()) {
      await this.animateSlideDown(250)
    }

    // 清理动画帧
    if (this.#animationFrameId) {
      clearTimeout(this.#animationFrameId)
      this.#animationFrameId = null
    }

    // 销毁窗口
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
  }

  /**
   * 获取窗口当前 Y 坐标
   * @returns Y 坐标，窗口不存在时返回 0
   */
  getY(): number {
    if (!this.window || this.window.isDestroyed()) return 0
    const [, y] = this.window.getPosition()
    return y
  }

  /**
   * 检查窗口是否存活
   * @returns 窗口是否存活
   */
  isAlive(): boolean {
    return this.window !== null && !this.window.isDestroyed()
  }
}
```

- [ ] **Step 2: 验证文件创建成功**

Run: `npm run typecheck`
Expected: 无错误（PopupItem 类型正确）

- [ ] **Step 3: 提交代码**

```bash
git add src/main/frame/PopupItem.ts
git commit -m "feat: add PopupItem class for unified popup management"
```

---

### Task 2: 创建 PopupManager 类

**Files:**
- Create: `src/main/frame/PopupManager.ts`

**Interfaces:**
- Consumes: `PopupItem` (from Task 1)
- Produces: `PopupManager` 类，供 WindowFactory 和 claudeCodeService 使用

- [ ] **Step 1: 创建 PopupManager.ts 文件**

```typescript
// src/main/frame/PopupManager.ts
import { screen } from 'electron'
import PopupItem, { type PopupOptions, type PopupType } from './PopupItem'
import { getBottomMargin } from '../utils/platform'

/** 通知类型 */
export type NoticeType = 'default' | 'success' | 'error' | 'warning'

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

/** 通知配置选项 */
export interface NoticeOptions {
  /** 通知文本内容 */
  text: string
  /** 是否显示翻译按钮，默认 false */
  showTranslate?: boolean
  /** 显示时长（毫秒），默认 5000 */
  duration?: number
  /** 通知类型，默认 'default' */
  type?: NoticeType
}

/**
 * 统一弹窗管理器
 * @description 管理所有底部弹窗的位置和生命周期，支持通知堆叠、自定义时长和移动动画
 */
export default class PopupManager {
  /** 最大同时显示弹窗数 */
  private readonly MAX_POPUPS = 5

  /** 弹窗之间的间距（像素） */
  private readonly GAP = 8

  /** 距屏幕底部间距（像素） */
  private readonly BOTTOM_MARGIN = 60

  /** 当前存活的弹窗列表（索引 0 = 最新，越往后越旧） */
  private popups: PopupItem[] = []

  /** Claude 状态通知（特殊管理，单例） */
  private claudeStatusPopup: PopupItem | null = null

  /** 权限请求弹窗（特殊管理，单例） */
  private permissionPopup: PopupItem | null = null

  // ========== 显示方法 ==========

  /**
   * 显示普通通知
   * @param options - 通知配置
   * @param createWindowFn - 创建窗口的函数，返回 BrowserWindow
   * @param options - 弹窗配置
   * @returns PopupItem 实例
   */
  showNotice(
    createWindowFn: () => BrowserWindow,
    popupOptions: PopupOptions,
    noticeOptions: NoticeOptions
  ): PopupItem {
    const { duration = 5000 } = noticeOptions

    // 如果已达到上限，销毁最早的（最上面的）弹窗
    if (this.popups.length >= this.MAX_POPUPS) {
      const oldest = this.popups[this.popups.length - 1]
      this.removePopup(oldest)
    }

    // 创建新弹窗
    const window = createWindowFn()
    const popup = new PopupItem(popupOptions, window)

    // 设置销毁定时器
    if (duration > 0) {
      setTimeout(() => {
        this.removePopup(popup)
      }, duration)
    }

    // 添加到列表头部
    this.popups.unshift(popup)

    // 重新排列所有弹窗位置
    this.repositionAll()

    return popup
  }

  /**
   * 显示或更新 Claude 状态通知
   * @description 如果状态通知不存在则创建，已存在则更新内容
   * @param status - 状态类型
   * @param customText - 自定义状态文本（可选）
   * @param createWindowFn - 创建窗口的函数，返回 BrowserWindow
   * @param updateContentFn - 更新内容的函数
   */
  showClaudeStatus(
    status: ClaudeCodeStatus,
    customText: string | undefined,
    createWindowFn: () => BrowserWindow,
    updateContentFn: (window: BrowserWindow, text: string, type: NoticeType) => void
  ): void {
    const config = STATUS_CONFIG[status]
    const text = customText || config.text

    if (this.claudeStatusPopup && this.claudeStatusPopup.isAlive()) {
      // 已存在 → 更新内容
      updateContentFn(this.claudeStatusPopup.window!, text, 'default')
      this.claudeStatusPopup.showAtBottomCenter()
    } else {
      // 不存在 → 创建新弹窗
      const window = createWindowFn()
      const popup = new PopupItem(
        { type: 'notice', width: window.getBounds().width, height: 60, isClaudeStatus: true },
        window
      )

      updateContentFn(window, text, 'default')

      this.claudeStatusPopup = popup
      this.popups.unshift(popup)

      // 重新排列所有弹窗位置
      this.repositionAll()
    }
  }

  /**
   * 隐藏 Claude 状态通知
   * @description 销毁状态通知并从堆叠中移除
   */
  hideClaudeStatus(): void {
    if (this.claudeStatusPopup) {
      this.removePopup(this.claudeStatusPopup)
      this.claudeStatusPopup = null
    }
  }

  /**
   * 显示或更新权限请求弹窗
   * @description 如果权限弹窗不存在则创建，已存在则更新内容
   * @param createWindowFn - 创建窗口的函数，返回 BrowserWindow
   * @param popupOptions - 弹窗配置
   * @param showContentFn - 显示内容的函数
   * @returns PopupItem 实例
   */
  showPermissionNotice(
    createWindowFn: () => BrowserWindow,
    popupOptions: PopupOptions,
    showContentFn: (window: BrowserWindow) => void
  ): PopupItem {
    if (this.permissionPopup && this.permissionPopup.isAlive()) {
      // 已存在 → 更新内容
      showContentFn(this.permissionPopup.window!)
      return this.permissionPopup
    }

    // 不存在 → 创建新弹窗
    const window = createWindowFn()
    const popup = new PopupItem(popupOptions, window)

    showContentFn(window)

    this.permissionPopup = popup
    this.popups.unshift(popup)

    // 重新排列所有弹窗位置
    this.repositionAll()

    return popup
  }

  /**
   * 销毁权限请求弹窗
   */
  destroyPermissionNotice(): void {
    if (this.permissionPopup) {
      this.removePopup(this.permissionPopup)
      this.permissionPopup = null
    }
  }

  /**
   * 显示更新通知
   * @param createWindowFn - 创建窗口的函数，返回 BrowserWindow
   * @param popupOptions - 弹窗配置
   * @param showContentFn - 显示内容的函数
   * @returns PopupItem 实例
   */
  showUpdateNotice(
    createWindowFn: () => BrowserWindow,
    popupOptions: PopupOptions,
    showContentFn: (window: BrowserWindow) => void
  ): PopupItem {
    // 如果已达到上限，销毁最早的弹窗
    if (this.popups.length >= this.MAX_POPUPS) {
      const oldest = this.popups[this.popups.length - 1]
      this.removePopup(oldest)
    }

    // 创建新弹窗
    const window = createWindowFn()
    const popup = new PopupItem(popupOptions, window)

    showContentFn(window)

    // 添加到列表头部
    this.popups.unshift(popup)

    // 重新排列所有弹窗位置
    this.repositionAll()

    return popup
  }

  // ========== 通用方法 ==========

  /**
   * 移除指定弹窗并重新排列
   * @param popup - 要移除的弹窗
   */
  private removePopup(popup: PopupItem): void {
    const index = this.popups.indexOf(popup)
    if (index !== -1) {
      this.popups.splice(index, 1)
    }

    // 销毁弹窗（带动画）
    popup.destroy()

    // 重新排列所有弹窗
    this.repositionAll()
  }

  /**
   * 重新计算所有弹窗位置并平滑移动
   * @description 从底部开始堆叠，每个弹窗占据 height + gap 的空间
   */
  private repositionAll(): void {
    for (let i = 0; i < this.popups.length; i++) {
      const popup = this.popups[i]
      const targetY = this.calcY(i)
      popup.moveTo(targetY, true)
    }
  }

  /**
   * 计算第 index 个弹窗的 Y 坐标
   * @param index - 从底部开始的索引（0 = 最底部，最新）
   * @returns Y 坐标
   */
  private calcY(index: number): number {
    const display = screen.getPrimaryDisplay()
    const { workArea } = display
    const screenHeight = workArea.height + workArea.y

    // macOS 需要额外加上 Dock 高度
    const bottomMargin = getBottomMargin(this.BOTTOM_MARGIN)

    // 从底部开始累加高度
    let y = screenHeight - bottomMargin
    for (let i = 0; i <= index; i++) {
      y -= this.popups[i].height
      if (i < index) {
        y -= this.GAP
      }
    }

    return Math.round(y)
  }

  /**
   * 销毁所有弹窗
   */
  destroyAll(): void {
    for (const popup of this.popups) {
      popup.destroy()
    }
    this.popups = []
    this.claudeStatusPopup = null
    this.permissionPopup = null
  }

  /**
   * 获取当前弹窗数量
   * @returns 弹窗数量
   */
  getPopupCount(): number {
    return this.popups.length
  }

  /**
   * 获取所有弹窗
   * @returns 弹窗列表
   */
  getPopups(): PopupItem[] {
    return [...this.popups]
  }
}
```

- [ ] **Step 2: 验证文件创建成功**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 3: 提交代码**

```bash
git add src/main/frame/PopupManager.ts
git commit -m "feat: add PopupManager for unified popup management"
```

---

### Task 3: 修改 WindowFactory 集成 PopupManager

**Files:**
- Modify: `src/main/frame/WindowFactory.ts`
- Modify: `src/main/frame/index.ts`

**Interfaces:**
- Consumes: `PopupManager` (from Task 2)
- Produces: `windowFactory.getPopupManager()` 方法

- [ ] **Step 1: 修改 WindowFactory.ts 集成 PopupManager**

```typescript
// src/main/frame/WindowFactory.ts
// 在文件顶部导入 PopupManager
import PopupManager from './PopupManager'

// 在 WindowFactory 类中添加 PopupManager
export default class WindowFactory {
  // ... 现有属性

  /** 统一弹窗管理器 */
  private popupManager: PopupManager

  constructor() {
    // ... 现有初始化代码
    this.popupManager = new PopupManager()
  }

  // ... 现有方法

  /**
   * 获取统一弹窗管理器
   * @returns PopupManager 实例
   */
  getPopupManager(): PopupManager {
    return this.popupManager
  }
}
```

- [ ] **Step 2: 修改 index.ts 导出 PopupManager**

```typescript
// src/main/frame/index.ts
export { default as PopupManager } from './PopupManager'
export type { NoticeOptions, NoticeType, ClaudeCodeStatus } from './PopupManager'
```

- [ ] **Step 3: 验证修改**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 4: 提交代码**

```bash
git add src/main/frame/WindowFactory.ts src/main/frame/index.ts
git commit -m "feat: integrate PopupManager into WindowFactory"
```

---

### Task 4: 修改 NoticeNewFrame 适配 PopupItem

**Files:**
- Modify: `src/main/frame/NoticeNewFrame.ts`

**Interfaces:**
- Consumes: `PopupManager` (from Task 2)
- Produces: NoticeNewFrame 可被 PopupManager 管理

- [ ] **Step 1: 修改 NoticeNewFrame 添加 moveTo 方法**

```typescript
// src/main/frame/NoticeNewFrame.ts
// 添加 moveTo 方法（如果没有的话）

/**
 * 平滑移动窗口到目标 Y 坐标
 * @param targetY - 目标 Y 坐标
 * @param animated - 是否使用动画，默认 true
 */
moveTo(targetY: number, animated = true): void {
  if (!this.isAlive()) return

  if (!animated) {
    const [x] = this.window!.getPosition()
    this.window!.setPosition(x, targetY)
    return
  }

  const [x, startY] = this.window!.getPosition()
  if (startY === targetY) return

  const duration = 300
  const startTime = Date.now()

  const animate = (): void => {
    if (!this.isAlive()) return
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)

    // easeOutCubic 缓动函数：先快后慢，自然停止
    const easeOutCubic = 1 - Math.pow(1 - progress, 3)
    const currentY = Math.round(startY + (targetY - startY) * easeOutCubic)

    this.window!.setPosition(x, currentY)

    if (progress < 1) {
      setTimeout(animate, 8)
    }
  }

  animate()
}

/**
 * 获取窗口当前 Y 坐标
 * @returns Y 坐标，窗口不存在时返回 0
 */
getY(): number {
  if (!this.isAlive()) return 0
  const [, y] = this.window!.getPosition()
  return y
}
```

- [ ] **Step 2: 验证修改**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 3: 提交代码**

```bash
git add src/main/frame/NoticeNewFrame.ts
git commit -m "feat: adapt NoticeNewFrame for PopupManager integration"
```

---

### Task 5: 修改 PermissionNoticeFrame 适配 PopupItem

**Files:**
- Modify: `src/main/frame/PermissionNoticeFrame.ts`

**Interfaces:**
- Consumes: `PopupManager` (from Task 2)
- Produces: PermissionNoticeFrame 可被 PopupManager 管理

- [ ] **Step 1: 修改 PermissionNoticeFrame 添加 moveTo 方法**

```typescript
// src/main/frame/PermissionNoticeFrame.ts
// 添加 moveTo 方法（如果没有的话）

/**
 * 平滑移动窗口到目标 Y 坐标
 * @param targetY - 目标 Y 坐标
 * @param animated - 是否使用动画，默认 true
 */
moveTo(targetY: number, animated = true): void {
  if (!this.isAlive()) return

  if (!animated) {
    const [x] = this.window!.getPosition()
    this.window!.setPosition(x, targetY)
    return
  }

  const [x, startY] = this.window!.getPosition()
  if (startY === targetY) return

  const duration = 300
  const startTime = Date.now()

  const animate = (): void => {
    if (!this.isAlive()) return
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)

    // easeOutCubic 缓动函数：先快后慢，自然停止
    const easeOutCubic = 1 - Math.pow(1 - progress, 3)
    const currentY = Math.round(startY + (targetY - startY) * easeOutCubic)

    this.window!.setPosition(x, currentY)

    if (progress < 1) {
      setTimeout(animate, 8)
    }
  }

  animate()
}

/**
 * 获取窗口当前 Y 坐标
 * @returns Y 坐标，窗口不存在时返回 0
 */
getY(): number {
  if (!this.isAlive()) return 0
  const [, y] = this.window!.getPosition()
  return y
}
```

- [ ] **Step 2: 验证修改**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 3: 提交代码**

```bash
git add src/main/frame/PermissionNoticeFrame.ts
git commit -m "feat: adapt PermissionNoticeFrame for PopupManager integration"
```

---

### Task 6: 修改 UpdateNewFrame 适配 PopupItem

**Files:**
- Modify: `src/main/frame/UpdateNewFrame.ts`

**Interfaces:**
- Consumes: `PopupManager` (from Task 2)
- Produces: UpdateNewFrame 可被 PopupManager 管理

- [ ] **Step 1: 修改 UpdateNewFrame 添加 moveTo 方法**

```typescript
// src/main/frame/UpdateNewFrame.ts
// 添加 moveTo 方法（如果没有的话）

/**
 * 平滑移动窗口到目标 Y 坐标
 * @param targetY - 目标 Y 坐标
 * @param animated - 是否使用动画，默认 true
 */
moveTo(targetY: number, animated = true): void {
  if (!this.isAlive()) return

  if (!animated) {
    const [x] = this.window!.getPosition()
    this.window!.setPosition(x, targetY)
    return
  }

  const [x, startY] = this.window!.getPosition()
  if (startY === targetY) return

  const duration = 300
  const startTime = Date.now()

  const animate = (): void => {
    if (!this.isAlive()) return
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)

    // easeOutCubic 缓动函数：先快后慢，自然停止
    const easeOutCubic = 1 - Math.pow(1 - progress, 3)
    const currentY = Math.round(startY + (targetY - startY) * easeOutCubic)

    this.window!.setPosition(x, currentY)

    if (progress < 1) {
      setTimeout(animate, 8)
    }
  }

  animate()
}

/**
 * 获取窗口当前 Y 坐标
 * @returns Y 坐标，窗口不存在时返回 0
 */
getY(): number {
  if (!this.isAlive()) return 0
  const [, y] = this.window!.getPosition()
  return y
}
```

- [ ] **Step 2: 验证修改**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 3: 提交代码**

```bash
git add src/main/frame/UpdateNewFrame.ts
git commit -m "feat: adapt UpdateNewFrame for PopupManager integration"
```

---

### Task 7: 修改 claudeCodeService 使用 PopupManager

**Files:**
- Modify: `src/main/service/claudeCodeService.ts`

**Interfaces:**
- Consumes: `PopupManager` (from Task 2)
- Produces: claudeCodeService 使用 PopupManager 管理 Claude 相关弹窗

- [ ] **Step 1: 修改 claudeCodeService.ts 使用 PopupManager**

```typescript
// src/main/service/claudeCodeService.ts
// 在文件顶部导入 PopupManager
import { windowFactory } from '../frame'
import type { ClaudeCodeStatus } from '../frame/PopupManager'

// 修改 handleEvent 方法
private handleEvent(event: ClaudeCodeEvent): void {
  const popupManager = windowFactory.getPopupManager()

  switch (event.type) {
    case 'SessionStart':
      // 显示状态通知，5秒后自动销毁
      popupManager.showClaudeStatus(
        'running',
        undefined,
        () => this.createNoticeWindow(),
        (window, text, type) => this.updateNoticeContent(window, text, type)
      )
      setTimeout(() => popupManager.hideClaudeStatus(), 5000)
      break

    case 'PermissionRequest':
      // 更新状态通知
      popupManager.showClaudeStatus(
        'waiting_permission',
        undefined,
        () => this.createNoticeWindow(),
        (window, text, type) => this.updateNoticeContent(window, text, type)
      )
      // 显示权限弹窗
      popupManager.showPermissionNotice(
        () => this.createPermissionWindow(),
        { type: 'permission', width: 520, height: 140 },
        (window) => this.showPermissionContent(window, event.info)
      )
      break

    case 'AskUserQuestion':
      // 更新状态通知
      popupManager.showClaudeStatus(
        'waiting_permission',
        undefined,
        () => this.createNoticeWindow(),
        (window, text, type) => this.updateNoticeContent(window, text, type)
      )
      // 显示或更新权限弹窗
      popupManager.showPermissionNotice(
        () => this.createPermissionWindow(),
        { type: 'permission', width: 520, height: 140 },
        (window) => this.showPermissionContent(window, event.info)
      )
      break

    case 'Stop':
    case 'StopFailure':
      // 更新状态通知为"任务完成"
      popupManager.showClaudeStatus(
        'completed',
        undefined,
        () => this.createNoticeWindow(),
        (window, text, type) => this.updateNoticeContent(window, text, type)
      )
      // 销毁权限弹窗
      popupManager.destroyPermissionNotice()
      // 延迟销毁状态通知
      setTimeout(() => popupManager.hideClaudeStatus(), 2000)
      break

    case 'SessionEnd':
      // 销毁所有 Claude 相关弹窗
      popupManager.hideClaudeStatus()
      popupManager.destroyPermissionNotice()
      break

    default:
      // 其他状态：销毁权限弹窗
      popupManager.destroyPermissionNotice()
      break
  }
}

// 添加辅助方法
private createNoticeWindow(): BrowserWindow {
  // 创建通知窗口的逻辑
  // 从 NoticeNewFrame 中提取
}

private updateNoticeContent(window: BrowserWindow, text: string, type: NoticeType): void {
  // 更新通知内容的逻辑
  // 从 NoticeNewFrame 中提取
}

private createPermissionWindow(): BrowserWindow {
  // 创建权限窗口的逻辑
  // 从 PermissionNoticeFrame 中提取
}

private showPermissionContent(window: BrowserWindow, info: PermissionRequestInfo): void {
  // 显示权限内容的逻辑
  // 从 PermissionNoticeFrame 中提取
}
```

- [ ] **Step 2: 验证修改**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 3: 提交代码**

```bash
git add src/main/service/claudeCodeService.ts
git commit -m "feat: refactor claudeCodeService to use PopupManager"
```

---

### Task 8: 删除 NoticeManager

**Files:**
- Delete: `src/main/frame/NoticeManager.ts`
- Modify: `src/main/frame/index.ts` (移除 NoticeManager 导出)
- Modify: `src/main/frame/WindowFactory.ts` (移除 NoticeManager 相关代码)

**Interfaces:**
- Consumes: 无
- Produces: NoticeManager 被 PopupManager 完全替代

- [ ] **Step 1: 检查 NoticeManager 的使用情况**

```bash
grep -r "NoticeManager" src/
grep -r "noticeManager" src/
```

- [ ] **Step 2: 移除 WindowFactory 中的 NoticeManager**

```typescript
// src/main/frame/WindowFactory.ts
// 删除 NoticeManager 相关的属性和方法
// 删除 getNoticeManager() 方法
// 删除 noticeManager 属性
```

- [ ] **Step 3: 移除 index.ts 中的 NoticeManager 导出**

```typescript
// src/main/frame/index.ts
// 删除 NoticeManager 的导出
// 删除 NoticeOptions、NoticeType、ClaudeCodeStatus 的导出（已移到 PopupManager）
```

- [ ] **Step 4: 删除 NoticeManager.ts 文件**

```bash
rm src/main/frame/NoticeManager.ts
```

- [ ] **Step 5: 验证修改**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 6: 提交代码**

```bash
git add -A
git commit -m "feat: remove NoticeManager, fully replaced by PopupManager"
```

---

### Task 9: 更新 CLAUDE.md 文档

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: 无
- Produces: 文档更新，反映新的弹窗管理系统

- [ ] **Step 1: 更新 CLAUDE.md 中的目录索引**

```markdown
## 目录索引

在窗口框架部分更新：
- 删除 NoticeManager.ts
- 添加 PopupManager.ts
- 添加 PopupItem.ts
```

- [ ] **Step 2: 更新模块说明**

```markdown
### 通知管理器 → 统一弹窗管理器

**职责**: 管理所有底部弹窗的位置和生命周期，支持通知堆叠、自定义时长和移动动画

**关键文件**:
- `PopupManager.ts` - 统一弹窗管理器，管理所有底部弹窗
- `PopupItem.ts` - 弹窗元数据类

**功能**:
- 管理所有底部弹窗（通知、权限请求、更新）
- 按时间排序堆叠显示
- 自动重定位
- Claude 状态通知特殊管理
- 权限请求弹窗特殊管理
```

- [ ] **Step 3: 提交代码**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md to reflect PopupManager changes"
```

---

### Task 10: 端到端测试

**Files:**
- 无新增文件

**Interfaces:**
- Consumes: 所有之前的任务
- Produces: 验证系统正常工作

- [ ] **Step 1: 运行完整构建检查**

```bash
npm run build
```

Expected: 构建成功，无错误

- [ ] **Step 2: 启动应用测试**

```bash
npm run dev
```

- [ ] **Step 3: 测试通知堆叠**

1. 复制多段文本，触发多个通知
2. 验证通知从底部开始堆叠
3. 验证旧通知向上移动
4. 验证动画平滑

- [ ] **Step 4: 测试 Claude 状态通知**

1. 启动 Claude Code 会话
2. 验证状态通知显示
3. 验证状态更新时内容变化
4. 验证会话结束时状态通知销毁

- [ ] **Step 5: 测试权限请求弹窗**

1. 触发权限请求
2. 验证权限弹窗显示
3. 验证权限弹窗与其他弹窗不重叠
4. 验证权限操作后弹窗销毁

- [ ] **Step 6: 测试弹窗重叠**

1. 同时触发通知、权限请求、更新通知
2. 验证所有弹窗不重叠
3. 验证弹窗按时间顺序排列
4. 验证弹窗销毁后其他弹窗自动重定位

- [ ] **Step 7: 提交最终代码**

```bash
git add -A
git commit -m "feat: complete unified popup manager implementation"
```

---

## 执行顺序

```
Task 1 (PopupItem) 
    ↓
Task 2 (PopupManager) 
    ↓
Task 3 (WindowFactory 集成)
    ↓
Task 4-6 (现有弹窗适配，可并行)
    ↓
Task 7 (claudeCodeService 集成)
    ↓
Task 8 (删除 NoticeManager)
    ↓
Task 9 (文档更新)
    ↓
Task 10 (端到端测试)
```

## 注意事项

1. **渐进式迁移**：先创建新文件，再修改现有文件，最后删除旧文件
2. **类型安全**：确保所有类型定义正确，避免运行时错误
3. **动画一致性**：保持现有弹窗的动画效果不变
4. **跨平台测试**：在 Windows 和 macOS 上分别测试
5. **向后兼容**：确保现有功能不受影响
