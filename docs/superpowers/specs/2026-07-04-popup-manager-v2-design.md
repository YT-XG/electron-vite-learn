# 统一弹窗管理系统 V2：单帧循环 + 竞态消除

## 1. 背景

V1（2026-07-03 设计）实现了 PopupManager 统一管理弹窗位置和生命周期，但存在三个核心问题：

1. **弹窗重叠**：每个 PopupItem 有自己的 `setTimeout` 动画循环，`repositionAll` 被高频触发时，多个动画循环互相干扰，位置计算偏差
2. **更新窗口自数 Bug**：`UpdateNewFrame.#calcBottomCenterPosition()` 查询 `popupManager.getPopups()` 时把自己也算进去了，导致仅有一个更新弹窗时被向上顶起 288px
3. **Claude 状态更新时抽搐**：`repositionAll()` → `onPopupCountChange` → `updateFrame.reposition()` 链式触发，`#isAnimating` 互斥锁导致动画被跳过后又重新触发

## 2. 设计目标

1. **消除动画竞态**：单帧循环替代多套独立的 `setTimeout` 循环
2. **位置统一计算**：所有弹窗（通知/更新/权限/Claude 状态）由 PopupManager 唯一计算位置
3. **帧无缝衔接**：高频 `repositionAll()` 调用时，动画无缝重定向，不跳帧不抽搐
4. **销毁动画与堆叠解耦**：销毁中的弹窗走独立列表，不干扰剩余弹窗的位置计算

## 3. 架构变更

### 3.1 变化总览

```
V1 (当前)                                    V2 (目标)
─────────────────────────                    ─────────────────────────
                                           
PopupManager                                PopupManager
  ├ popups: PopupItem[]                       ├ popups: PopupItem[]
  ├ claudeStatusPopup: PopupItem              ├ destroyingPopups: PopupItem[]  ★NEW
  ├ permissionPopup: PopupItem                ├ animationTimer: setTimeout     ★NEW
  ├ repositionAll()                           ├ repositionAll()
  │  └ forEach → popup.moveTo()               │  └ 设置 targetY + 启动循环    ★重写
  └ removePopup()                             ├ #tick()                       ★NEW
     ├ popups.splice(index)                    │  ├ 驱动活跃弹窗缓动
     ├ repositionAll()                         │  └ 驱动销毁弹窗滑出
     └ popup.destroy() (含动画)                └ removePopup()
                                                 ├ popups.splice(index)
PopupItem                                       ├ destroyingPopups.push(popup)
  ├ moveTo() → 自有的 setTimeout 循环           ├ repositionAll() (剩余弹窗填位)
  ├ animateSlideDown()                          └ (动画由 #tick 驱动)
  ├ destroy() → 播 slideDown 再 clean
  └ isDestroying                              PopupItem ★简化
                                                ├ moveTo() → 直接 setPosition
UpdateNewFrame                                  ├ targetY, animStartY, animDuration
  ├ #calcBottomCenterPosition()  ✗ 自算         └ destroy() → 直接 cleanup
  ├ #animateWindow()              ✗ 自动画
  ├ reposition()                  ✗ 自调        UpdateNewFrame ★简化
  └ moveTo() → 自动画                           ├ showUpdateAtPosition() → 只设初位
                                                └ moveTo() → 直接 setPosition
NoticeNewFrame ★简化
  ├ showAtBottomCenter(targetY)                NoticeNewFrame ★简化
  ├ moveTo() → 直接 setPosition                 ├ 只接受 targetY 定位
  └ #animateSlideDown()  ✗ 去掉                 └ destroy() → 直接 cleanup
```

### 3.2 核心变化点

#### 变化 1：PopupItem 纯数据化

```typescript
// V1 (当前)                               // V2 (目标)
class PopupItem {                          class PopupItem {
  #animationFrameId                         targetY: number          // 目标位置
  #isDestroying                             animStartY: number       // 动画起始位置
                                            animStartTime: number    // 动画开始时间
  moveTo(targetY, animated) {               animDuration: number     // 动画时长
    // 自有 setTimeout 循环                 destroyingTargetY: number // 销毁目标 Y
    // easeOutCubic 缓动                    #isDestroying: boolean
  }
                                            moveTo(y) {              // 直接 setPos
  animateSlideDown(duration) {               this.window.setPosition(x, y)
    // 自有 setTimeout 循环                }
    // easeInCubic 缓动
  }                                        getY() → window Y

  destroy() {                              destroyImmediate()
    // animateSlideDown → cleanup            // 直接 destroy window
  }                                        }
}
```

#### 变化 2：PopupManager 单帧循环

```
repositionAll()
  │
  ├─ 遍历活跃弹窗
  │    ├ 计算新 targetY
  │    ├ 如果 targetY ≠ 旧 targetY:
  │    │   ├ animStartY = getY()         ← 当前实际位置
  │    │   ├ animStartTime = Date.now()  ← 此刻为起点
  │    │   ├ animDuration = 300ms
  │    │   └ targetY = 新目标值
  │    └ 如果 targetY == 旧 targetY: 跳过
  │
  └─ ensureAnimationLoop()
       │
       └ #tick() (setTimeout 16ms)
            │
            ├ 活跃弹窗: 计算 progress → easeOutCubic → setPosition
            │   如果全部到达 targetY: 停止活跃循环
            │
            └ 销毁弹窗: 同缓动向 destroyingTargetY 移动
                如果全部到达 → destroyImmediate
```

**设计要点**：

- `repositionAll()` 设置 `animStartY = getY()`（当前实际位置），而非理论位置
- 即使上次动画没跑完就触发新一轮 `repositionAll()`，也能从 **实际位置** 无缝过渡到新目标
- 这是消除重叠的根本手段：不再假设"弹窗应该在某处"，而是"弹窗实际在某处"

#### 变化 3：销毁动画与堆叠解耦

```
V1: removePopup(popup)
  ┌─────────────────────────────┐
  │ popups.splice(index)        │  ← 从列表移除
  │ repositionAll()             │  ← 其他弹窗下移填位（但销毁弹窗还在屏幕上）
  │ popup.destroy()             │  ← 播 slideDown 动画（异步）
  │  ├ animateSlideDown()       │    此时其他弹窗已经下移完成，销毁弹窗边滑边重叠
  │  └ cleanup()                │
  └─────────────────────────────┘

V2: removePopup(popup)
  ┌─────────────────────────────┐
  │ popups.splice(index)        │  ← 从堆叠列表移除
  │ destroyingPopups.push(popup)│  ← 加入销毁列表 ★NEW
  │ popup.destroyingTargetY =   │  ← 设目标 = 屏幕底部外
  │   screenHeight + 10         │
  │ repositionAll()             │  ← 剩余弹窗重新填位（不再受销毁弹窗影响）
  │ ensureAnimationLoop()       │  ← #tick 同时驱动：
  │                             │     - 活跃弹窗向 targetY 缓动
  │                             │     - 销毁弹窗向 destroyingTargetY 缓动
  │                             │     - 销毁弹窗到达后 → destroyImmediate
  └─────────────────────────────┘
```

## 4. 各文件变更清单

### 4.1 PopupItem.ts（~80 行移除 + 20 行新增）

| 方法/字段 | 变更 | 说明 |
|-----------|------|------|
| `#animationFrameId` | 移除 | 动画由 PopupManager 控制 |
| `moveTo(targetY, animated)` | 重写 | 变为直接 `setPosition(x, targetY)`，不做缓动 |
| `animateSlideDown()` | 移除 | 由 #tick 循环的 destroying 逻辑替代 |
| `destroy()` | 简化 | 改为直接 `destroyImmediate()`（动画由 PopupManager 前置完成） |
| `destroyImmediate()` | 保留 | 紧急清理用 |
| `targetY` | 新增 | 目标 Y 坐标 |
| `animStartY` | 新增 | 动画起始 Y |
| `animStartTime` | 新增 | 动画开始时间 |
| `animDuration` | 新增 | 动画时长（ms），0 表示不在动画中 |
| `isEntering` | 新增 | 是否为入场动画（用于区分首次定位和 reposition） |
| `destroyingTargetY` | 新增 | 销毁目标位置 |
| `setPositionY(y)` | 新增 | 仅设置 Y 坐标，不触发其他逻辑 |

### 4.2 PopupManager.ts（~150 行重写 + 80 行新增）

| 方法/字段 | 变更 | 说明 |
|-----------|------|------|
| `#animationTimer` | 新增 | 单帧循环定时器引用 |
| `#destroyingPopups` | 新增 | 销毁中的弹窗列表 |
| `#tick()` | 新增 | 帧循环主体，驱动所有弹窗动画 |
| `#ensureAnimationLoop()` | 新增 | 启动/继续帧循环 |
| `repositionAll()` | 重写 | 只设置 target 和 animStart，不直接 move |
| `removePopup()` | 重写 | 使用 destroyingPopups 解耦销毁动画 |
| `showNotice()` | 调整 | 适配新动画系统 |
| `showClaudeStatus()` | 调整 | 移除多余的 repositionAll 调用 |
| `showPermissionNotice()` | 调整 | 适配新动画系统 |
| `showUpdateNotice()` | 调整 | 适配新动画系统 |
| `onPopupCountChange` | 移除 | 不再需要，PopupManager 统一管理所有位置 |
| `getPopupCount()` | 保留 | |
| `destroyAll()` | 调整 | 跳过动画，直接 destroyImmediate |

### 4.3 UpdateNewFrame.ts（~60 行移除）

| 方法/字段 | 变更 | 说明 |
|-----------|------|------|
| `#calcBottomCenterPosition()` | 移除 | 位置由 PopupManager 统一计算 |
| `#animateWindow()` | 移除 | 动画由 PopupManager #tick 驱动 |
| `reposition()` | 移除 | 不再需要显式重定位 |
| `moveTo(targetY, animated)` | 简化 | 变为直接 setPosition |
| `showUpdateAtPosition(data, y)` | 保留入口 | 只做窗口创建和初位设置 |
| `showUpdate(data)` | 保留 | 调用 showUpdateAtPosition |
| `hide()` | 保留 | 维持原有 hide 逻辑 |
| `destroy()` | 保留 | 维持原有 destroy 逻辑 |

### 4.4 NoticeNewFrame.ts（~40 行移除）

| 方法/字段 | 变更 | 说明 |
|-----------|------|------|
| `#animateSlideDown()` | 移除 | 由 PopupManager 管理销毁动画 |
| `showAtBottomCenter(targetY)` | 简化 | 接受 targetY，定位 + showInactive |
| `moveTo(targetY, animated)` | 简化 | 直接 setPosition |
| `destroy()` | 简化 | 去掉了 animateSlideDown 调用，直接 super.destroy() |

### 4.5 PermissionNoticeFrame.ts（~20 行移除）

| 方法/字段 | 变更 | 说明 |
|-----------|------|------|
| `#calcBottomCenterPosition()` | 移除 | 位置由 PopupManager 统一计算 |
| `showAtBottomCenter()` | 简化 | 接受 targetY，定位 + showInactive |
| `moveTo(targetY, animated)` | 简化 | 直接 setPosition |

### 4.6 WindowFactory.ts（~10 行移除）

| 方法/字段 | 变更 | 说明 |
|-----------|------|------|
| `setOnPopupCountChange` | 移除 | 不需要了 |
| `showNotice()` | 调整 | 不再使用回调通知 UpdateNewFrame |
| `showUpdateNotice()` | 调整 | PopupManager 直接管理位置 |

## 5. 关键时序保证

### 5.1 正常弹窗出现

```
时序 T0:  用户复制文本 → showNotice()
T0+0ms:   PopupManager.showNotice()
            ├ calcY(0) → targetY = 760
            ├ createWindow() → window at {x, y: display.height+10}
            ├ popups.unshift(popup)  → popup.targetY = 760
            ├ popup.animStartY = getY() = display.height+10
            ├ popup.animStartTime = Date.now()
            └ ensureAnimationLoop()
T0+16ms:  #tick → progress=0.05 → y = 760-20 → setPosition
T0+150ms: #tick → progress=0.5  → y = 760-180 → setPosition
T0+300ms: #tick → progress=1.0  → y = 760 → 动画完成
```

### 5.2 Claude 状态更新触发 reposition

```
时序 T0:  SessionEnd → hideClaudeStatus()
T0+0ms:   removePopup(claudePopup)
            ├ popups.splice(claudeIndex)
            ├ destroyingPopups.push(claudePopup)
            ├ claudePopup.destroyingTargetY = screenHeight + 10
            └ repositionAll()
                 ├ 计算其他弹窗新 targetY
                 ├ 设 animStartY = getY()（实际位置）
                 └ ensureAnimationLoop()（可能在跑，不重复启动）
T0+5ms:   showNotice()（同时发生）
            ├ popups.unshift(newPopup)
            ├ popup.animStartY = getY()
            ├ popup.targetY = calcY(0)
            ├ popup.animStartTime = Date.now()
            └ ensureAnimationLoop()（可能在跑，不重复启动）
T0+16ms:  #tick 在同一循环中处理：
            ├ claudePopup → 向下移动
            ├ 其他弹窗 → 向上/下移动
            └ newPopup → 向上移动
```

**关键保证**：即使 `removePopup` 和 `showNotice` 几乎同时发生，`#tick` 在同一循环中处理所有移动，不会出现一个弹窗移动完成而另一个还没开始的情况。

### 5.3 高频触发 repositionAll

```
repositionAll()  #1 → 设 targetY=760, animStartY=800, start loop
    │
#tick #1         → 当前 Y=790, 目标 Y=760, 距离=30
    │
repositionAll()  #2 → 新 targetY=740, 设 animStartY=790 (当前实际)
    │                → startTime reset, duration reset
    │                → loop 继续运行（不重置）
    │
#tick #2         → 从 790 向 740 缓动
```

**关键保证**：`repositionAll` 在动画中途调用时，用 `getY()` 实际位置作为新起点，循环不中断，无跳帧。

## 6. 边界情况处理

| 场景 | 处理方式 |
|------|----------|
| 应用退出时弹窗还在销毁动画中 | `destroyAll()` 跳过动画，直接 `destroyImmediate()` |
| macOS Dock 位置变化 | `getBottomMargin()` 已在计算中考虑，Y 坐标实时反映 |
| 窗口被用户手动关闭 | 监听窗口 `close` 事件，从 popups 列表中移除 |
| 弹窗达到上限（MAX_POPUPS=5） | `removePopup(popups[last])` 用 destroyingPopups 机制优雅移除 |
| 权限弹窗未结束就被覆盖 | `destroyPermissionNotice()` 用 destroyingPopups 机制移除 |

## 7. 验收标准

1. **单更新弹窗场景**：更新弹窗始终在最底部，不自己把自己顶上去
2. **多弹窗堆叠**：最多 5 个弹窗，均匀堆叠，间隙 8px，不重叠
3. **弹窗移除时**：剩余弹窗平滑下移填位，销毁弹窗同时滑出
4. **Claude 状态频繁更新**：更新弹窗不抽搐，不跳帧
5. **同时增减弹窗**：所有弹窗同步移动，无先后偏差
6. **macOS Dock**：Y 坐标正确适配 Dock 高度
7. **动画完成**：所有 easeOutCubic 缓动在 300ms 内到达目标，无卡顿

## 8. 回退计划

如果 V2 出现严重问题，回退方案：
1. `git checkout HEAD~1 -- src/main/frame/PopupManager.ts src/main/frame/PopupItem.ts`
2. `git checkout HEAD~1 -- src/main/frame/UpdateNewFrame.ts src/main/frame/NoticeNewFrame.ts`
3. `git checkout HEAD~1 -- src/main/frame/PermissionNoticeFrame.ts src/main/frame/WindowFactory.ts`
4. 运行 `npm run typecheck` 确认能编译
