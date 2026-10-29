<script setup lang="ts">
import { computed, ref } from 'vue'
import { toLocalInput } from '../../shared/format.ts'
import { DAY_MS, HOUR_MS, NAME_MAX, TARGET_MAX_MS, TARGET_MIN_MS } from '../../shared/limits.ts'
import { CADENCES, CADENCE_LABELS, compareSections, isCadence } from '../../shared/sections.ts'
import type { Placement, SectionView } from '../../shared/types.ts'

type Unit = 'days' | 'hours'

/** What the form sends. `newSection` asks the parent to create that section first (KTD4). */
export interface TimerFormPayload {
  name: string
  targetMs: number | null
  startedAt?: number
  placement: Placement
  newSection?: string
}

const NEW_SECTION = 'new'

const props = withDefaults(
  defineProps<{
    initial?: { name: string; targetMs: number | null; placement?: Placement }
    /** The user's custom sections for the picker. */
    sections?: SectionView[]
    submitLabel?: string
    busy?: boolean
    error?: string | null
    /** Shows a "started" field so a new timer can begin in the past. */
    withStart?: boolean
  }>(),
  {
    initial: () => ({ name: '', targetMs: null }),
    sections: () => [],
    submitLabel: 'Save',
    busy: false,
    error: null,
    withStart: false,
  },
)
const emit = defineEmits<{
  submit: [payload: TimerFormPayload]
  cancel: []
}>()

/** The picker's value for a placement: `auto`, `cadence:<c>`, or `custom:<id>`. */
function placementValue(placement: Placement | undefined): string {
  if (placement?.kind === 'cadence') return `cadence:${placement.cadence}`
  if (placement?.kind === 'custom') return `custom:${placement.sectionId}`
  return 'auto'
}

function placementFrom(value: string): Placement {
  const [kind, rest] = value.split(':')
  if (kind === 'cadence' && isCadence(rest)) return { kind: 'cadence', cadence: rest }
  if (kind === 'custom') return { kind: 'custom', sectionId: Number(rest) }
  return { kind: 'auto' }
}

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
const section = ref(placementValue(props.initial.placement))
const sortedSections = computed(() => [...props.sections].sort(compareSections))
const newSection = ref('')
const problem = ref<string | null>(null)

/** The placement fields of the payload, or an error message. */
function placementPart(): Pick<TimerFormPayload, 'placement' | 'newSection'> | string {
  if (section.value !== NEW_SECTION) return { placement: placementFrom(section.value) }
  const trimmed = newSection.value.trim()
  if (trimmed.length < 1 || trimmed.length > NAME_MAX) {
    return `Section name must be 1 to ${NAME_MAX} characters.`
  }
  return { placement: { kind: 'auto' }, newSection: trimmed }
}

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
  const placed = placementPart()
  if (typeof placed === 'string') {
    problem.value = placed
    return
  }
  if (!props.withStart) {
    problem.value = null
    emit('submit', { name: trimmed, targetMs, ...placed })
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
  emit('submit', { name: trimmed, targetMs, startedAt, ...placed })
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
    <label class="block">
      <span class="mb-1 block text-sm font-medium">Section</span>
      <select v-model="section" name="section" class="field">
        <option value="auto">Automatic (from target)</option>
        <option v-for="c in CADENCES" :key="c" :value="`cadence:${c}`">
          {{ CADENCE_LABELS[c] }}
        </option>
        <option v-for="s in sortedSections" :key="s.id" :value="`custom:${s.id}`">
          {{ s.name }}
        </option>
        <option :value="NEW_SECTION">New section…</option>
      </select>
    </label>
    <label v-if="section === NEW_SECTION" class="block">
      <span class="mb-1 block text-sm font-medium">New section name</span>
      <input
        v-model="newSection"
        name="newSection"
        type="text"
        :maxlength="NAME_MAX"
        autocomplete="off"
        placeholder="House"
        class="field"
      />
    </label>
    <p v-if="problem || error" role="alert" class="notice-error">{{ problem ?? error }}</p>
    <div class="flex justify-end gap-2">
      <button type="button" class="btn btn-quiet" @click="emit('cancel')">Cancel</button>
      <button type="submit" class="btn btn-primary" :disabled="busy">{{ submitLabel }}</button>
    </div>
  </form>
</template>
