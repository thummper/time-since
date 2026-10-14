import { defineStore } from 'pinia'
import { ref } from 'vue'

/** How long an Undo toast stays open (R10). */
export const UNDO_MS = 8000

export interface UndoToastItem {
  id: number
  timerId: number
  resetId: number
  message: string
}

export const useToastsStore = defineStore('toasts', () => {
  const toasts = ref<UndoToastItem[]>([])
  let nextId = 1

  function pushUndo(item: Omit<UndoToastItem, 'id'>): void {
    toasts.value = [...toasts.value, { id: nextId++, ...item }]
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, pushUndo, dismiss }
})
