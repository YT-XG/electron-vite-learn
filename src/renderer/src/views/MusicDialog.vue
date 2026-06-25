<template>
  <div class="container" @mousedown="dragMouseDown">大框</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const isKeyDown = ref(false)
const dinatesX = ref(0)
const dinatesY = ref(0)

const dragMouseDown = (event: MouseEvent) => {
  isKeyDown.value = true
  dinatesX.value = event.x
  dinatesY.value = event.y
  document.onmousemove = (ev: MouseEvent) => {
    if (isKeyDown.value) {
      const x = ev.screenX - dinatesX.value
      const y = ev.screenY - dinatesY.value
      window.electron.ipcRenderer.invoke('custom-music-dialog', { appX: x, appY: y })
    }
  }
  document.onmouseup = () => {
    isKeyDown.value = false
  }
}
</script>

<style scoped>
.container {
  border-radius: 30px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  right: 0;
  color: #fff;
  font-size: 20px;
}
.container:hover {
  background-color: rgba(0, 0, 0, 0.5);
}
</style>
