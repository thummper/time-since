<script setup lang="ts">
import { ref } from 'vue'
import { NOTE_MAX } from '../../shared/limits.ts'
import ModalFrame from './ModalFrame.vue'

defineProps<{ timerName: string }>()
const emit = defineEmits<{
  submit: [payload: { at: number; note: string | null }]
  cancel: []
}>()

const pad = (n: number) => String(n).padStart(2, '0')

/** The `datetime-local` value (local time, minute precision) for an instant. */
function toLocalInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const max = toLocalInput(Date.now())
const when = ref(max)
const note = ref('')
const error = ref<string | null>(null)

function submit(): void {
  const at = new Date(when.value).getTime()
  if (!when.value || Number.isNaN(at)) {
    error.value = 'Pick a date and time.'
    return
  }
  if (at > Date.now()) {
    error.value = 'The time cannot be in the future.'
    return
  }
  error.value = null
  const text = note.value.trim()
  emit('submit', { at, note: text === '' ? null : text })
}
</script>

<template>
  <ModalFrame :title="`Log a reset: ${timerName}`" @close="emit('cancel')">
    <form class="space-y-4" novalidate @submit.prevent="submit">
      <label class="block">
        <span class="mb-1 block text-sm font-medium">When did it happen?</span>
        <input v-model="when" type="datetime-local" :max="max" required class="field" />
      </label>
      <label class="block">
        <span class="mb-1 block text-sm font-medium">Note (optional)</span>
        <textarea
          v-model="note"
          name="note"
          rows="2"
          :maxlength="NOTE_MAX"
          class="field resize-none"
        />
      </label>
      <p v-if="error" role="alert" class="notice-error">{{ error }}</p>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn btn-quiet" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="btn btn-primary">Log reset</button>
      </div>
    </form>
  </ModalFrame>
</template>
