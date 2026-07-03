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
          <button v-if="showJsonTool" class="json-btn" @click="openJsonTool" title="在 JSON 工具中打开">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/>
              <path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>
            </svg>
          </button>
          <button v-if="showOpenLink" class="link-btn" @click="openLink" title="打开链接">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
          <button v-if="showTranslate" class="translate-btn" @click="openTranslate" title="翻译">
            <svg viewBox="0 0 1024 1024" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
              <path d="M414.25 595.78H172.22c-86.11 0-155.93-67.49-155.93-148.95V218.76C16.29 137.31 86.11 69.82 172.22 69.82h242.04c86.11 0 155.93 67.49 155.93 148.95v228.07c-2.33 81.45-69.82 148.95-155.93 148.94zM172.22 137.31c-48.87 0-86.11 34.91-86.11 81.45v228.07c0 44.22 39.56 81.45 86.11 81.45h242.04c48.87 0 86.11-34.91 86.11-81.45V218.76c0-44.22-39.56-81.45-86.11-81.45H172.22z" fill="currentColor"/>
              <path d="M837.82 861.09H595.78c-90.76 0-155.93-69.82-155.93-167.56v-141.96c0-18.62 16.29-34.91 34.91-34.91s34.91 16.29 34.91 34.91v141.96c0 58.18 34.91 100.07 86.11 100.07H837.82c48.87 0 86.11-34.91 86.11-81.45v-228.07c0-44.22-39.56-81.45-86.11-81.45H544.58c-18.62 0-34.91-16.29-34.91-34.91s16.29-34.91 34.91-34.91h293.24c86.11 0 155.93 67.49 155.93 148.95v228.27c0 86.11-69.82 151.27-155.93 151.27zM262.98 847.13c-102.4 0-183.85-74.47-183.85-167.56 0-18.62 16.29-34.91 34.91-34.91s34.91 16.29 34.91 34.91c0 55.85 51.2 100.07 116.36 100.07 18.62 0 34.91 16.29 34.91 34.91-4.65 18.62-18.62 32.58-37.24 32.58zM861.09 281.6c-18.62 0-34.91-16.29-34.91-34.91 0-55.85-51.2-100.07-116.36-100.07-18.62 0-34.91-16.29-34.91-34.91s16.29-34.91 34.91-34.91c102.4 0 183.85 74.47 183.85 167.56 2.33 20.95-11.64 37.24-32.58 37.24z" fill="currentColor"/>
              <path d="M660.95 686.55h-39.56l88.44-165.24h41.89l88.44 165.24h-41.89l-23.27-46.55h-93.09l-20.95 46.55zm69.82-139.64l-37.24 72.15H768l-37.24-72.15z" fill="currentColor"/>
              <path d="M286.25 200.15h23.27v39.56h93.09V349.09h-23.27v-13.96h-62.84v76.8h-23.27v-76.8h-86.11v13.96h-23.27v-109.38h86.11v22.95zm-62.84 116.37h62.84v-55.86H223.42v55.86zm86.11 0H372.36v-55.86h-62.84v55.86z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

/** 通知消息文本 */
const msg = ref('')

/** 是否显示翻译按钮（仅剪贴板通知显示） */
const showTranslate = ref(false)

/** 是否显示打开链接按钮（文本包含链接时显示） */
const showOpenLink = ref(false)

/** 是否显示 JSON 工具按钮（文本包含 JSON 格式时显示） */
const showJsonTool = ref(false)

/** 通知类型 */
const noticeType = ref<'default' | 'success' | 'error' | 'warning'>('default')

/** 是否为持久通知（Claude Code 状态通知） */
const isPersistent = ref(false)

/** 是否可见（触发入场缩放动画） */
const isVisible = ref(false)

/**
 * 设置通知消息内容并触发入场动画
 * @param data - 通知文本
 * @param translate - 是否显示翻译按钮
 * @param openLink - 是否显示打开链接按钮
 * @param jsonTool - 是否显示 JSON 工具按钮
 * @param type - 通知类型
 * @param persistent - 是否为持久通知
 */
const setMsg = (data: string, translate = false, openLink = false, jsonTool = false, type: 'default' | 'success' | 'error' | 'warning' = 'default', persistent = false) => {
  msg.value = data
  showTranslate.value = translate
  showOpenLink.value = openLink
  showJsonTool.value = jsonTool
  noticeType.value = type
  isPersistent.value = persistent
}

/**
 * 打开翻译页面
 * 向主进程发送翻译请求，主进程会打开主页面并传递文本
 */
const openTranslate = () => {
  window.electron.ipcRenderer.send('to-main-NoticeNewFrame:translate', msg.value)
}

/**
 * 打开链接
 * 向主进程发送打开链接请求，主进程会使用系统默认浏览器打开链接
 */
const openLink = () => {
  window.electron.ipcRenderer.send('to-main-NoticeNewFrame:openLink', msg.value)
}

/**
 * 打开 JSON 工具
 * 向主进程发送打开 JSON 工具请求，主进程会打开 JSON 工具窗口并填充内容
 */
const openJsonTool = () => {
  window.electron.ipcRenderer.send('to-main-NoticeNewFrame:openJsonTool', msg.value)
}

/**
 * 鼠标进入通知卡片区域
 * 通知主进程关闭鼠标穿透，允许按钮交互
 */
const onCardEnter = () => {
  window.electron.ipcRenderer.send('to-main-NoticeNewFrame:mouse-enter-card')
}

/**
 * 鼠标离开通知卡片区域
 * 通知主进程恢复鼠标穿透，透明区域可点击
 */
const onCardLeave = () => {
  window.electron.ipcRenderer.send('to-main-NoticeNewFrame:mouse-leave-card')
}

onMounted(() => {
  // 通知主进程渲染已就绪
  window.electron.ipcRenderer.send('to-main-NoticeNewFrame:ready')
  // 监听主进程发送的消息
  window.electron.ipcRenderer.on(
    'to-renderer-NoticeNewFrame:sendMsg',
    (_e, data: string, translate: boolean, openLink: boolean, jsonTool: boolean, type: 'default' | 'success' | 'error' | 'warning', persistent: boolean) => {
      setMsg(data, translate, openLink, jsonTool, type, persistent)
      // 下一帧触发 CSS 缩放动画（从 scale(0.2) → scale(1)）
      nextTick(() => {
        isVisible.value = true
      })
    }
  )
})
</script>

<style scoped>
.notice-container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  /* 允许鼠标穿透点击 */
  pointer-events: none;
}

/* 渐变边框容器 - 通过 @property 动画渐变角度，元素本身不旋转 */
.notice-border {
  position: relative;
  width: auto;
  min-width: 160px;
  max-width: 500px;
  height: 48px;
  border-radius: 24px;
  overflow: hidden;
  pointer-events: auto;
  padding: 2px;  /* 为渐变边框留出间隙 */

  /* 入场初始状态：微小 + 半透明 */
  transform: scale(0.2);
  opacity: 0;
  transform-origin: center center;
  transition:
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.25s ease-out;
}

/* 渐变边框伪元素 - 精确控制渐变背景渲染区域 */
.notice-border::before {
  content: '';
  position: absolute;
  inset: 0;
  background: conic-gradient(
    from var(--border-angle),
    #3b82f6,
    #06b6d4,
    #22c55e,
    #06b6d4,
    #3b82f6,
    #2563eb,
    #3b82f6
  );
  animation: border-spin 3s linear infinite;
}

/* 成功类型边框 */
.notice-success::before {
  background: conic-gradient(
    from var(--border-angle),
    #22c55e,
    #10b981,
    #34d399,
    #10b981,
    #22c55e,
    #16a34a,
    #22c55e
  );
}

/* 错误类型边框 */
.notice-error::before {
  background: conic-gradient(
    from var(--border-angle),
    #ef4444,
    #f97316,
    #f87171,
    #f97316,
    #ef4444,
    #dc2626,
    #ef4444
  );
}

/* 警告类型边框 */
.notice-warning::before {
  background: conic-gradient(
    from var(--border-angle),
    #f59e0b,
    #fbbf24,
    #fcd34d,
    #fbbf24,
    #f59e0b,
    #d97706,
    #f59e0b
  );
}

/* 持久通知样式 - 蓝紫渐变边框 */
.notice-persistent::before {
  background: conic-gradient(
    from var(--border-angle),
    #667eea,
    #764ba2,
    #667eea,
    #5a67d8,
    #667eea,
    #764ba2,
    #667eea
  );
}

/* 持久通知卡片 */
.notice-persistent .notice-card {
  padding: 0 16px;
  gap: 0;
}

/* Claude 标识容器 */
.claude-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
  border-radius: 12px;
  padding: 2px 10px;
  margin-right: 10px;
  flex-shrink: 0;
}

/* Claude 标识文本 */
.claude-icon {
  font-size: 11px;
  font-weight: 700;
  color: white;
  letter-spacing: 0.5px;
}

/* 入场动画触发：缩放到正常大小并显现 */
.notice-border.scale-in {
  transform: scale(1);
  opacity: 1;
}

/* 白色卡片主体 - 使用 box-shadow 替代父容器的 filter:drop-shadow，
   避免阴影穿透到 Electron 透明窗口的不可见区域 */
.notice-card {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  height: 100%;
  background: var(--bg-elevated);
  border-radius: 22px;
  padding: 0 12px 0 20px;
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.2),
    0 2px 8px rgba(59, 130, 246, 0.1);
}

.notice-text {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.3px;
  /* 单行显示，超出省略 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  margin-right: 8px;
}

/* 按钮组容器 */
.btn-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* 翻译按钮 */
.translate-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  flex-shrink: 0;
  padding: 0;
}

.translate-btn:hover {
  transform: scale(1.1);
  color: var(--accent);
  background: var(--accent-light);
}

.translate-btn:active {
  transform: scale(0.95);
}

/* 打开链接按钮 */
.link-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: var(--success);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: all 0.2s ease;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(var(--success-rgb), 0.2);
}

.link-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 4px 12px rgba(var(--success-rgb), 0.4);
}

.link-btn:active {
  transform: scale(0.95);
  box-shadow: 0 1px 2px rgba(var(--success-rgb), 0.2);
}

/* JSON 工具按钮 */
.json-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: var(--accent);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: all 0.2s ease;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(var(--accent-rgb), 0.2);
}

.json-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 4px 12px rgba(var(--accent-rgb), 0.4);
}

.json-btn:active {
  transform: scale(0.95);
  box-shadow: 0 1px 2px rgba(var(--accent-rgb), 0.2);
}
</style>

<!-- 全局样式：声明 @property 和 keyframes，避免 TailwindCSS v4 preflight 层干扰 -->
<style>
/* 声明自定义属性，让浏览器可以动画化角度值 */
@property --border-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

/* 渐变角度从 0 旋转到 360 度，元素本身不动 */
@keyframes border-spin {
  from {
    --border-angle: 0deg;
  }
  to {
    --border-angle: 360deg;
  }
}
</style>
