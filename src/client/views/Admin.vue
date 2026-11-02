<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { AdminStats } from '../../shared/types.ts'
import { api, errorMessage } from '../api/client.ts'
import AppIcon from '../components/AppIcon.vue'

const stats = ref<AdminStats | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    stats.value = await api.get<AdminStats>('/api/admin/stats')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)

interface Tile {
  label: string
  value: number
  /** A cap, shown as "of N". */
  cap?: number
}

const groups = computed<{ title: string; tiles: Tile[] }[]>(() => {
  const s = stats.value
  if (!s) return []
  return [
    {
      title: 'Accounts',
      tiles: [
        { label: 'Real accounts', value: s.accounts.real, cap: s.accounts.realCap },
        { label: 'Demo sandboxes', value: s.accounts.demo, cap: s.accounts.demoCap },
        { label: 'Signed in', value: s.signedIn },
      ],
    },
    {
      title: 'Active users',
      tiles: [
        { label: 'Last 24 hours', value: s.active.day },
        { label: 'Last 7 days', value: s.active.week },
        { label: 'Last 30 days', value: s.active.month },
      ],
    },
    {
      title: 'Sign-ups',
      tiles: [
        { label: 'Last 7 days', value: s.signups.week },
        { label: 'Last 30 days', value: s.signups.month },
      ],
    },
    {
      title: 'Content',
      tiles: [
        { label: 'Timers', value: s.content.timers },
        { label: 'Resets', value: s.content.resets },
        { label: 'Push devices', value: s.content.pushSubscriptions },
      ],
    },
  ]
})
</script>

<template>
  <section class="space-y-5">
    <div class="flex items-center gap-2">
      <RouterLink to="/settings" class="btn btn-quiet" aria-label="Back to settings">
        <AppIcon name="back" />
      </RouterLink>
      <h1 class="text-2xl font-bold">Admin</h1>
      <button
        type="button"
        class="btn btn-quiet ml-auto"
        aria-label="Refresh"
        :disabled="loading"
        @click="load"
      >
        <AppIcon name="reset" />
      </button>
    </div>

    <p v-if="loading && !stats" class="py-8 text-center text-muted">Loading stats…</p>

    <div v-else-if="error" role="alert" class="notice-error space-y-2">
      <p>{{ error }}</p>
      <button type="button" class="btn" @click="load">Retry</button>
    </div>

    <template v-else>
      <div v-for="group in groups" :key="group.title" class="space-y-2">
        <h2 class="text-sm font-semibold text-muted">{{ group.title }}</h2>
        <dl
          class="card grid divide-x divide-line text-center"
          :class="group.tiles.length === 2 ? 'grid-cols-2' : 'grid-cols-3'"
        >
          <div v-for="tile in group.tiles" :key="tile.label" class="px-2 py-3">
            <dt class="text-xs text-muted">{{ tile.label }}</dt>
            <dd
              class="text-lg font-semibold tabular-nums"
              :data-testid="`admin-${group.title}-${tile.label}`"
            >
              {{ tile.value
              }}<span v-if="tile.cap !== undefined" class="text-xs font-normal text-muted">
                / {{ tile.cap }}</span
              >
            </dd>
          </div>
        </dl>
      </div>
      <p class="text-sm text-muted">
        Active counts start when this page was added. Demo sandboxes are not in any count except
        their own.
      </p>
    </template>
  </section>
</template>
