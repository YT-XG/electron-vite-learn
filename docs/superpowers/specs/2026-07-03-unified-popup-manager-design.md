# 统一弹窗管理系统设计文档

## 1. 背景与问题

当前系统中存在多种底部弹窗，它们各自管理自己的位置，导致重叠问题：

- **通知弹窗** (NoticeNewFrame)：由 NoticeManager 管理，支持多实例堆叠
- **权限请求弹窗** (PermissionNoticeFrame)：单独管理，无位置协调
- **更新通知弹窗** (UpdateNewFrame)：单独管理，虽有重定位逻辑但不完善

当多种弹窗同时出现时（如剪贴板通知 + Claude 权限请求 + 更新通知），它们会重叠显示，影响用户体验。

## 2. 设计目标

1. **统一管理**：所有底部弹窗由单一管理器统一管理
2. **按时间排序**：弹窗按出现时间排序，最新出现的在最下方
3. **自动重定位**：弹窗添加或移除时，自动重新计算所有弹窗位置
4. **平滑动画**：位置变化时使用 easeOutCubic 缓动函数平滑移动
5. **保持现有动画**：弹窗的入场和退场动画保持不变

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    PopupManager                     │
│         (统一管理所有底部弹窗的位置和生命周期)         │
├─────────────────────────────────────────────────────┤
│  - popups: PopupItem[]         (按时间排序的弹窗列表)  │
│  - claudeStatusPopup: PopupItem | null (Claude状态)  │
│  - permissionPopup: PopupItem | null (权限请求)      │
│                                                     │
│  显示方法:                                           │
│  - showNotice(options)         (显示普通通知)         │
│  - showPermissionNotice(info)  (显示权限请求)         │
│  - showUpdateNotice(data)      (显示更新通知)         │
│                                                     │
│  Claude状态方法:                                     │
│  - showClaudeStatus(status)    (显示或更新状态通知)   │
│  - hideClaudeStatus()          (隐藏状态通知)         │
│                                                     │
│  权限弹窗方法:                                       │
│  - destroyPermissionNotice()   (销毁权限弹窗)        │
│                                                     │
│  通用方法:                                           │
│  - removePopup(id)             (移除弹窗)            │
│  - repositionAll()             (重新计算位置)         │
│  - getPopupCount()             (获取弹窗数量)         │
└─────────────────────────────────────────────────────┘
```

### 3.2 PopupItem 类

```typescript
/** 弹窗类型 */
type PopupType = 'notice' | 'permission' | 'update'

/** 弹窗配置选项 */
interface PopupOptions {
  type: PopupType
  width: number
  height: number
  isClaudeStatus?: boolean  // 是否为 Claude 状态通知
}

/** 弹窗元数据 */
class PopupItem {
  readonly id: string              // 唯一标识（nanoid 生成）
  readonly type: PopupType         // 弹窗类型
  readonly isClaudeStatus: boolean // 是否为 Claude 状态通知
  window: BrowserWindow | null     // 窗口实例
  readonly height: number          // 弹窗高度
  readonly width: number           // 弹窗宽度
  readonly createdAt: number       // 创建时间（用于排序）

  /** 移动到目标 Y 坐标 */
  moveTo(targetY: number, animated?: boolean): void

  /** 销毁弹窗 */
  destroy(): Promise<void>
}
```

## 4. 弹窗生命周期

### 4.1 Claude 状态通知

```
SessionStart → 显示"🟢 会话运行中" → 5秒后自动销毁
    │
    ▼
PermissionRequest → 更新为"⏳ 等待权限" → 不自动销毁
    │
    ▼
用户操作权限 → 状态可能变化 → 根据新状态决定是否销毁
    │
    ▼
Stop/StopFailure → 更新为"✅ 任务完成" → 短暂显示后销毁
    │
    ▼
SessionEnd → 销毁
```

### 4.2 权限请求弹窗

```
PermissionRequest → 显示权限弹窗
    │
    ▼
AskUserQuestion → 显示权限弹窗（同上，可能是同一个）
    │
    ▼
状态改变为其他（非 PermissionRequest/AskUserQuestion）
    → 权限弹窗自动销毁
    │
    ▼
用户点击按钮（同意/拒绝/全部同意）
    → 权限弹窗销毁
```

### 4.3 状态转换与弹窗行为对照表

| 事件 | Claude状态通知 | 权限请求弹窗 |
|------|---------------|-------------|
| SessionStart | 显示"会话运行中"，5秒后销毁 | 不影响 |
| PermissionRequest | 更新为"等待权限"，不自动销毁 | 显示弹窗 |
| AskUserQuestion | 更新为"等待权限"，不自动销毁 | 显示弹窗（如果未显示） |
| 其他状态 | 根据状态更新或销毁 | **自动销毁** |
| Stop/StopFailure | 更新为"任务完成"，短暂后销毁 | **自动销毁** |
| SessionEnd | 销毁 | **自动销毁** |
| 用户点击权限按钮 | 可能更新 | 销毁 |

## 5. 位置计算逻辑

### 5.1 计算公式

```typescript
/** 计算第 index 个弹窗的 Y 坐标 */
private calcY(index: number): number {
  const display = screen.getPrimaryDisplay()
  const { workArea } = display
  const screenHeight = workArea.height + workArea.y

  // macOS 加上 Dock 高度
  const bottomMargin = getBottomMargin(BOTTOM_MARGIN)

  // 从底部开始累加高度
  let y = screenHeight - bottomMargin
  for (let i = 0; i <= index; i++) {
    y -= this.popups[i].height
    if (i < index) {
      y -= GAP  // 弹窗间距
    }
  }

  return Math.round(y)
}
```

### 5.2 布局示意

```
屏幕底部
    │
    ▼
┌─────────────────┐ ← y = screenHeight - bottomMargin - height[0]
│  弹窗 0 (最新)   │
└─────────────────┘
    │ gap (8px)
┌─────────────────┐ ← y = screenHeight - bottomMargin - height[0] - gap - height[1]
│  弹窗 1          │
└─────────────────┘
    │ gap (8px)
┌─────────────────┐ ← y = screenHeight - bottomMargin - height[0] - gap - height[1] - gap - height[2]
│  弹窗 2 (最旧)   │
└─────────────────┘
```

## 6. 动画设计

### 6.1 位置移动动画

```typescript
/** 平滑移动窗口到目标 Y 坐标 */
moveTo(targetY: number, animated = true): void {
  if (!this.window || this.window.isDestroyed()) return

  if (!animated) {
    const [x] = this.window.getPosition()
    this.window.setPosition(x, targetY)
    return
  }

  const [x, startY] = this.window.getPosition()
  if (startY === targetY) return

  const duration = 300
  const startTime = Date.now()

  const animate = (): void => {
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
```

### 6.2 退场动画（向下滑出）

```typescript
/** 执行窗口收起动画（向下滑出） */
private animateSlideDown(duration = 250): Promise<void> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const [x, startY] = this.window!.getPosition()

    // 目标位置：屏幕底部外
    const display = screen.getPrimaryDisplay()
    const { workArea, bounds } = display
    const dockHeight = isMacOS()
      ? bounds.y + bounds.height - (workArea.y + workArea.height)
      : 0
    const screenHeight = workArea.height + workArea.y + dockHeight
    const targetY = screenHeight + 10

    const animate = (): void => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      // easeInCubic 缓动函数：先慢后快，自然离开
      const easeInCubic = progress * progress * progress
      const currentY = Math.round(startY + (targetY - startY) * easeInCubic)

      this.window!.setPosition(x, currentY)

      if (progress < 1) {
        setTimeout(animate, 8)
      } else {
        resolve()
      }
    }

    animate()
  })
}
```

## 7. 与现有代码的集成

### 7.1 claudeCodeService.ts 调整

```typescript
/** 处理 Claude Code 事件 */
private handleEvent(event: ClaudeCodeEvent) {
  switch (event.type) {
    case 'SessionStart':
      // 显示状态通知，5秒后自动销毁
      popupManager.showClaudeStatus('running')
      setTimeout(() => popupManager.hideClaudeStatus(), 5000)
      break

    case 'PermissionRequest':
      // 更新状态通知
      popupManager.showClaudeStatus('waiting_permission')
      // 显示权限弹窗
      popupManager.showPermissionNotice(event.info)
      break

    case 'AskUserQuestion':
      // 更新状态通知
      popupManager.showClaudeStatus('waiting_permission')
      // 显示或更新权限弹窗
      popupManager.showPermissionNotice(event.info)
      break

    case 'Stop':
    case 'StopFailure':
      // 更新状态通知为"任务完成"
      popupManager.showClaudeStatus('completed')
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
```

### 7.2 WindowFactory.ts 调整

```typescript
// WindowFactory 中集成 PopupManager
export default class WindowFactory {
  private popupManager: PopupManager

  constructor() {
    // ... 其他初始化
    this.popupManager = new PopupManager()
  }

  /** 获取 PopupManager 实例 */
  getPopupManager(): PopupManager {
    return this.popupManager
  }
}
```

## 8. 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `src/main/frame/PopupManager.ts` | 统一弹窗管理器 |
| 新增 | `src/main/frame/PopupItem.ts` | 弹窗元数据类 |
| 修改 | `src/main/frame/NoticeNewFrame.ts` | 适配 PopupItem 接口 |
| 修改 | `src/main/frame/PermissionNoticeFrame.ts` | 适配 PopupItem 接口 |
| 修改 | `src/main/frame/UpdateNewFrame.ts` | 适配 PopupItem 接口 |
| 修改 | `src/main/frame/WindowFactory.ts` | 集成 PopupManager |
| 修改 | `src/main/service/claudeCodeService.ts` | 使用 PopupManager |
| 删除 | `src/main/frame/NoticeManager.ts` | 功能被 PopupManager 吸收 |

## 9. 设计决策记录

### 9.1 为什么移除 NoticeManager？

NoticeManager 原本只管理通知弹窗，现在需要统一管理所有底部弹窗。将其功能吸收进 PopupManager 可以：
- 减少一层间接调用
- 避免 NoticeManager 和 PopupManager 之间的位置协调问题
- 简化代码结构

### 9.2 为什么按时间排序而不是按优先级？

按时间排序更符合用户直觉：最新出现的弹窗在最下方，用户最容易看到。所有弹窗平等对待，没有特殊优先级。

### 9.3 为什么 Claude 状态通知需要特殊管理？

Claude 状态通知有两个特殊行为：
1. **内容可更新**：状态改变时更新内容，不创建新弹窗
2. **事件驱动销毁**：根据 Claude Code 事件决定是否销毁

这种特殊行为需要单独的引用管理（`claudeStatusPopup`），但仍然参与统一的堆叠计算。

**API 设计说明**：
- `showClaudeStatus(status)`：如果状态通知不存在则创建，已存在则更新内容
- `hideClaudeStatus()`：销毁状态通知并从堆叠中移除

## 10. 验收标准

1. ✅ 所有底部弹窗（通知、权限、更新）由 PopupManager 统一管理
2. ✅ 弹窗按出现时间排序，最新在最下方
3. ✅ 弹窗添加或移除时，其他弹窗自动重新定位
4. ✅ 位置变化时使用平滑动画过渡
5. ✅ Claude 状态通知支持内容更新，不创建新弹窗
6. ✅ 权限请求弹窗在状态改变为非 PermissionRequest/AskUserQuestion 时自动销毁
7. ✅ 弹窗销毁时播放向下滑出动画
8. ✅ macOS 平台正确处理 Dock 高度
