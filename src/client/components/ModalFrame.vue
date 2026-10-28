<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)
let opener: Element | null = null
let observer: ResizeObserver | undefined

/** Publishes the space from the panel top to the screen bottom, so the toasts sit above the panel. */
function measure(): void {
  if (!panel.value) return
  const lift = Math.max(0, window.innerHeight - panel.value.getBoundingClientRect().top)
  document.documentElement.style.setProperty('--dialog-lift', `${lift}px`)
}

onMounted(() => {
  opener = document.activeElement
  const first = panel.value?.querySelector<HTMLElement>(
    'input, textarea, select, button:not([data-dismiss])',
  )
  first?.focus()
  measure()
  window.addEventListener('resize', measure)
  if (typeof ResizeObserver !== 'undefined' && panel.value) {
    observer = new ResizeObserver(measure)
    observer.observe(panel.value)
  }
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', measure)
  document.documentElement.style.removeProperty('--dialog-lift')
  if (opener instanceof HTMLElement) opener.focus()
})

/** Keeps Tab inside the dialog. */
function trap(event: KeyboardEvent): void {
  if (event.key !== 'Tab' || !panel.value) return
  const items = [
    ...panel.value.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)',
    ),
  ]
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
    @click.self="emit('close')"
    @keydown.esc.stop="emit('close')"
    @keydown="trap"
  >
    <div
      ref="panel"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      class="card max-h-full w-full max-w-md overflow-y-auto rounded-b-none p-5 sm:rounded-b-[0.875rem]"
    >
      <h2 class="mb-4 text-lg font-semibold">{{ title }}</h2>
      <slot />
    </div>
  </div>
</template>
