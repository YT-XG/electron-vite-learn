# NoticeManager 多通知管理器设计

## 背景

当前通知弹窗（NoticeNewFrame）采用单例模式，由 WindowFactory 管理唯一实例。存在以下问题：
1. 多个通知同时出现时，新通知覆盖旧通知，用户只能看到最后一条
2. 显示时长固定为 5 秒，无法根据通知类型自定义
3. 通知只能在底部居中固定位置显示，无法堆叠

## 需求

1. 支持同时显示最多 5 个通知窗口
2. 创建通知时可设置自定义显示时长（毫秒），不传则使用默认值
3. 新通知从底部出现，旧通知被向上顶起，有平滑过渡动画
4. 超过 5 个上限时，最早的（最上面的）通知被销毁
5. 调用方（clipboardService、trayService）适配新 API

## 架构设计

### NoticeManager 类（新增）

职责：管理多个 NoticeNewFrame 实例的生命周期、位置计算和动画调度。

```typescript
// src/main/frame/NoticeManager.ts

interface NoticeOptions {
  text: string
  showTranslate?: boolean
  showOpenLink?: boolean
  duration?: number  // 显示时长(ms)，默认 5000
}

class NoticeManager {
  private notices: NoticeNewFrame[] = []
  private readonly MAX_NOTICES = 5
  private readonly POPUP_HEIGHT = 60    // 每个通知窗口高度
  private readonly GAP = 8              // 通知之间的间距
  private readonly BOTTOM_MARGIN = 60   // 距屏幕底部距离

  /**
   * 显示一个新通知
   * @param options 通知配置
   */
  show(options: NoticeOptions): void { }

  /**
   * 重新计算所有通知位置并平滑移动
   */
  private repositionAll(): void { }

  /**
   * 计算第 index 个通知的 Y 坐标
   * @param index 从底部开始的索引（0 = 最底部）
   */
  private calcY(index: number): number { }

  /**
   * 移除指定通知并重新排列
   */
  private removeNotice(notice: NoticeNewFrame): void { }
}
```

### 位置计算规则

屏幕底部为基准点（距底部 BOTTOM_MARGIN = 60px），新通知始终在最底部：

```
屏幕底部
  ↓
  第0个通知 (最新)  y = workArea.y + workArea.height - BOTTOM_MARGIN - POPUP_HEIGHT
  第1个通知 (较旧)  y = workArea.y + workArea.height - BOTTOM_MARGIN - POPUP_HEIGHT - (POPUP_HEIGHT + GAP) * 1
  第2个通知 (更旧)  y = workArea.y + workArea.height - BOTTOM_MARGIN - POPUP_HEIGHT - (POPUP_HEIGHT + GAP) * 2
  ...
```

### 移动动画

新通知出现时，manager 遍历所有存活的旧通知：
1. 计算每个旧通知的新 Y 坐标
2. 调用 `setBounds()` 平滑过渡（复用现有 setTimeout + 8ms 间隔方案）
3. 动画持续时间约 300ms，使用 ease-out 缓动

### NoticeNewFrame 适配

修改 NoticeNewFrame 以支持管理器模式：
1. **删除内部自动销毁逻辑**：移除 `AUTO_DESTROY_DELAY` 常量和 `#destroyTimer`
2. **接受外部 duration**：新增 `setDuration(ms)` 方法
3. **暴露当前位置**：新增 `getY()` 方法供 manager 读取
4. **支持位置移动**：新增 `moveTo(y, animated?)` 方法
5. **销毁回调通知**：销毁时通知 manager 重新排列

### WindowFactory 变化

- 删除 `getNoticeNewFrame()` 单例方法
- 新增 `getNoticeManager()` 获取管理器实例
- 保留 `showNoticeNew()` 便捷方法（内部委托给 manager）

### 调用方适配

**clipboardService.ts：**
```typescript
// 之前
const noticeFrame = windowFactory.getNoticeNewFrame()
noticeFrame.setMsg(content, true)
noticeFrame.showAtBottomCenter()

// 之后
windowFactory.getNoticeManager().show({
  text: content,
  showTranslate: true,
  duration: 5000
})
```

**trayService.ts：**
```typescript
// 之前
const noticeNewFrame = windowFactory.getNoticeNewFrame()
noticeNewFrame.setMsg('正在检查更新...')
noticeNewFrame.showAtBottomCenter()

// 之后
windowFactory.getNoticeManager().show({
  text: '正在检查更新...',
  duration: 3000
})
```

## 文件变更清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/main/frame/NoticeManager.ts` | 新增 | 多通知管理器 |
| `src/main/frame/NoticeNewFrame.ts` | 修改 | 适配管理器模式 |
| `src/main/frame/WindowFactory.ts` | 修改 | 接入 NoticeManager |
| `src/main/service/clipboardService.ts` | 修改 | 改用 noticeManager.show() |
| `src/main/service/trayService.ts` | 修改 | 改用 noticeManager.show() |
| `CLAUDE.md` | 修改 | 更新模块说明和 API 文档 |

## 边界情况

1. **快速连续复制**：clipboard 1秒轮询，最多每秒1个新通知，不会超过 5 个上限
2. **通知销毁中收到新通知**：manager 等待销毁动画完成后再重新排列
3. **窗口创建延迟**：新通知窗口异步创建，可能短暂空白；manager 在 renderer ready 后才发送消息
4. **所有通知销毁后**：manager 自动清理空引用，下次 show() 从头开始
