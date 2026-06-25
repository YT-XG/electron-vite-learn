import { defineStore } from 'pinia'
import { useUserStore } from '@renderer/store/userStore'

export const useStore = defineStore('main', {
  state: () => {
    return {
      user: useUserStore()
    }
  },
  getters: {},
  actions: {}
})
