<script setup lang="ts">
import { ref } from 'vue'
import { toLocalInput } from '../../shared/format.ts'
import { DAY_MS, HOUR_MS, NAME_MAX, TARGET_MAX_MS, TARGET_MIN_MS } from '../../shared/limits.ts'

type Unit = 'days' | 'hours'

const props = withDefaults(
  defineProps<{
    initial?: { name: string; targetMs: number | null }
    submitLabel?: string
    busy?: boolean
    error?: string | null
    /** Shows a "started" field so a new timer can begin in the past. */
    withStart?: boolean
  }>(),
  {
    initial: () => ({ name: '', targetMs: null }),
    submitLabel: 'Save',
    busy: false,
    error: null,
    withStart: false,
  },
)
const emit = defineEmits<{
  submit: [payload: { name: string; targetMs: number | null; startedAt?: number }]
  cancel: []
}>()

function startingTarget(targetMs: number | null): { amount: string; unit: Unit } {
  if (targetMs === null) return { amount: '', unit: 'days' }
  if (targetMs % DAY_MS === 0) return { amount: String(targetMs / DAY_MS), unit: 'days' }
  return { amount: String(Math.round((targetMs / HOUR_MS) * 100) / 100), unit: 'hours' }
}

const start = startingTarget(props.initial.targetMs)
const name = ref(props.initial.name)
const amount = ref(start.amount)
const unit = ref<Unit>(start.unit)
const maxStart = toLocalInput(Date.now())
const started = ref(maxStart)
const problem = ref<string | null>(null)

function submit(): void {
  const trimmed = name.value.trim()
  if (trimmed.length < 1 || trimmed.length > NAME_MAX) {
    problem.value = `Name must be 1 to ${NAME_MAX} characters.`
    return
  }
  let targetMs: number | null = null
  if (String(amount.value).trim() !== '') {
    const value = Number(amount.value)
    targetMs = Math.round(value * (unit.value === 'days' ? DAY_MS : HOUR_MS))
    if (!Number.isFinite(value) || targetMs < TARGET_MIN_MS || targetMs > TARGET_MAX_MS) {
      problem.value = 'Target must be between 1 hour and 365 days.'
      return
    }
  }
  if (!props.withStart) {
    problem.value = null
    emit('submit', { name: trimmed, targetMs })
    return
  }
  const startedAt = new Date(started.value).getTime()
  if (!started.value || Number.isNaN(startedAt)) {
    problem.value = 'Pick a start date and time.'
    return
  }
  if (startedAt > Date.now()) {
    problem.value = 'The start time cannot be in the future.'
    return
  }
  problem.value = null
  emit('submit', { name: trimmed, targetMs, startedAt })
}
</script>

<template>
  <form class="space-y-4" novalidate @submit.prevent="submit">
    <label class="block">
      <span class="mb-1 block text-sm font-medium">Name</span>
      <input
        v-model="name"
        name="name"
        type="text"
        :maxlength="NAME_MAX"
        autocomplete="off"
        placeholder="Clean the aquarium"
        class="field"
      />
    </label>
    <label v-if="withStart" class="block">
      <span class="mb-1 block text-sm font-medium">Last done</span>
      <input
        v-model="started"
        name="started"
        type="datetime-local"
        :max="maxStart"
        required
        class="field"
      />
    </label>
    <fieldset>
      <legend class="mb-1 text-sm font-medium">Target (optional)</legend>
      <p class="mb-2 text-sm text-muted">You get an alert when this much time passes.</p>
      <div class="flex gap-2">
        <input
          v-model="amount"
          name="amount"
          type="number"
          inputmode="decimal"
          min="0"
          step="any"
          aria-label="Target amount"
          class="field"
        />
        <select v-model="unit" name="unit" aria-label="Target unit" class="field w-32">
          <option value="days">days</option>
          <option value="hours">hours</option>
        </select>
      </div>
    </fieldset>
    <p v-if="problem || error" role="alert" class="notice-error">{{ problem ?? error }}</p>
    <div class="flex justify-end gap-2">
      <button type="button" class="btn btn-quiet" @click="emit('cancel')">Cancel</button>
      <button type="submit" class="btn btn-primary" :disabled="busy">{{ submitLabel }}</button>
    </div>
  </form>
</template>
