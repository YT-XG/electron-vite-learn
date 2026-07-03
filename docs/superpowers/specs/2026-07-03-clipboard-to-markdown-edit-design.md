# 剪贴板内容跳转到 Markdown 编辑器

## 概述

在剪贴板历史记录的每一条记录增加一个编辑按钮，点击后打开 Markdown 预览工具，将剪贴板的内容显示在编辑器中作为新标签页。保存规则不变（新内容需要用户选择保存位置）。

## 需求

1. 在剪贴板历史记录标签页的每条记录操作区域增加一个"编辑"按钮
2. 点击按钮后打开 Markdown 预览窗口
3. 将剪贴板的内容显示在编辑器的新标签页中
4. 标签页名称为"剪贴板内容"
5. 保存规则不变（新标签页无文件路径，保存时弹出文件选择对话框）

## 技术方案

### 方案选择

选择 **IPC 直接传递内容** 方案：
- 实现简单，改动最小
- 不需要修改数据库结构
- 复用现有 Markdown 预览窗口

### 修改文件

1. `src/renderer/src/views/ClipboardManager.vue` - 添加编辑按钮和方法
2. `src/main/frame/MarkdownPreviewFrame.ts` - 添加 IPC 处理器
3. `src/renderer/src/views/MarkdownPreview.vue` - 监听新标签页事件

### 数据流

```
用户点击编辑按钮
    ↓
ClipboardManager.vue → sendIPC('to-main-MarkdownPreview:openWithContent', content)
    ↓
MarkdownPreviewFrame.ts → 接收内容，创建/显示窗口
    ↓
MarkdownPreviewFrame.ts → sendIPC('to-renderer-MarkdownPreview:newTab', content)
    ↓
MarkdownPreview.vue → 创建新标签页，填充内容
```

## 详细设计

### 1. 剪贴板管理页面 (`ClipboardManager.vue`)

#### 模板修改

在历史记录标签页的操作按钮区域，新增编辑按钮：

```vue
<!-- 在现有按钮之后添加 -->
<button
  v-if="activeTab === 'history'"
  class="action-btn edit-action"
  @click="editInMarkdown(item as HistoryItem)"
  title="在 Markdown 编辑器中编辑"
>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
</button>
```

#### 脚本修改

新增方法：

```typescript
/**
 * 在 Markdown 编辑器中编辑剪贴板内容
 * @param item - 历史记录项
 */
const editInMarkdown = (item: HistoryItem): void => {
  window.electron.ipcRenderer.send('to-main-MarkdownPreview:openWithContent', item.content)
}
```

#### 样式修改

```css
.edit-action {
  color: var(--accent);
}

.edit-action:hover {
  background: rgba(var(--accent-rgb), 0.1);
}
```

---

### 2. Markdown 预览窗口 (`MarkdownPreviewFrame.ts`)

在 `registerIPC()` 方法中添加：

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

---

### 3. Markdown 预览页面 (`MarkdownPreview.vue`)

在 `onMounted` 中添加监听：

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

---

## 测试场景

1. **基本功能**：点击历史记录的编辑按钮，Markdown 预览窗口打开并显示内容
2. **窗口已打开**：如果 Markdown 预览窗口已打开，直接切换到新标签页
3. **多条记录**：连续点击多条记录的编辑按钮，创建多个标签页
4. **保存功能**：编辑后按 Ctrl+S，弹出文件选择对话框

## 验收标准

- [ ] 历史记录标签页显示编辑按钮
- [ ] 点击按钮打开 Markdown 预览窗口
- [ ] 内容正确显示在新标签页中
- [ ] 标签页名称为"剪贴板内容"
- [ ] 保存功能正常（弹出文件选择对话框）
