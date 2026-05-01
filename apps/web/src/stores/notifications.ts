import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TToastVariant, IToastCta } from '@nubisco/ui'

export interface Notification {
  id: string
  variant: TToastVariant
  message: string
  title?: string
  duration?: number
  cta?: IToastCta
}

const MAX_VISIBLE = 3

export const useNotificationsStore = defineStore('notifications', () => {
  const queue = ref<Notification[]>([])

  const visible = computed(() => queue.value.slice(0, MAX_VISIBLE))

  function add(notification: Notification) {
    queue.value.push(notification)
  }

  function remove(id: string) {
    const idx = queue.value.findIndex((n) => n.id === id)
    if (idx !== -1) queue.value.splice(idx, 1)
  }

  function clear() {
    queue.value = []
  }

  return { queue, visible, add, remove, clear }
})
