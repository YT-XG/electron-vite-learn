# Task 4: 修改 NoticeNewFrame 适配 PopupItem

**Files:**
- Modify: `src/main/frame/NoticeNewFrame.ts`

**Interfaces:**
- Consumes: `PopupManager` (from Task 2)
- Produces: NoticeNewFrame 可被 PopupManager 管理

## 任务描述

修改 NoticeNewFrame，确保它已有 `moveTo` 和 `getY` 方法，以便 PopupManager 可以管理它。

## 检查点

NoticeNewFrame 应该已经有 `moveTo` 和 `getY` 方法（从之前的实现中）。如果没有，需要添加。

## 需要确认的方法

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

## 验证

运行 `npm run typecheck` 确保无类型错误

## 提交

```bash
git add src/main/frame/NoticeNewFrame.ts
git commit -m "feat: adapt NoticeNewFrame for PopupManager integration"
```
