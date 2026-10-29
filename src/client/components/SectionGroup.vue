<script setup lang="ts">
import { computed } from 'vue'
import type { SectionGroup } from '../../shared/sections.ts'
import type { TimerView } from '../../shared/types.ts'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  group: SectionGroup<TimerView>
  collapsed: boolean
}>()
const emit = defineEmits<{ toggle: [] }>()

const listId = computed(() => `section-${props.group.key.replace(':', '-')}`)
</script>

<template>
  <section :data-section="group.key" class="space-y-2">
    <h2 class="text-sm font-semibold text-muted">
      <button
        v-if="group.collapsible"
        type="button"
        class="flex min-h-11 w-full items-center gap-2 text-left"
        :aria-expanded="!collapsed"
        :aria-controls="listId"
        @click="emit('toggle')"
      >
        <AppIcon
          name="chevron"
          class="shrink-0 transition-transform"
          :class="collapsed ? '-rotate-90' : ''"
        />
        <span class="min-w-0 truncate">{{ group.name }}</span>
        <span class="tabular-nums" data-testid="section-count">{{ group.timers.length }}</span>
      </button>
      <span v-else class="flex min-h-11 items-center gap-2">
        <AppIcon name="alert" class="shrink-0" />
        <span>{{ group.name }}</span>
        <span class="tabular-nums" data-testid="section-count">{{ group.timers.length }}</span>
      </span>
    </h2>
    <ul v-if="!collapsed" :id="listId" class="space-y-2.5">
      <li v-for="timer in group.timers" :key="timer.id">
        <slot :timer="timer" />
      </li>
    </ul>
  </section>
</template>
