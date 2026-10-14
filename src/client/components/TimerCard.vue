<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { formatElapsed } from '../../shared/format.ts'
import { isPastTarget, overdueByMs } from '../../shared/overdue.ts'
import type { TimerView } from '../../shared/types.ts'
import AppIcon from './AppIcon.vue'

const LONG_PRESS_MS = 500

const props = defineProps<{
  timer: TimerView
  /** The current time in server epoch ms. */
  now: number
  /** True for a short while after a reset, while its undo toast is open. */
  held?: boolean
  error?: string | null
}>()
const emit = defineEmits<{ reset: []; menu: [] }>()

const elapsedMs = computed(() => props.now - props.timer.lastReset.at)
const overdueMs = computed(() =>
  overdueByMs(props.timer.targetMs, props.timer.lastReset.at, props.now),
)
const overdue = computed(() =>
  isPastTarget(props.timer.targetMs, props.timer.lastReset.at, props.now),
)

let pressTimer: ReturnType<typeof setTimeout> | undefined
let longPressed = false

function pressStart(): void {
  longPressed = false
  clearTimeout(pressTimer)
  pressTimer = setTimeout(() => {
    longPressed = true
    emit('menu')
  }, LONG_PRESS_MS)
}

function pressEnd(): void {
  clearTimeout(pressTimer)
}

/** A long press already opened the menu, so its click must not also reset. */
function onClick(): void {
  if (longPressed) {
    longPressed = false
    return
  }
  emit('reset')
}

onBeforeUnmount(() => clearTimeout(pressTimer))
</script>

<template>
  <article
    class="card overflow-hidden"
    :class="overdue ? 'border-danger bg-danger-soft' : ''"
    :data-overdue="overdue ? 'true' : undefined"
  >
    <div class="flex items-center gap-2 p-4">
      <div class="min-w-0 flex-1">
        <RouterLink
          :to="`/timers/${timer.id}`"
          class="block truncate text-base font-semibold text-ink no-underline hover:underline"
        >
          {{ timer.name }}
        </RouterLink>
        <p
          class="text-3xl font-bold tabular-nums leading-tight"
          :class="overdue ? 'text-danger' : ''"
        >
          {{ formatElapsed(elapsedMs) }}
        </p>
        <p v-if="overdue" class="flex items-center gap-1 text-sm font-semibold text-danger">
          <AppIcon name="alert" />
          <span>Overdue by {{ formatElapsed(overdueMs) }}</span>
        </p>
        <p v-if="timer.targetMs !== null" class="text-sm text-muted">
          Target {{ formatElapsed(timer.targetMs) }}
        </p>
        <p v-if="held" data-testid="reset-state" class="text-sm font-semibold text-accent">Reset</p>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          class="btn btn-quiet"
          :aria-label="`More options for ${timer.name}`"
          @click="emit('menu')"
        >
          <AppIcon name="dots" />
        </button>
        <button
          type="button"
          class="btn btn-primary min-h-[48px] min-w-[48px]"
          :aria-label="`Reset ${timer.name}`"
          @pointerdown="pressStart"
          @pointerup="pressEnd"
          @pointerleave="pressEnd"
          @pointercancel="pressEnd"
          @contextmenu.prevent
          @click="onClick"
        >
          <AppIcon name="reset" />
          <span>Reset</span>
        </button>
      </div>
    </div>
    <div
      v-if="error"
      role="alert"
      class="notice-error flex items-center justify-between gap-2 rounded-none"
    >
      <span>{{ error }}</span>
      <button type="button" class="btn btn-quiet min-h-[44px] underline" @click="emit('reset')">
        Retry
      </button>
    </div>
  </article>
</template>
