<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { formatElapsed } from '../../shared/format.ts'
import { gapSeries, type GapEntry, type Goal } from '../../shared/gaps.ts'

/** 30 gaps plus the current run fill the box (R9, KTD7). */
const VISIBLE_SLOTS = 31

const props = defineProps<{
  entries: readonly GapEntry[]
  /** The current time in server epoch ms. */
  now: number
  goal: Goal | null
}>()

const series = computed(() => gapSeries(props.entries, props.now))
const slots = computed(() => series.value.gaps.length + 1)
/** One y-scale for the whole history, so scrolling never rescales (KTD5). */
const scaleMs = computed(() =>
  Math.max(1, series.value.current.ms, props.goal?.ms ?? 0, ...series.value.gaps.map((g) => g.ms)),
)
const heightPct = (ms: number) => `${(ms / scaleMs.value) * 100}%`
const trackWidth = computed(
  () => `${(Math.max(slots.value, VISIBLE_SLOTS) / VISIBLE_SLOTS) * 100}%`,
)
const slotWidth = `${100 / VISIBLE_SLOTS}%`

/** The selected gap's ending entry id, `'current'`, or nothing. */
const selected = ref<number | 'current' | null>(null)
const selectedGap = computed(() =>
  typeof selected.value === 'number'
    ? (series.value.gaps.find((g) => g.endId === selected.value) ?? null)
    : null,
)

function toggle(key: number | 'current'): void {
  selected.value = selected.value === key ? null : key
}

// Close the details once their gap leaves the log.
watch(series, () => {
  if (typeof selected.value === 'number' && !selectedGap.value) selected.value = null
})

const formatWhen = (at: number) =>
  new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const isoWhen = (at: number) => new Date(at).toISOString()

const summary = computed(() => {
  const { gaps, current } = series.value
  const run = `Current run ${formatElapsed(current.ms)}.`
  if (gaps.length === 0) return `No finished gaps yet. ${run}`
  const lengths = gaps.map((g) => g.ms)
  return (
    `${gaps.length} finished gaps, shortest ${formatElapsed(Math.min(...lengths))}, ` +
    `longest ${formatElapsed(Math.max(...lengths))}, latest ${formatElapsed(lengths.at(-1)!)}. ${run}`
  )
})

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
            class="absolute right-0 bottom-0.5 rounded bg-surface px-1 text-[0.6875rem] text-muted"
          >
            {{ goal.kind }} {{ formatElapsed(goal.ms) }}
          </span>
        </div>

        <button
          v-for="gap in series.gaps"
          :key="gap.endId"
          type="button"
          class="gap-slot"
          data-testid="gap-bar"
          :style="{ width: slotWidth }"
          :aria-pressed="selected === gap.endId"
          :aria-label="`Gap of ${formatElapsed(gap.ms)}, ${formatWhen(gap.startAt)} to ${formatWhen(gap.endAt)}`"
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
          :aria-label="`Current run of ${formatElapsed(series.current.ms)} since ${formatWhen(series.current.startAt)}`"
          @click="toggle('current')"
        >
          <span
            class="gap-fill gap-fill-current"
            data-testid="bar-fill"
            :style="{ height: heightPct(series.current.ms), minHeight: '2px' }"
          />
        </button>
      </div>
    </div>

    <p v-if="series.gaps.length === 0" class="text-sm text-muted">
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
          <time :datetime="isoWhen(selectedGap.startAt)">{{
            formatWhen(selectedGap.startAt)
          }}</time>
          to
          <time :datetime="isoWhen(selectedGap.endAt)">{{ formatWhen(selectedGap.endAt) }}</time>
        </p>
        <p v-if="selectedGap.note" class="break-words">{{ selectedGap.note }}</p>
      </template>
      <template v-else>
        <p class="font-semibold tabular-nums">{{ formatElapsed(series.current.ms) }} so far</p>
        <p class="text-muted">
          Since
          <time :datetime="isoWhen(series.current.startAt)">{{
            formatWhen(series.current.startAt)
          }}</time>
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
