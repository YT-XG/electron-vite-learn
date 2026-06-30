<template>
  <div class="notice-container">
    <div class="notice-border" :class="{ 'scale-in': isVisible }">
      <div class="notice-card">
        <span class="notice-text">{{ msg }}</span>
        <div v-if="showOpenLink || showTranslate" class="btn-group">
          <button v-if="showOpenLink" class="link-btn" @click="openLink" title="打开链接">
            🔗
          </button>
          <button v-if="showTranslate" class="translate-btn" @click="openTranslate" title="翻译">
            🔄
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

/** 是否可见（触发入场缩放动画） */
const isVisible = ref(false)

/**
 * 设置通知消息内容并触发入场动画
 * @param data - 通知文本
 * @param translate - 是否显示翻译按钮
 * @param openLink - 是否显示打开链接按钮
 */
const setMsg = (data: string, translate = false, openLink = false) => {
  msg.value = data
  showTranslate.value = translate
  showOpenLink.value = openLink
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

onMounted(() => {
  // 通知主进程渲染已就绪
  window.electron.ipcRenderer.send('to-main-NoticeNewFrame:ready')
  // 监听主进程发送的消息
  window.electron.ipcRenderer.on(
    'to-renderer-NoticeNewFrame:sendMsg',
    (_e, data: string, translate: boolean, openLink: boolean) => {
      setMsg(data, translate, openLink)
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
    #3d8bff,
    #78b4ff,
    #a0d0ff,
    #ff96c8,
    #ff6ab0,
    #ff3d8b,
    #3d8bff
  );
  animation: border-spin 3s linear infinite;
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
  background: var(--bg-primary);
  border-radius: 22px;
  padding: 0 12px 0 20px;
  box-shadow:
    0 4px 20px var(--shadow-color),
    0 2px 8px rgba(255, 106, 176, 0.15);
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
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-pink));
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #fff;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.translate-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(61, 139, 255, 0.4);
}

/* 打开链接按钮 */
.link-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: linear-gradient(135deg, #10b981, #059669);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #fff;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.link-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
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
