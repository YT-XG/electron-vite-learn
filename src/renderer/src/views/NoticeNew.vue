<template>
  <div class="notice-container">
    <div class="notice-border" :class="{ 'scale-in': isVisible }">
      <div class="notice-card">
        <span class="notice-text">{{ msg }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

/** 通知消息文本 */
const msg = ref('')

/** 是否可见（触发入场缩放动画） */
const isVisible = ref(false)

/**
 * 设置通知消息内容并触发入场动画
 * @param data - 通知文本
 */
const setMsg = (data: string) => {
  msg.value = data
}

onMounted(() => {
  // 通知主进程渲染已就绪
  window.electron.ipcRenderer.send('to-main-NoticeNewFrame:ready')
  // 监听主进程发送的消息
  window.electron.ipcRenderer.on('to-renderer-NoticeNewFrame:sendMsg', (_e, data: string) => {
    setMsg(data)
    // 下一帧触发 CSS 缩放动画（从 scale(0.2) → scale(1)）
    nextTick(() => {
      isVisible.value = true
    })
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

/* 渐变边框容器 - 通过 @property 动画渐变角度，元素本身不旋转 */
.notice-border {
  position: relative;
  width: 304px;
  height: 48px;
  border-radius: 24px;
  padding: 2px;
  background: conic-gradient(
    from var(--border-angle),
    #3d8bff,
    #78b4ff,
    #a0d0ff,
    #ff96c8,
    #ff6ab0,
    #ff3d8b,
    #3d8bff
  );
  animation: border-spin 3s linear infinite;
  pointer-events: auto;
  box-shadow:
    0 4px 20px rgba(61, 139, 255, 0.25),
    0 2px 8px rgba(255, 106, 176, 0.15);

  /* 入场初始状态：微小 + 半透明 */
  transform: scale(0.2);
  opacity: 0;
  transform-origin: center center;
  transition:
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.25s ease-out;
}

/* 入场动画触发：缩放到正常大小并显现 */
.notice-border.scale-in {
  transform: scale(1);
  opacity: 1;
}

/* 白色卡片主体 */
.notice-card {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #ffffff;
  border-radius: 22px;
  padding: 0 20px;
}

.notice-text {
  color: #1a1a1a;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.3px;
  /* 单行显示，超出省略 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
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
