# 剪贴板历史记录按时间保留功能设计

## 概述

将剪贴板历史记录的保存策略从固定数量限制（1000条）改为按时间保留。用户可在剪贴板历史记录页面选择 10天、30天（默认）、3个月 三种保留期。

## 变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/service/settingsService.ts` | 修改 | 新增 `clipboardRetentionDays` 配置项 |
| `src/main/service/clipboardService.ts` | 修改 | 切换为时间清理，新增 IPC 读写保留期 |
| `src/renderer/src/views/ClipboardManager.vue` | 修改 | 工具栏新增三选一切换器 |

## 详细设计

### 1. 配置项：`settingsService.ts`

在 `AppSettings` 接口新增字段：

```typescript
export interface AppSettings {
  // ... 现有字段
  clipboardRetentionDays: number  // 10 | 30 | 90
}
```

默认值：

```typescript
const DEFAULT_SETTINGS: AppSettings = {
  // ... 现有默认值
  clipboardRetentionDays: 30
}
```

### 2. 核心逻辑：`clipboardService.ts`

#### 移除静态常量
- 删除 `MAX_ITEMS` 常量
- 将 `RETENTION_DAYS` 从静态常量改为实例属性 `retentionDays`，初始化时从 `settingsService` 读取

#### 修改 `insert()` 方法
- 移除"超出最大数量时删除最旧"的逻辑
- 每次插入后执行 `autoCleanup()` 清理过期数据

#### 修改 `autoCleanup()` 方法
- 不再仅启动时调用，每次 `insert()` 后也调用
- 使用动态 `retentionDays` 而不是静态常量

#### 新增 IPC 处理器

```typescript
// 获取当前保留天数
ipcMain.handle('to-service-ClipboardService:getRetentionDays', () => {
  return this.retentionDays
})

// 设置保留天数（同步更新 settingsService）
ipcMain.handle('to-service-ClipboardService:setRetentionDays', (_event, days: number) => {
  this.setRetentionDays(days)
})
```

`setRetentionDays(days)` 方法：
1. 更新 `this.retentionDays`
2. 调用 `settingsService.update({ clipboardRetentionDays: days })` 持久化
3. 立即执行 `autoCleanup()` 清理

### 3. UI：`ClipboardManager.vue`

在历史记录标签页的搜索栏右侧添加三选一切换器，通过 `v-if="activeTab === 'history'"` 控制仅在历史标签页显示：

```
[🔍 搜索历史记录...]  [清空]    [10天] [30天] [3个月]
```

- 复用现有 `category-btn` 胶囊按钮样式
- 仅在 history 标签页显示
- 切换时调用 `setRetentionDays` IPC，切换后刷新列表

## 数据流

```
用户点击 "3个月"
  → ClipboardManager.vue
  → ipcRenderer.invoke('to-service-ClipboardService:setRetentionDays', 90)
  → clipboardService.setRetentionDays(90)
    → 更新 retentationDays = 90
    → settingsService.update({ clipboardRetentionDays: 90 })
    → autoCleanup()  // 立即按新保留期清理
```

## 边界情况

| 场景 | 行为 |
|------|------|
| 保留期从30天改为10天 | 立即删除超过10天记录 |
| 保留期从10天改为3个月 | 之前被清理的不会恢复，后续保留所有90天内记录 |
| settings.json 损坏/不存在 | 默认30天，clipboardService 回退到30天 |
| 数据库为空 | 不影响设置读写 |
| 从旧版本升级 | 保留期默认30天，autoCleanup() 启动时执行一次 |
