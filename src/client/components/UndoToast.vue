<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useTimersStore } from '../stores/timers.ts'
import { UNDO_MS, type UndoToastItem } from '../stores/toasts.ts'

const props = withDefaults(defineProps<{ toast: UndoToastItem; durationMs?: number }>(), {
  durationMs: UNDO_MS,
})
const emit = defineEmits<{ close: [] }>()

const timers = useTimersStore()
const busy = ref(false)
const failed = ref(false)

let handle: ReturnType<typeof setTimeout> | undefined
let closed = false

function close(): void {
  if (closed) return
  closed = true
  clearTimeout(handle)
  timers.releaseHold(props.toast.timerId)
  emit('close')
}

async function undo(): Promise<void> {
  busy.value = true
  failed.value = false
  const ok = await timers.undoReset(props.toast.timerId, props.toast.resetId)
  busy.value = false
  if (ok) close()
  else failed.value = true
}

onMounted(() => {
  handle = setTimeout(close, props.durationMs)
})
onBeforeUnmount(() => {
  clearTimeout(handle)
  if (!closed) {
    closed = true
    timers.releaseHold(props.toast.timerId)
  }
})
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    class="card pointer-events-auto flex items-center justify-between gap-3 px-4 py-2"
  >
    <p class="text-sm">
      <template v-if="failed">Could not undo. Try again.</template>
      <template v-else>{{ toast.message }}</template>
    </p>
    <button type="button" class="btn btn-quiet text-accent" :disabled="busy" @click="undo">
      Undo
    </button>
  </div>
</template>
