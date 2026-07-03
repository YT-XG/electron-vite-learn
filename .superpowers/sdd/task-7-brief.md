# Task 7: Modify claudeCodeService to use PopupManager

**Files:**
- Modify: `src/main/service/claudeCodeService.ts`
- Modify: `src/main/frame/index.ts` (export PopupOptions)

**Interfaces:**
- Consumes: `PopupManager` (from Task 2), `NoticeNewFrame` (existing), `PermissionNoticeFrame` (existing)
- Produces: claudeCodeService 完全使用 PopupManager 管理所有弹窗

## 任务描述

修改 claudeCodeService，将所有 NoticeManager 和 PermissionNoticeFrame 直接调用替换为 PopupManager API。

## 需要修改的方法

### 1. showEventNotification()

**Claude 状态通知** - 使用 `popupManager.showClaudeStatus()` 和 `popupManager.hideClaudeStatus()`:

```typescript
// 旧代码
const noticeManager = windowFactory.getNoticeManager()
noticeManager.showClaudeCodeStatus('running', text)
noticeManager.hideClaudeCodeStatus()
noticeManager.show({ text: 'msg', duration: 3000 })

// 新代码
const popupManager = windowFactory.getPopupManager()
popupManager.showClaudeStatus(status, text, createWindowFn, updateContentFn)
popupManager.hideClaudeStatus()
popupManager.showNotice(createWindowFn, popupOptions, noticeOptions)
```

**createWindowFn** - 创建 NoticeNewFrame 并返回 BrowserWindow:
```typescript
const createWindowFn = () => {
  const frame = new NoticeNewFrame()
  frame.create()
  return frame.getWindow()!
}
```

**updateContentFn** - 更新 NoticeNewFrame 内容:
```typescript
const updateContentFn = (window: BrowserWindow, text: string, type: NoticeType) => {
  const frame = NoticeNewFrame.fromWindow(window)
  if (frame) {
    frame.setMsg(text, false, type, true)
  }
}
```

### 2. showPermissionNotice()

使用 `popupManager.showPermissionNotice()`:

```typescript
// 旧代码
const noticeFrame = windowFactory.getPermissionNoticeFrame()
noticeFrame.showPermissionNotice(info)

// 新代码
popupManager.showPermissionNotice(
  () => {
    const frame = windowFactory.getPermissionNoticeFrame()
    frame.create()
    return frame.getWindow()!
  },
  { type: 'permission', width: 520, height: 140 },
  (window) => {
    const frame = windowFactory.getPermissionNoticeFrame()
    frame.showPermissionNotice(info)
  }
)
```

### 3. closePermissionNoticeIfExists()

使用 `popupManager.destroyPermissionNotice()`:

```typescript
// 旧代码
const noticeFrame = windowFactory.getPermissionNoticeFrame()
if (noticeFrame.isAlive()) {
  noticeFrame.hideWithAnimation()
}

// 新代码
popupManager.destroyPermissionNotice()
```

### 4. respondPermission()

使用 `popupManager.destroyPermissionNotice()`:

```typescript
// 旧代码
const noticeFrame = windowFactory.getPermissionNoticeFrame()
if (noticeFrame.isAlive()) {
  noticeFrame.hideWithAnimation()
}

// 新代码
popupManager.destroyPermissionNotice()
```

### 5. destroy()

使用 `popupManager.hideClaudeStatus()`:

```typescript
// 旧代码
windowFactory.getNoticeManager().hideClaudeCodeStatus()

// 新代码
windowFactory.getPopupManager().hideClaudeStatus()
```

## 检查点

- [ ] 所有 `windowFactory.getNoticeManager()` 调用已替换
- [ ] 所有 `windowFactory.getPermissionNoticeFrame()` 直接调用已替换（IPC handler 除外）
- [ ] PopupOptions 已从 frame/index.ts 导出
- [ ] 类型检查通过

## 验证

运行 `npm run typecheck` 确保无类型错误

## 提交

```bash
git add src/main/service/claudeCodeService.ts src/main/frame/index.ts
git commit -m "feat: refactor claudeCodeService to use PopupManager"
```
