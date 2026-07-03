# 合并 Claude Code 状态通知和通用通知窗口设计

## 背景

当前项目中有两个独立的通知窗口：
1. **NoticeNewFrame** - 通用通知窗口（自动销毁、支持翻译/链接/JSON 按钮）
2. **ClaudeCodeStatusFrame** - Claude Code 状态通知（常驻显示、支持状态更新）

用户希望将这两个窗口合并，删除 `ClaudeCodeStatusFrame`，用 `NoticeNewFrame` 完全替代。

## 需求

1. **删除 `ClaudeCodeStatusFrame`**，用 `NoticeNewFrame` 替代
2. **状态通知特性**：
   - 全局唯一（Claude Code 状态改变只更新这一个通知，不创建新弹窗）
   - 不自动销毁
   - 始终显示
   - 在堆叠最顶部
3. **特殊堆叠规则**：
   - 状态通知始终在最顶部
   - 普通通知堆叠在状态通知下面
   - 状态通知不受普通通知上限（5个）的限制
4. **Claude 标识**：状态通知显示 "Claude" 标识，与普通通知区分

## 设计方案

### 1. 核心改动：NoticeNewFrame

#### 新增属性

```typescript
/** 是否为持久通知（Claude Code 状态通知） */
#isPersistent = false

/** 是否已显示（持久通知复用同一实例） */
#isShown = false
```

#### 修改 `setMsg` 方法

```typescript
setMsg(data: string, showTranslate = false, type: NoticeType = 'default', isPersistent = false) {
  this.#msg = data
  this.#showTranslate = showTranslate
  this.#type = type
  this.#isPersistent = isPersistent
  this.#showOpenLink = NoticeNewFrame.#containsUrl(data)
  this.#showJsonTool = NoticeNewFrame.#containsJson(data)
  return this
}
```

#### 修改 `showAtBottomCenter` 方法

```typescript
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

  // ... 其余逻辑 ...
  
  // 显示后标记
  if (this.#isPersistent) {
    this.#isShown = true
  } else {
    // 启动自动销毁定时器
    this.#destroyTimer = setTimeout(() => {
      this.destroy()
    }, this.#duration)
  }
}
```

#### 修改 `destroy` 方法

```typescript
async destroy(): Promise<void> {
  this.#clearDestroyTimer()
  
  if (this.isAlive()) {
    await this.#animateSlideDown(250)
  }

  // 清理
  this.#animationFrameId = null
  this.#msgSent = false
  this.#isShown = false  // 重置持久通知状态

  super.destroy()
}
```

#### 新增方法

```typescript
/** 获取是否为持久通知 */
isPersistent(): boolean {
  return this.#isPersistent
}

/** 获取是否已显示 */
isShown(): boolean {
  return this.#isShown
}
```

### 2. 渲染进程改动：NoticeNew.vue

#### 新增模板元素

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
          <!-- ... 现有按钮 ... -->
        </div>
      </div>
    </div>
  </div>
</template>
```

#### 新增响应式变量

```typescript
/** 是否为持久通知 */
const isPersistent = ref(false)
```

#### 修改 `setMsg` 函数

```typescript
const setMsg = (data: string, translate = false, openLink = false, jsonTool = false, type: 'default' | 'success' | 'error' | 'warning' = 'default', persistent = false) => {
  msg.value = data
  showTranslate.value = translate
  showOpenLink.value = openLink
  showJsonTool.value = jsonTool
  noticeType.value = type
  isPersistent.value = persistent
}
```

#### 修改 IPC 监听

```typescript
window.electron.ipcRenderer.on(
  'to-renderer-NoticeNewFrame:sendMsg',
  (_e, data: string, translate: boolean, openLink: boolean, jsonTool: boolean, type: string, persistent: boolean) => {
    setMsg(data, translate, openLink, jsonTool, type as any, persistent)
    nextTick(() => {
      isVisible.value = true
    })
  }
)
```

#### 新增 CSS 样式

```css
/* 持久通知样式 */
.notice-persistent {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.notice-persistent .notice-card {
  background: var(--bg-elevated);
  padding: 0 16px;
}

.claude-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
  border-radius: 12px;
  padding: 2px 8px;
  margin-right: 10px;
  flex-shrink: 0;
}

.claude-icon {
  font-size: 11px;
  font-weight: 700;
  color: white;
  letter-spacing: 0.5px;
}
```

### 3. NoticeManager 改动

#### 修改 `show` 方法

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

#### 修改 `repositionAll` 方法

```typescript
/**
 * 重新计算所有通知位置并平滑移动
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

#### 修改 `removeNotice` 方法

```typescript
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

#### 删除 Claude Code 相关方法

- 删除 `showClaudeCodeStatus`
- 删除 `hideClaudeCodeStatus`
- 删除 `updateClaudeCodeStatus`
- 删除 `destroyClaudeCodeStatus`

#### 新增类型定义

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

#### 新增方法

```typescript
/** 显示 Claude Code 状态通知 */
showClaudeCodeStatus(status: ClaudeCodeStatus, customText?: string): void {
  const config = STATUS_CONFIG[status]
  const text = customText || config.text
  this.show({ text, duration: 0 }, true) // duration=0 表示不自动销毁
}

/** 更新 Claude Code 状态 */
updateClaudeCodeStatus(status: ClaudeCodeStatus, customText?: string): void {
  if (this.persistentNotice) {
    const config = STATUS_CONFIG[status]
    const text = customText || config.text
    this.persistentNotice.setMsg(text, false, 'default', true)
    this.persistentNotice.showAtBottomCenter()
  }
}

/** 隐藏 Claude Code 状态通知 */
hideClaudeCodeStatus(): void {
  if (this.persistentNotice) {
    this.persistentNotice.destroy()
  }
}
```

### 4. 删除 ClaudeCodeStatusFrame

#### 删除文件

- `src/main/frame/ClaudeCodeStatusFrame.ts`
- `src/renderer/src/views/ClaudeCodeStatus.vue`

#### 更新 WindowFactory.ts

- 删除 `ClaudeCodeStatusFrame` 相关的导入和方法

#### 更新 claudeCodeService.ts

- 将 `windowFactory.getNoticeManager().showClaudeCodeStatus(...)` 改为使用新的调用方式（已经通过 NoticeManager 的新方法实现）

## 影响范围

### 文件修改

| 文件 | 改动类型 |
|------|----------|
| `src/main/frame/NoticeNewFrame.ts` | 修改 |
| `src/main/frame/NoticeManager.ts` | 修改 |
| `src/main/frame/WindowFactory.ts` | 修改 |
| `src/renderer/src/views/NoticeNew.vue` | 修改 |
| `src/main/frame/ClaudeCodeStatusFrame.ts` | 删除 |
| `src/renderer/src/views/ClaudeCodeStatus.vue` | 删除 |
| `CLAUDE.md` | 更新目录索引 |

### IPC 通信变更

| 旧频道 | 新频道 |
|--------|--------|
| `to-renderer-ClaudeCodeStatusFrame:updateStatus` | `to-renderer-NoticeNewFrame:sendMsg` (persistent=true) |
| `to-renderer-ClaudeCodeStatusFrame:show` | 无需（复用 NoticeNewFrame） |
| `to-renderer-ClaudeCodeStatusFrame:hide` | 无需（复用 NoticeNewFrame） |
| `to-main-ClaudeCodeStatusFrame:ready` | 无需（复用 NoticeNewFrame） |

## 测试要点

1. **普通通知功能**：确保普通通知的翻译、链接、JSON 按钮仍然正常工作
2. **Claude Code 状态通知**：
   - 显示时显示 "Claude" 标识
   - 状态改变时只更新内容，不创建新通知
   - 不自动销毁
   - 始终显示在最顶部
3. **堆叠功能**：
   - 普通通知堆叠在状态通知下面
   - 状态通知不受普通通知上限限制
4. **动画**：入场缩放、收起滑出、淡入淡出动画正常
5. **鼠标穿透**：透明区域可点击，卡片区域可交互

## 风险评估

1. **低风险**：删除 `ClaudeCodeStatusFrame` 后，需要确保 `claudeCodeService.ts` 的调用方式正确
2. **低风险**：持久通知的销毁逻辑需要特殊处理，避免误销毁
3. **低风险**：位置管理需要确保状态通知始终在最顶部

## 后续步骤

1. 实现设计
2. 编译检查
3. 功能测试
4. 更新 CLAUDE.md 文档
