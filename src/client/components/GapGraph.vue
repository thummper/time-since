<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { formatElapsed, formatWhen } from '../../shared/format.ts'
import { currentRun, finishedGaps, type GapEntry, type Goal } from '../../shared/gaps.ts'

/** 30 gaps plus the current run fill the box (R9, KTD7). */
const VISIBLE_SLOTS = 31

const props = defineProps<{
  entries: readonly GapEntry[]
  /** The current time in server epoch ms. */
  now: number
  goal: Goal | null
}>()

// Finished gaps change only with the log; only the current run follows the 1s clock.
const gaps = computed(() =>
  finishedGaps(props.entries).map((gap) => ({
    ...gap,
    startText: formatWhen(gap.startAt),
    endText: formatWhen(gap.endAt),
  })),
)
const gapRange = computed(() =>
  gaps.value.reduce(
    (range, g) => ({ min: Math.min(range.min, g.ms), max: Math.max(range.max, g.ms) }),
    { min: Infinity, max: 0 },
  ),
)
const current = computed(() => currentRun(gaps.value, props.entries, props.now))
const slots = computed(() => gaps.value.length + 1)
/** One y-scale for the whole history, so scrolling never rescales (KTD5). */
const scaleMs = computed(() =>
  Math.max(1, current.value.ms, props.goal?.ms ?? 0, gapRange.value.max),
)
const heightPct = (ms: number) => `${(ms / scaleMs.value) * 100}%`
/** Above the top 15% the label would leave the scroll box, which clips it, so it goes below the line. */
const goalLabelBelow = computed(() => (props.goal ? props.goal.ms / scaleMs.value > 0.85 : false))
// The track is `max(slots, 31)` box-thirty-firsts wide, so each slot is one share of the track.
const trackSlots = computed(() => Math.max(slots.value, VISIBLE_SLOTS))
const trackWidth = computed(() => `${(trackSlots.value / VISIBLE_SLOTS) * 100}%`)
const slotWidth = computed(() => `${100 / trackSlots.value}%`)

/** The selected gap's ending entry id, `'current'`, or nothing. */
const selected = ref<number | 'current' | null>(null)
const selectedGap = computed(() =>
  typeof selected.value === 'number'
    ? (gaps.value.find((g) => g.endId === selected.value) ?? null)
    : null,
)

function toggle(key: number | 'current'): void {
  selected.value = selected.value === key ? null : key
}

// Close the details once their gap leaves the log.
watch(gaps, () => {
  if (typeof selected.value === 'number' && !selectedGap.value) selected.value = null
})

const isoWhen = (at: number) => new Date(at).toISOString()

const gapsSummary = computed(() => {
  const list = gaps.value
  if (list.length === 0) return 'No finished gaps yet.'
  return (
    `${list.length} finished gaps, shortest ${formatElapsed(gapRange.value.min)}, ` +
    `longest ${formatElapsed(gapRange.value.max)}, latest ${formatElapsed(list.at(-1)!.ms)}.`
  )
})
const summary = computed(
  () => `${gapsSummary.value} Current run ${formatElapsed(current.value.ms)}.`,
)

// Open at the newest end, but do not pull the view away from a selected bar (KTD7).
const box = ref<HTMLElement | null>(null)
async function scrollToNewest(): Promise<void> {
  await nextTick()
  if (box.value && selected.value === null) box.value.scrollLeft = box.value.scrollWidth
}
onMounted(scrollToNewest)
watch(slots, (count, previous) => {
  if (count > previous) void scrollToNewest()
})
</script>

<template>
  <section class="card space-y-2 p-3" data-testid="gap-graph">
    <h2 class="text-sm font-semibold text-muted">Gaps between resets</h2>
    <p class="sr-only">{{ summary }}</p>

    <div ref="box" class="overflow-x-auto">
      <div
        class="relative ml-auto flex h-36 items-end justify-end"
        data-testid="gap-track"
        :style="{ width: trackWidth }"
      >
        <div
          v-if="goal"
          class="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted"
          data-testid="goal-line"
          :style="{ bottom: heightPct(goal.ms) }"
        >
          <span
            class="absolute right-0 rounded bg-surface px-1 text-[0.6875rem] text-muted"
            :class="goalLabelBelow ? 'top-0.5' : 'bottom-0.5'"
            data-testid="goal-label"
            :data-side="goalLabelBelow ? 'below' : 'above'"
          >
            {{ goal.kind }} {{ formatElapsed(goal.ms) }}
          </span>
        </div>

        <button
          v-for="gap in gaps"
          :key="gap.endId"
          type="button"
          class="gap-slot"
          data-testid="gap-bar"
          :style="{ width: slotWidth }"
          :aria-pressed="selected === gap.endId"
          :aria-label="`Gap of ${formatElapsed(gap.ms)}, ${gap.startText} to ${gap.endText}`"
          @click="toggle(gap.endId)"
        >
          <span
            class="gap-fill"
            data-testid="bar-fill"
            :style="{ height: heightPct(gap.ms), minHeight: '2px' }"
          />
        </button>
        <button
          type="button"
          class="gap-slot"
          data-testid="current-bar"
          :style="{ width: slotWidth }"
          :aria-pressed="selected === 'current'"
          :aria-label="`Current run of ${formatElapsed(current.ms)} since ${formatWhen(current.startAt)}`"
          @click="toggle('current')"
        >
          <span
            class="gap-fill gap-fill-current"
            data-testid="bar-fill"
            :style="{ height: heightPct(current.ms), minHeight: '2px' }"
          />
        </button>
      </div>
    </div>

    <p v-if="gaps.length === 0" class="text-sm text-muted">
      The graph fills in after the first reset.
    </p>

    <div
      v-if="selected !== null"
      class="rounded-lg bg-bg px-3 py-2 text-sm"
      data-testid="gap-details"
      aria-live="polite"
    >
      <template v-if="selectedGap">
        <p class="font-semibold tabular-nums">{{ formatElapsed(selectedGap.ms) }}</p>
        <p class="text-muted">
          <time :datetime="isoWhen(selectedGap.startAt)">{{ selectedGap.startText }}</time>
          to
          <time :datetime="isoWhen(selectedGap.endAt)">{{ selectedGap.endText }}</time>
        </p>
        <p v-if="selectedGap.note" class="break-words">{{ selectedGap.note }}</p>
      </template>
      <template v-else>
        <p class="font-semibold tabular-nums">{{ formatElapsed(current.ms) }} so far</p>
        <p class="text-muted">
          Since
          <time :datetime="isoWhen(current.startAt)">{{ formatWhen(current.startAt) }}</time>
        </p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.gap-slot {
  display: flex;
  height: 100%;
  flex-shrink: 0;
  align-items: flex-end;
  border: 0;
  background: transparent;
  padding: 0 1px;
  cursor: pointer;
}
.gap-fill {
  display: block;
  width: 100%;
  border-radius: 2px 2px 0 0;
  background: var(--accent);
}
.gap-fill-current {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--accent);
}
.gap-slot[aria-pressed='true'] .gap-fill {
  box-shadow:
    0 0 0 2px var(--surface),
    0 0 0 3.5px var(--accent);
}
</style>
