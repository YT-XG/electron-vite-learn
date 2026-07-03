<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
        <div class="dialog-box" :style="{ maxWidth: width }" @click.stop>
          <!-- 头部 -->
          <div v-if="title || showClose" class="dialog-header">
            <h3 class="dialog-title">{{ title }}</h3>
            <button v-if="showClose" class="dialog-close" @click="handleClose">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- 内容 -->
          <div class="dialog-content">
            <slot />
          </div>

          <!-- 底部操作栏 -->
          <div v-if="$slots.footer" class="dialog-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * 统一对话框组件
 * @property visible - 是否显示
 * @property title - 标题
 * @property width - 最大宽度
 * @property showClose - 是否显示关闭按钮
 * @property closeOnOverlay - 点击遮罩是否关闭
 * @emits close - 关闭事件
 */

interface Props {
  visible: boolean
  title?: string
  width?: string
  showClose?: boolean
  closeOnOverlay?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  width: '400px',
  showClose: true,
  closeOnOverlay: true
})

const emit = defineEmits<{
  close: []
}>()

function handleClose(): void {
  if (props.closeOnOverlay) {
    emit('close')
  }
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-box {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow-xl);
  min-width: 320px;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 0;
}

.dialog-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.dialog-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.dialog-close:hover {
  background: rgba(var(--danger-rgb), 0.1);
  color: var(--danger);
}

.dialog-content {
  padding: 16px 20px;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border);
}

/* 入场/退场动画 */
.dialog-enter-active {
  transition: opacity 0.2s ease;
}

.dialog-leave-active {
  transition: opacity 0.15s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-active .dialog-box {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}

.dialog-leave-active .dialog-box {
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.dialog-enter-from .dialog-box {
  transform: scale(0.95) translateY(8px);
  opacity: 0;
}

.dialog-leave-to .dialog-box {
  transform: scale(0.97);
  opacity: 0;
}
</style>
