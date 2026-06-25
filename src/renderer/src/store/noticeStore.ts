import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useNoticeStore = defineStore('notice', () => {
  const text = ref('')
  const visible = ref(false)
  const savedPosition = ref<[number, number]>([0, 0])

  function showNotice(content: string, position: [number, number]) {
    text.value = content
    savedPosition.value = position
    visible.value = true
  }

  function hideNotice() {
    text.value = ''
    visible.value = false
  }

  return { text, visible, savedPosition, showNotice, hideNotice }
})
