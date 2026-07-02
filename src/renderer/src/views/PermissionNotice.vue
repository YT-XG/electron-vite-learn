<template>
  <div class="notice-container">
    <div
      class="notice-border"
      :class="{ 'scale-in': isVisible }"
      @mouseenter="onCardEnter"
      @mouseleave="onCardLeave"
    >
      <div class="notice-card">
        <div class="notice-content">
          <div class="notice-header">
            <span class="notice-icon">⚠️</span>
            <span class="notice-title">{{ isAskUserQuestion ? 'Claude Code 提问' : 'Claude Code 请求权限' }}</span>
          </div>
          <div class="notice-info">
            <span class="info-label">工具:</span>
            <span class="info-value">{{ toolName }}</span>
            <span v-if="command" class="info-command">{{ truncateCommand(command) }}</span>
          </div>
        </div>
        <!-- AskUserQuestion 工具：显示关闭按钮（用户在 Claude Code 中回答后手动关闭） -->
        <div v-if="isAskUserQuestion" class="btn-group">
          <button class="btn btn-close" @click="closeNotice" title="关闭">
            关闭
          </button>
        </div>
        <!-- 权限请求工具：显示拒绝/同意/全部同意按钮 -->
        <div v-else class="btn-group">
          <button class="btn btn-deny" @click="resolve('deny')" title="拒绝">
            拒绝
          </button>
          <button class="btn btn-allow" @click="resolve('allow')" title="同意">
            同意
          </button>
          <button class="btn btn-always" @click="resolve('always')" title="全部同意">
            全部同意
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'

/** 权限请求信息 */
interface PermissionInfo {
  sessionId: string
  toolName: string
  command: string
  description: string
}

/** 会话 ID */
const sessionId = ref('')

/** 工具名称 */
const toolName = ref('')

/** 命令内容 */
const command = ref('')

/** 描述 */
const description = ref('')

/** 是否可见（触发入场缩放动画） */
const isVisible = ref(false)

/** 是否为 AskUserQuestion 工具（Claude 向用户提问，不需要权限按钮） */
const isAskUserQuestion = computed(() => toolName.value === 'AskUserQuestion')

/**
 * 截断过长的命令
 * @param cmd - 命令字符串
 * @returns 截断后的命令
 */
const truncateCommand = (cmd: string): string => {
  if (cmd.length <= 40) return cmd
  return cmd.substring(0, 37) + '...'
}

/**
 * 解决权限请求
 * @param decision - 用户的决策
 */
const resolve = (decision: 'allow' | 'always' | 'deny') => {
  window.electron.ipcRenderer.send(
    'to-main-PermissionNoticeFrame:resolve',
    sessionId.value,
    decision
  )
}

/**
 * 关闭通知弹窗（用于 AskUserQuestion）
 * @description 用户在 Claude Code 中回答问题后，手动关闭弹窗
 */
const closeNotice = () => {
  window.electron.ipcRenderer.send('to-main-PermissionNoticeFrame:destroy')
}

/**
 * 鼠标进入通知卡片区域
 * 通知主进程关闭鼠标穿透，允许按钮交互
 */
const onCardEnter = () => {
  window.electron.ipcRenderer.send('to-main-PermissionNoticeFrame:mouse-enter-card')
}

/**
 * 鼠标离开通知卡片区域
 * 通知主进程恢复鼠标穿透，透明区域可点击
 */
const onCardLeave = () => {
  window.electron.ipcRenderer.send('to-main-PermissionNoticeFrame:mouse-leave-card')
}

onMounted(() => {
  // 通知主进程渲染已就绪
  window.electron.ipcRenderer.send('to-main-PermissionNoticeFrame:ready')

  // 监听主进程发送的权限请求信息
  window.electron.ipcRenderer.on(
    'to-renderer-PermissionNoticeFrame:show',
    (_e, info: PermissionInfo) => {
      sessionId.value = info.sessionId
      toolName.value = info.toolName
      command.value = info.command
      description.value = info.description

      // 下一帧触发 CSS 缩放动画
      nextTick(() => {
        isVisible.value = true
      })
    }
  )

  // 监听主进程发送的隐藏窗口指令（权限被解决或超时后）
  window.electron.ipcRenderer.on('to-renderer-PermissionNoticeFrame:hide', () => {
    isVisible.value = false
    // 动画完成后通知主进程销毁窗口
    setTimeout(() => {
      window.electron.ipcRenderer.send('to-main-PermissionNoticeFrame:destroy')
    }, 300)
  })
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

/* 渐变边框容器 - 通过 @property 动画渐变角度 */
.notice-border {
  position: relative;
  width: 500px;
  height: 120px;
  border-radius: 20px;
  overflow: hidden;
  pointer-events: auto;
  padding: 2px;

  /* 入场初始状态：微小 + 半透明 */
  transform: scale(0.2);
  opacity: 0;
  transform-origin: center center;
  transition:
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.25s ease-out;
}

/* 渐变边框伪元素 */
.notice-border::before {
  content: '';
  position: absolute;
  inset: 0;
  background: conic-gradient(
    from var(--border-angle),
    #3d8bff,
    #78b4ff,
    #a0d0ff,
    #d4a8c0,
    #e879a0,
    #c4607a,
    #3d8bff
  );
  animation: border-spin 3s linear infinite;
}

/* 入场动画触发 */
.notice-border.scale-in {
  transform: scale(1);
  opacity: 1;
}

/* 白色卡片主体 */
.notice-card {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  background: var(--bg-primary);
  border-radius: 18px;
  padding: 12px 16px;
  box-shadow:
    0 4px 20px var(--shadow-color),
    0 2px 8px rgba(255, 106, 176, 0.15);
}

/* 内容区域 */
.notice-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

/* 标题行 */
.notice-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.notice-icon {
  font-size: 16px;
}

.notice-title {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

/* 信息行 */
.notice-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.info-label {
  color: var(--text-secondary, #666);
}

.info-value {
  color: var(--accent-blue, #3d8bff);
  font-weight: 500;
}

.info-command {
  color: var(--text-secondary, #666);
  margin-left: 8px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
}

/* 按钮组容器 */
.btn-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 12px;
}

/* 按钮基础样式：继承共享 .btn，覆盖尺寸和交互 */
.btn {
  width: 80px;
  height: var(--btn-height-sm);
  border-radius: var(--btn-radius-pill);
  color: #fff;
}

.btn:hover {
  transform: scale(1.05);
}

.btn:active {
  transform: scale(0.97);
}

/* 拒绝按钮 - 红色渐变 */
.btn-deny {
  background: linear-gradient(135deg, #ef4444, #dc2626);
}

.btn-deny:hover {
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
}

/* 同意按钮 - 蓝色渐变 */
.btn-allow {
  background: linear-gradient(135deg, var(--accent-blue), #2563eb);
}

.btn-allow:hover {
  box-shadow: 0 2px 8px rgba(61, 139, 255, 0.4);
}

/* 全部同意按钮 - 绿色渐变 */
.btn-always {
  background: linear-gradient(135deg, var(--success-color), #059669);
}

.btn-always:hover {
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
}

/* 关闭按钮 - 渐变样式（用于 AskUserQuestion） */
.btn-close {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  width: 100%;
}

.btn-close:hover {
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.4);
  background: linear-gradient(135deg, #9b6ff7, #8b5cf6);
}
</style>

<!-- 全局样式：声明 @property 和 keyframes -->
<style>
/* 声明自定义属性，让浏览器可以动画化角度值 */
@property --border-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

/* 渐变角度从 0 旋转到 360 度 */
@keyframes border-spin {
  from {
    --border-angle: 0deg;
  }
  to {
    --border-angle: 360deg;
  }
}
</style>
