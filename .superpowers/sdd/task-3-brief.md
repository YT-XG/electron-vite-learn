# Task 3: 修改 WindowFactory 集成 PopupManager

**Files:**
- Modify: `src/main/frame/WindowFactory.ts`
- Modify: `src/main/frame/index.ts`

**Interfaces:**
- Consumes: `PopupManager` (from Task 2)
- Produces: `windowFactory.getPopupManager()` 方法

## 任务描述

修改 WindowFactory 集成 PopupManager，并更新 index.ts 导出。

## 当前代码

### WindowFactory.ts 当前内容
```typescript
import NoticeManager from './NoticeManager'
import UpdateNewFrame from './UpdateNewFrame'
import MainPageFrame from './MainPageFrame'
import PermissionNoticeFrame from './PermissionNoticeFrame'
import SearchBoxFrame from './SearchBoxFrame'
import MarkdownPreviewFrame from './MarkdownPreviewFrame'
import ContextMenuFrame from './ContextMenuFrame'
import JsonToolFrame from './JsonToolFrame'

export default class WindowFactory {
  #noticeManager: NoticeManager | null = null
  // ... 其他属性

  getNoticeManager(): NoticeManager {
    if (!this.#noticeManager) {
      this.#noticeManager = new NoticeManager()
    }
    return this.#noticeManager
  }

  showNoticeNew(options: import('./NoticeManager').NoticeOptions): void {
    this.getNoticeManager().show(options)
  }

  // ... 其他方法
}

export const windowFactory = new WindowFactory()
```

### index.ts 当前内容
```typescript
export { default as BaseFrame } from './BaseFrame'
export { default as NoticeNewFrame } from './NoticeNewFrame'
export { default as UpdateNewFrame } from './UpdateNewFrame'
export { default as MainPageFrame } from './MainPageFrame'
export { default as PermissionNoticeFrame } from './PermissionNoticeFrame'
export { default as JsonToolFrame } from './JsonToolFrame'
export { default as WindowFactory, windowFactory } from './WindowFactory'
```

## 修改内容

### 1. 修改 WindowFactory.ts

在文件顶部添加 PopupManager 导入：
```typescript
import PopupManager from './PopupManager'
```

在 WindowFactory 类中添加 popupManager 属性和方法：
```typescript
export default class WindowFactory {
  /** 统一弹窗管理器 */
  #popupManager: PopupManager | null = null

  // ... 现有属性

  /**
   * 获取统一弹窗管理器
   * @returns PopupManager 实例
   */
  getPopupManager(): PopupManager {
    if (!this.#popupManager) {
      this.#popupManager = new PopupManager()
    }
    return this.#popupManager
  }

  // ... 现有方法
}
```

在 destroyAll 和 closeAll 方法中添加 popupManager 的销毁：
```typescript
destroyAll(): void {
  this.#popupManager?.destroyAll()
  // ... 其他销毁逻辑
}

closeAll(): void {
  this.#popupManager?.destroyAll()
  // ... 其他关闭逻辑
}
```

### 2. 修改 index.ts

添加 PopupManager 导出：
```typescript
export { default as PopupManager } from './PopupManager'
export type { NoticeOptions, NoticeType, ClaudeCodeStatus } from './PopupManager'
```

## 验证

运行 `npm run typecheck` 确保无类型错误

## 提交

```bash
git add src/main/frame/WindowFactory.ts src/main/frame/index.ts
git commit -m "feat: integrate PopupManager into WindowFactory"
```
