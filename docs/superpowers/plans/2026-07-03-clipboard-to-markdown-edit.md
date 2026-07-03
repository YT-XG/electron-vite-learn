# 剪贴板内容跳转到 Markdown 编辑器 - 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在剪贴板历史记录增加编辑按钮，点击后打开 Markdown 预览窗口并填充内容

**Architecture:** 通过 IPC 直接传递内容：剪贴板管理页面发送内容到主进程，主进程创建/显示 Markdown 预览窗口并转发内容到渲染进程

**Tech Stack:** Vue 3, TypeScript, Electron IPC

## Global Constraints

- 项目同时支持 Windows 和 macOS
- 使用 Vue 3 `<script setup>` 语法
- IPC 通信遵循命名规范：`to-main-` (渲染→主), `to-renderer-` (主→渲染)
- 代码修改后必须运行 `npm run typecheck` 检查

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/renderer/src/views/ClipboardManager.vue` | 修改 | 添加编辑按钮和 editInMarkdown 方法 |
| `src/main/frame/MarkdownPreviewFrame.ts` | 修改 | 添加 openWithContent IPC 处理器 |
| `src/renderer/src/views/MarkdownPreview.vue` | 修改 | 监听 newTab 事件创建新标签页 |

---

### Task 1: 修改剪贴板管理页面 - 添加编辑按钮

**Files:**
- Modify: `src/renderer/src/views/ClipboardManager.vue:117-145` (操作按钮区域)

**Interfaces:**
- Produces: `editInMarkdown(item: HistoryItem)` 方法，发送 IPC `to-main-MarkdownPreview:openWithContent`

- [ ] **Step 1: 在模板中添加编辑按钮**

在 `ClipboardManager.vue` 的 `item-actions` div 内，在现有翻译按钮之后添加编辑按钮：

```vue
<button
  v-if="activeTab === 'history'"
  class="action-btn edit-action"
  @click="editInMarkdown(item as HistoryItem)"
  title="在 Markdown 编辑器中编辑"
>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
</button>
```

- [ ] **Step 2: 在脚本中添加 editInMarkdown 方法**

在 `ClipboardManager.vue` 的 `<script setup>` 部分，在 `translateItem` 方法之后添加：

```typescript
/**
 * 在 Markdown 编辑器中编辑剪贴板内容
 * @param item - 历史记录项
 */
const editInMarkdown = (item: HistoryItem): void => {
  window.electron.ipcRenderer.send('to-main-MarkdownPreview:openWithContent', item.content)
}
```

- [ ] **Step 3: 添加编辑按钮样式**

在 `<style scoped>` 部分，在 `.translate-action:hover` 样式之后添加：

```css
.edit-action {
  color: var(--accent);
}

.edit-action:hover {
  background: rgba(var(--accent-rgb), 0.1);
}
```

- [ ] **Step 4: 运行类型检查**

```bash
npm run typecheck
```

Expected: 无错误

- [ ] **Step 5: 提交代码**

```bash
git add src/renderer/src/views/ClipboardManager.vue
git commit -m "feat(clipboard): add edit button to history items"
```

---

### Task 2: 修改 Markdown 预览窗口主进程 - 添加 IPC 处理器

**Files:**
- Modify: `src/main/frame/MarkdownPreviewFrame.ts:63-158` (registerIPC 方法)

**Interfaces:**
- Consumes: IPC `to-main-MarkdownPreview:openWithContent` (content: string)
- Produces: IPC `to-renderer-MarkdownPreview:newTab` (content: string)

- [ ] **Step 1: 在 registerIPC 方法中添加 IPC 处理器**

在 `MarkdownPreviewFrame.ts` 的 `registerIPC()` 方法中，在 `#ipcRegistered = true` 之前添加：

```typescript
// 从剪贴板打开并填充内容
ipcMain.on('to-main-MarkdownPreview:openWithContent', (_event, content: string) => {
  // 如果窗口未创建，先创建
  if (!this.isAlive()) {
    this.create(true)
  } else {
    this.show()
  }

  // 发送内容到渲染进程
  if (this.window) {
    this.window.webContents.send('to-renderer-MarkdownPreview:newTab', content)
  }
})
```

- [ ] **Step 2: 运行类型检查**

```bash
npm run typecheck
```

Expected: 无错误

- [ ] **Step 3: 提交代码**

```bash
git add src/main/frame/MarkdownPreviewFrame.ts
git commit -m "feat(markdown): add openWithContent IPC handler"
```

---

### Task 3: 修改 Markdown 预览页面 - 监听新标签页事件

**Files:**
- Modify: `src/renderer/src/views/MarkdownPreview.vue:468-490` (onMounted 部分)

**Interfaces:**
- Consumes: IPC `to-renderer-MarkdownPreview:newTab` (content: string)

- [ ] **Step 1: 在 onMounted 中添加事件监听**

在 `MarkdownPreview.vue` 的 `onMounted` 回调中，在现有事件监听之后添加：

```typescript
// 监听从剪贴板打开的新标签页
window.electron.ipcRenderer.on('to-renderer-MarkdownPreview:newTab', (_event, content: string) => {
  // 创建新标签页
  const newId = String(Date.now())
  tabs.value.push({
    id: newId,
    name: '剪贴板内容',
    content: content
  })
  activeTabId.value = newId
})
```

- [ ] **Step 2: 运行类型检查**

```bash
npm run typecheck
```

Expected: 无错误

- [ ] **Step 3: 提交代码**

```bash
git add src/renderer/src/views/MarkdownPreview.vue
git commit -m "feat(markdown): listen for newTab event from clipboard"
```

---

### Task 4: 更新项目文档

**Files:**
- Modify: `CLAUDE.md` (模块说明部分)

**Interfaces:**
- 无代码接口变更

- [ ] **Step 1: 更新剪贴板管理模块说明**

在 `CLAUDE.md` 的剪贴板历史记录服务部分，添加编辑按钮的 IPC 接口说明：

```markdown
### 剪贴板管理页面 (src/renderer/src/views/ClipboardManager.vue)
- **职责**: 剪贴板历史记录和收藏的展示与交互
- **功能**:
  - 历史记录 / 收藏双标签页导航
  - 支持搜索过滤（前端过滤）
  - 点击记录自动复制并粘贴到上一个聚焦的窗口
  - **历史记录一键清空**: 点击"清空"按钮可清空所有历史记录（需确认）
  - **收藏手动添加**: 点击"添加"按钮，手动输入内容、分类、描述
  - **收藏分类管理**: 按分类筛选收藏，支持自定义分类（如：Linux命令）
  - 编辑收藏内容
  - **在 Markdown 编辑器中编辑**: 点击历史记录的编辑按钮，在 Markdown 预览窗口中编辑内容
  - 删除单条记录
  - 空状态提示
  - 监听主进程推送，实时更新列表
  - 时间智能显示（刚刚、X分钟前、X小时前、具体日期）
```

- [ ] **Step 2: 更新 Markdown 预览窗口说明**

在 `CLAUDE.md` 的 Markdown 预览窗口部分，添加新的 IPC 接口说明：

```markdown
- **IPC 接口**:
  - `to-main-MarkdownPreview:readFile` - 读取文件
  - `to-main-MarkdownPreview:saveFile` - 保存文件到指定路径
  - `to-main-MarkdownPreview:saveFileAs` - 另存为（弹出文件选择对话框）
  - `to-main-MarkdownPreview:minimize` - 最小化窗口
  - `to-main-MarkdownPreview:toggleMaximize` - 切换最大化
  - `to-main-MarkdownPreview:close` - 关闭窗口
  - `to-main-MarkdownPreview:showContextMenu` - 显示右键菜单（转发到 ContextMenuFrame）
  - `to-main-MarkdownPreview:openWithContent` - 从剪贴板打开并填充内容（新标签页）
  - `to-renderer-MarkdownPreview:newTab` - 创建新标签页并填充内容
```

- [ ] **Step 3: 提交文档更新**

```bash
git add CLAUDE.md
git commit -m "docs: update clipboard and markdown preview module docs"
```

---

## 测试场景

完成所有任务后，手动测试以下场景：

1. **基本功能**：
   - 启动应用 (`npm run dev`)
   - 打开剪贴板管理页面
   - 复制一些文字
   - 在历史记录中找到该记录
   - 点击编辑按钮
   - 验证 Markdown 预览窗口打开并显示内容

2. **窗口已打开**：
   - 保持 Markdown 预览窗口打开
   - 再次点击另一个历史记录的编辑按钮
   - 验证创建新的标签页

3. **多条记录**：
   - 连续点击多条记录的编辑按钮
   - 验证创建多个标签页，名称均为"剪贴板内容"

4. **保存功能**：
   - 编辑内容后按 Ctrl+S
   - 验证弹出文件选择对话框

---

## 验收标准

- [ ] 历史记录标签页显示编辑按钮
- [ ] 点击按钮打开 Markdown 预览窗口
- [ ] 内容正确显示在新标签页中
- [ ] 标签页名称为"剪贴板内容"
- [ ] 保存功能正常（弹出文件选择对话框）
- [ ] 类型检查通过
- [ ] 文档已更新
