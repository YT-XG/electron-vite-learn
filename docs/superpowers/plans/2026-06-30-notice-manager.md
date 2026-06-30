# NoticeManager 多通知管理器实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现多通知并存系统，支持同时显示最多 5 个通知窗口，每个可自定义显示时长，新通知出现时旧通知平滑上移。

**Architecture:** 创建 NoticeManager 类管理多个 NoticeNewFrame 实例池，替代当前 WindowFactory 中的单例模式。每个通知是独立的 BrowserWindow 实例，由 manager 统一管理位置计算、生命周期和移动动画。

**Tech Stack:** Electron BrowserWindow, TypeScript, Vue 3 (renderer)

## Global Constraints

- TypeScript 严格模式
- 遵循项目 IPC 通信规范（recvOne/recvTwo/sendOne/sendOne）
- 窗口类必须继承 BaseFrame
- 修改代码后必须执行 `npm run typecheck` 编译检查
- 修改后必须更新 CLAUDE.md 文档

---

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `src/main/frame/NoticeManager.ts` | 新增 | 多通知管理器：实例池、位置计算、移动动画、生命周期 |
| `src/main/frame/NoticeNewFrame.ts` | 修改 | 适配 manager：移除内部自动销毁，新增 moveTo/duration 支持 |
| `src/main/frame/WindowFactory.ts` | 修改 | 接入 NoticeManager，删除单例 getNoticeNewFrame |
| `src/main/service/clipboardService.ts` | 修改 | 改用 noticeManager.show() |
| `src/main/service/trayService.ts` | 修改 | 改用 noticeManager.show() |
| `CLAUDE.md` | 修改 | 更新模块说明和 API 文档 |

---

## Task 1: 创建 NoticeManager 类

**Files:**
- Create: `src/main/frame/NoticeManager.ts`

**Interfaces:**
- Consumes: `NoticeNewFrame` (from Task 2, 需要 `setMsg()`, `setDuration()`, `showAtBottomCenter()`, `moveTo()`, `getY()`, `destroy()` 方法)
- Produces: `NoticeManager.show(options)`, `NoticeManager.destroyAll()`

- [ ] **Step 1: 创建 NoticeManager.ts 骨架**

```typescript
// src/main/frame/NoticeManager.ts
import { screen } from 'electron'
import NoticeNewFrame from './NoticeNewFrame'

/** 通知配置选项 */
export interface NoticeOptions {
  /** 通知文本内容 */
  text: string
  /** 是否显示翻译按钮，默认 false */
  showTranslate?: boolean
  /** 显示时长（毫秒），默认 5000 */
  duration?: number
}

/**
 * 多通知管理器
 * @description 管理多个 NoticeNewFrame 实例，支持通知堆叠、自定义时长和移动动画
 */
export default class NoticeManager {
  /** 最大同时显示通知数 */
  private readonly MAX_NOTICES = 5

  /** 每个通知窗口高度（像素） */
  private readonly POPUP_HEIGHT = 60

  /** 通知之间的间距（像素） */
  private readonly GAP = 8

  /** 距屏幕底部间距（像素） */
  private readonly BOTTOM_MARGIN = 60

  /** 当前存活的通知实例列表（索引 0 = 最新，越往后越旧） */
  private notices: NoticeNewFrame[] = []

  /**
   * 显示一个新通知
   * @param options - 通知配置
   */
  show(options: NoticeOptions): void {
    const { text, showTranslate = false, duration = 5000 } = options

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

    // 设置消息和时长（setMsg 会自动检测 URL 并设置 showOpenLink）
    notice.setMsg(text, showTranslate)
    notice.setDuration(duration)

    // 插入到列表头部（最新）
    this.notices.unshift(notice)

    // 重新排列所有通知位置
    this.repositionAll()

    // 显示新通知（在底部位置）
    notice.showAtBottomCenter()
  }

  /**
   * 重新计算所有通知位置并平滑移动
   */
  private repositionAll(): void {
    for (let i = 0; i < this.notices.length; i++) {
      const notice = this.notices[i]
      const targetY = this.calcY(i)
      notice.moveTo(targetY, true)
    }
  }

  /**
   * 计算第 index 个通知的 Y 坐标
   * @param index - 从底部开始的索引（0 = 最底部，最新）
   * @returns Y 坐标
   */
  private calcY(index: number): number {
    const display = screen.getPrimaryDisplay()
    const { workArea } = display
    return Math.round(
      workArea.y + workArea.height - this.BOTTOM_MARGIN - this.POPUP_HEIGHT - (this.POPUP_HEIGHT + this.GAP) * index
    )
  }

  /**
   * 移除指定通知并重新排列
   * @param notice - 要移除的通知实例
   */
  private removeNotice(notice: NoticeNewFrame): void {
    const index = this.notices.indexOf(notice)
    if (index !== -1) {
      this.notices.splice(index, 1)
      // 重新排列剩余通知
      this.repositionAll()
    }
  }

  /**
   * 销毁所有通知
   */
  destroyAll(): void {
    for (const notice of this.notices) {
      notice.onDestroyCallback = null
      notice.destroy()
    }
    this.notices = []
  }

  /**
   * 获取当前通知数量
   */
  getCount(): number {
    return this.notices.length
  }
}
```

- [ ] **Step 2: 编译检查**

Run: `npm run typecheck`
Expected: 编译错误（NoticeNewFrame 缺少 setDuration/moveTo/getY 方法），这是预期的，Task 2 会修复

- [ ] **Step 3: Commit**

```bash
git add src/main/frame/NoticeManager.ts
git commit -m "feat: 创建 NoticeManager 多通知管理器骨架"
```

---

## Task 2: 适配 NoticeNewFrame 支持 Manager 模式

**Files:**
- Modify: `src/main/frame/NoticeNewFrame.ts`

**Interfaces:**
- Consumes: 无外部依赖
- Produces: `setDuration(ms)`, `moveTo(y, animated?)`, `getY()` 方法供 NoticeManager 调用

- [ ] **Step 1: 添加 duration 私有字段和 setDuration 方法**

在 `NoticeNewFrame.ts` 中，删除 `AUTO_DESTROY_DELAY` 常量，添加实例级 duration 字段：

```typescript
// 删除这行：
// private static readonly AUTO_DESTROY_DELAY = 5000

// 添加实例级字段：
/** 显示时长（毫秒），默认 5000 */
#duration = 5000
```

添加 setDuration 方法（在 setMsg 方法附近）：

```typescript
/**
 * 设置显示时长
 * @param ms - 显示时长（毫秒）
 */
setDuration(ms: number): void {
  this.#duration = ms
}
```

- [ ] **Step 2: 修改 showAtBottomCenter 使用实例 duration**

将 `showAtBottomCenter()` 中的定时器改为使用 `this.#duration`：

```typescript
// 之前：
this.#destroyTimer = setTimeout(() => {
  this.destroy()
}, NoticeNewFrame.AUTO_DESTROY_DELAY)

// 之后：
this.#destroyTimer = setTimeout(() => {
  this.destroy()
}, this.#duration)
```

- [ ] **Step 3: 添加 moveTo 方法**

在 `NoticeNewFrame.ts` 中添加平滑移动方法：

```typescript
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
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)

    // 缓动函数：easeOutCubic - 先快后慢，自然停止
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

- [ ] **Step 4: 编译检查**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/main/frame/NoticeNewFrame.ts
git commit -m "feat: NoticeNewFrame 适配 Manager 模式，支持外部 duration 和 moveTo"
```

---

## Task 3: 修改 WindowFactory 接入 NoticeManager

**Files:**
- Modify: `src/main/frame/WindowFactory.ts`

**Interfaces:**
- Consumes: `NoticeManager` (from Task 1)
- Produces: `getNoticeManager()`, `showNoticeNew(options)` 便捷方法

- [ ] **Step 1: 导入 NoticeManager 并添加实例字段**

在 `WindowFactory.ts` 顶部添加导入：

```typescript
import NoticeManager from './NoticeManager'
```

在类中添加字段（替换 `#noticeNewFrame`）：

```typescript
// 删除这行：
// #noticeNewFrame: NoticeNewFrame | null = null

// 添加：
/** 多通知管理器 */
#noticeManager: NoticeManager | null = null
```

- [ ] **Step 2: 添加 getNoticeManager 方法**

替换原来的 `getNoticeNewFrame()` 方法：

```typescript
/**
 * 获取多通知管理器
 * @returns NoticeManager 实例
 */
getNoticeManager(): NoticeManager {
  if (!this.#noticeManager) {
    this.#noticeManager = new NoticeManager()
  }
  return this.#noticeManager
}

/**
 * 显示通知（便捷方法）
 * @param options - 通知配置
 */
showNoticeNew(options: import('./NoticeManager').NoticeOptions): void {
  this.getNoticeManager().show(options)
}
```

- [ ] **Step 3: 更新 destroyAll 和 closeAll**

```typescript
// destroyAll 中：
destroyAll(): void {
  this.#ballFrame?.destroy()
  this.#noticeManager?.destroyAll()  // 改为 manager
  this.#updateNewFrame?.destroy()
  this.#testFrame?.destroy()
  this.#openDialogFrame?.destroy()
  this.#mainPageFrame?.destroy()
}

// closeAll 中：
closeAll(): void {
  this.#ballFrame?.close()
  this.#noticeManager?.destroyAll()  // 改为 manager
  this.#updateNewFrame?.hide()
  this.#openDialogFrame?.hide()
  this.#mainPageFrame?.close()
}
```

- [ ] **Step 4: 移除 NoticeNewFrame 导入**

```typescript
// 删除这行：
// import NoticeNewFrame from './NoticeNewFrame'
```

- [ ] **Step 5: 编译检查**

Run: `npm run typecheck`
Expected: 编译错误（clipboardService、trayService 引用了已删除的 getNoticeNewFrame），这是预期的，Task 4 会修复

- [ ] **Step 6: Commit**

```bash
git add src/main/frame/WindowFactory.ts
git commit -m "feat: WindowFactory 接入 NoticeManager，删除单例模式"
```

---

## Task 4: 适配调用方 clipboardService 和 trayService

**Files:**
- Modify: `src/main/service/clipboardService.ts`
- Modify: `src/main/service/trayService.ts`

**Interfaces:**
- Consumes: `windowFactory.getNoticeManager().show(options)` (from Task 3)
- Produces: 调用方代码适配完成

- [ ] **Step 1: 修改 clipboardService.ts**

找到通知弹出代码（约 198-201 行），替换为：

```typescript
// 之前：
const noticeFrame = windowFactory.getNoticeNewFrame()
noticeFrame.setMsg(content, true)
noticeFrame.showAtBottomCenter()

// 之后：
windowFactory.getNoticeManager().show({
  text: content,
  showTranslate: true,
  duration: 5000
})
```

- [ ] **Step 2: 修改 trayService.ts**

找到通知弹出代码（约 99-109 行），替换为：

```typescript
// 之前：
const noticeNewFrame = windowFactory.getNoticeNewFrame()
noticeNewFrame.setMsg('正在检查更新...')
noticeNewFrame.showAtBottomCenter()

// 之后：
windowFactory.getNoticeManager().show({
  text: '正在检查更新...',
  duration: 3000
})
```

以及检查更新结果通知（约 107-109 行）：

```typescript
// 之前：
const noticeNewFrame = windowFactory.getNoticeNewFrame()
noticeNewFrame.setMsg(res?.msg || '')
noticeNewFrame.showAtBottomCenter()

// 之后：
windowFactory.getNoticeManager().show({
  text: res?.msg || '',
  duration: 5000
})
```

- [ ] **Step 3: 编译检查**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/main/service/clipboardService.ts src/main/service/trayService.ts
git commit -m "feat: 适配调用方使用 NoticeManager 新 API"
```

---

## Task 5: 完整构建检查和文档更新

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- 无

- [ ] **Step 1: 完整构建检查**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 2: 更新 CLAUDE.md 文档**

在 `CLAUDE.md` 中更新以下内容：

1. 目录索引中新增 `NoticeManager.ts` 文件
2. 窗口框架模块说明中新增 NoticeManager 说明
3. 更新 NoticeNewFrame 的说明（移除 5 秒固定时长描述）
4. 更新使用示例代码
5. 更新 IPC 接口说明

具体更新内容：

```markdown
### 通知管理器 (src/main/frame/NoticeManager.ts)
- **职责**: 管理多个通知窗口实例，支持通知堆叠、自定义时长和移动动画
- **功能**:
  - 维护通知实例池（最多 5 个）
  - 新通知从底部出现，旧通知被向上顶起
  - 平滑过渡动画（300ms easeOutCubic）
  - 每个通知可自定义显示时长
  - 超过上限时自动销毁最早的通知
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
  ```
```

- [ ] **Step 3: 编译检查**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: 更新 CLAUDE.md 文档，添加 NoticeManager 模块说明"
```
