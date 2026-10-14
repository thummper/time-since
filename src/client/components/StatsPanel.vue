<script setup lang="ts">
import { computed } from 'vue'
import { formatElapsed } from '../../shared/format.ts'
import type { Stats } from '../../shared/types.ts'

const props = defineProps<{ stats: Stats }>()

const average = computed(() =>
  props.stats.averageGapMs === null ? '—' : formatElapsed(props.stats.averageGapMs),
)
const longest = computed(() =>
  props.stats.longestGapMs === null ? '—' : formatElapsed(props.stats.longestGapMs),
)
</script>

<template>
  <dl class="card grid grid-cols-3 divide-x divide-line text-center">
    <div class="px-2 py-3">
      <dt class="text-xs text-muted">Average gap</dt>
      <dd class="text-lg font-semibold tabular-nums" data-testid="stat-average">{{ average }}</dd>
    </div>
    <div class="px-2 py-3">
      <dt class="text-xs text-muted">Longest gap</dt>
      <dd class="text-lg font-semibold tabular-nums" data-testid="stat-longest">{{ longest }}</dd>
    </div>
    <div class="px-2 py-3">
      <dt class="text-xs text-muted">Resets</dt>
      <dd class="text-lg font-semibold tabular-nums" data-testid="stat-count">
        {{ stats.resetCount }}
      </dd>
    </div>
  </dl>
</template>
