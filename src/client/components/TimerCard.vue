<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { elapsedParts, formatElapsed } from '../../shared/format.ts'
import { goalProgress, resolveGoal } from '../../shared/gaps.ts'
import { isPastTarget, overdueByMs } from '../../shared/overdue.ts'
import type { TimerView } from '../../shared/types.ts'
import AppIcon from './AppIcon.vue'

const LONG_PRESS_MS = 500
const TONES = 5

const props = defineProps<{
  timer: TimerView
  /** The current time in server epoch ms. */
  now: number
  /** True for a short while after a reset, while its undo toast is open. */
  held?: boolean
  /** True while a reset request is in flight. */
  busy?: boolean
  error?: string | null
}>()
const emit = defineEmits<{ reset: []; retry: []; menu: [] }>()

const elapsedMs = computed(() => props.now - props.timer.lastReset.at)
const overdueMs = computed(() =>
  overdueByMs(props.timer.targetMs, props.timer.lastReset.at, props.now),
)
const overdue = computed(() =>
  isPastTarget(props.timer.targetMs, props.timer.lastReset.at, props.now),
)
const parts = computed(() => elapsedParts(elapsedMs.value))
/** Each timer keeps one pastel tone, picked from its id. */
const tone = computed(() => `tone-${props.timer.id % TONES}`)
const monogram = computed(() => props.timer.name.trim().charAt(0).toUpperCase() || '?')
/** R2: the target, or the average gap without one. */
const goal = computed(() => resolveGoal(props.timer.targetMs, props.timer.stats.averageGapMs))
const progress = computed(() => (goal.value ? goalProgress(elapsedMs.value, goal.value) : null))
const goalState = computed(() => (progress.value?.past ? `past-${goal.value!.kind}` : 'before'))

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
  if (props.busy) return
  emit('reset')
}

onBeforeUnmount(() => clearTimeout(pressTimer))
</script>

<template>
  <article
    class="tone overflow-hidden rounded-[1.375rem]"
    :class="[tone, overdue ? 'shadow-[inset_0_0_0_2px_var(--tone-ink)]' : '']"
    :data-overdue="overdue ? 'true' : undefined"
  >
    <div class="space-y-2.5 py-3.5 pr-3.5 pl-4">
      <div class="flex items-center gap-2">
        <span
          aria-hidden="true"
          class="flex size-8 shrink-0 items-center justify-center rounded-[0.625rem] bg-[var(--tone-glass)] text-sm font-bold"
        >
          {{ monogram }}
        </span>
        <RouterLink
          :to="`/timers/${timer.id}`"
          class="min-w-0 flex-1 truncate text-base font-semibold text-[var(--tone-ink)] no-underline hover:underline"
        >
          {{ timer.name }}
        </RouterLink>
        <span
          v-if="held"
          data-testid="reset-state"
          class="shrink-0 rounded-full bg-[var(--tone-glass)] px-2.5 py-0.5 text-xs font-semibold"
          >Reset</span
        >
        <button
          type="button"
          class="btn btn-quiet -my-2 -mr-2 shrink-0 text-[var(--tone-ink)] hover:border-transparent hover:bg-[var(--tone-glass)] hover:text-[var(--tone-ink)]"
          :aria-label="`More options for ${timer.name}`"
          @click="emit('menu')"
        >
          <AppIcon name="dots" />
        </button>
      </div>

      <div class="flex items-center gap-2.5">
        <p class="m-0 flex min-w-0 flex-1 flex-wrap gap-1">
          <span class="sr-only">{{ formatElapsed(elapsedMs) }}</span>
          <span
            v-for="part in parts"
            :key="part.unit"
            aria-hidden="true"
            class="flex items-baseline gap-px rounded-[0.5625rem] bg-[var(--tone-glass)] px-[7px] pt-1.5 pb-[5px] font-mono"
          >
            <span class="text-[1.3125rem] leading-none font-bold tabular-nums">{{
              part.value
            }}</span>
            <span class="text-[0.6875rem] opacity-60">{{ part.unit }}</span>
          </span>
        </p>
        <button
          type="button"
          class="flex size-[52px] shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--tone-ink)] text-[var(--tone-bg)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-55"
          :aria-label="`Reset ${timer.name}`"
          :aria-busy="busy ? 'true' : undefined"
          :disabled="busy"
          @pointerdown="pressStart"
          @pointerup="pressEnd"
          @pointerleave="pressEnd"
          @pointercancel="pressEnd"
          @contextmenu.prevent
          @click="onClick"
        >
          <AppIcon name="reset" />
        </button>
      </div>

      <div v-if="goal && progress" class="flex items-center gap-2 text-xs font-medium">
        <div
          class="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--tone-track)]"
          role="progressbar"
          :aria-label="`Progress to ${goal.kind}`"
          :aria-valuenow="Math.round(progress.percent)"
          aria-valuemin="0"
          aria-valuemax="100"
          :data-goal-state="goalState"
        >
          <div class="goal-fill h-full rounded-full" :style="{ width: `${progress.percent}%` }" />
        </div>
        <template v-if="goal.kind === 'target'">
          <span v-if="overdue" class="font-semibold"
            >Overdue by {{ formatElapsed(overdueMs) }}</span
          >
          <span v-else class="opacity-80" :title="`Target ${formatElapsed(goal.ms)}`"
            >Due in {{ formatElapsed(progress.remainingMs) }}</span
          >
        </template>
        <span v-else class="opacity-80" :title="`Average gap ${formatElapsed(goal.ms)}`">
          <template v-if="progress.past"
            >{{ formatElapsed(-progress.remainingMs) }} past average</template
          >
          <template v-else>{{ formatElapsed(progress.remainingMs) }} to average</template>
        </span>
      </div>
    </div>
    <div
      v-if="error"
      role="alert"
      class="notice-error flex items-center justify-between gap-2 rounded-none"
    >
      <span>{{ error }}</span>
      <button
        type="button"
        class="btn btn-quiet min-h-[44px] underline"
        :disabled="busy"
        @click="emit('retry')"
      >
        Retry
      </button>
    </div>
  </article>
</template>
