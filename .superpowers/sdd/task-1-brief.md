# Task 1: 创建 PopupItem 类

**Files:**
- Create: `src/main/frame/PopupItem.ts`

**Interfaces:**
- Consumes: 无
- Produces: `PopupItem` 类，供 PopupManager 和现有弹窗类使用

## 任务描述

创建 PopupItem 类，封装弹窗窗口实例和元数据，供 PopupManager 统一管理。

## 完整代码

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

## 验证

运行 `npm run typecheck` 确保无类型错误

## 提交

```bash
git add src/main/frame/PopupItem.ts
git commit -m "feat: add PopupItem class for unified popup management"
```
