<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useToastsStore } from '../stores/toasts.ts'
import UndoToast from './UndoToast.vue'
import UpdatePrompt from './UpdatePrompt.vue'

const toasts = useToastsStore()
const host = ref<HTMLElement | null>(null)
let observer: ResizeObserver | undefined

/**
 * Publishes the stack height as `--toast-stack`, so the Add button and the page end sit above
 * the toasts instead of under them. An empty stack takes no space. An open dialog sets
 * `--dialog-lift`, which moves the stack up above the dialog panel.
 */
function measure(): void {
  const el = host.value
  const height = el && el.childElementCount > 0 ? el.offsetHeight : 0
  document.documentElement.style.setProperty('--toast-stack', `${height}px`)
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && host.value) {
    observer = new ResizeObserver(measure)
    observer.observe(host.value)
  }
})
watch(() => toasts.toasts.length, measure, { flush: 'post' })
onBeforeUnmount(() => {
  observer?.disconnect()
  document.documentElement.style.removeProperty('--toast-stack')
})
</script>

<template>
  <div
    ref="host"
    class="pointer-events-none fixed inset-x-0 bottom-[var(--dialog-lift,0px)] z-50 mx-auto flex max-w-xl flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
  >
    <UndoToast
      v-for="toast in toasts.toasts"
      :key="toast.id"
      :toast="toast"
      @close="toasts.dismiss(toast.id)"
    />
    <UpdatePrompt />
  </div>
</template>
