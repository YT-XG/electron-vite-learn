import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', {
  state: () => ({
    name: 'hello pinia',
    age: 18
  }),
  persist: true
})
