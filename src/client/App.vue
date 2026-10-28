<script setup lang="ts">
import { watchEffect } from 'vue'
import DemoBanner from './components/DemoBanner.vue'
import AppIcon from './components/AppIcon.vue'
import ToastHost from './components/ToastHost.vue'
import { useAuthStore } from './stores/auth.ts'
import { useTimersStore } from './stores/timers.ts'

const auth = useAuthStore()
const timers = useTimersStore()

// While signed in: tick every second and refetch on focus (R2, R9, KTD13).
watchEffect((onCleanup) => {
  if (!auth.user) return
  const stopTicker = timers.startTicker()
  const stopFocus = timers.watchFocus()
  onCleanup(() => {
    stopTicker()
    stopFocus()
  })
})
</script>

<template>
  <div class="min-h-screen pb-[calc(6rem+var(--toast-stack,0px))]">
    <header v-if="auth.user">
      <div class="mx-auto flex max-w-xl items-center justify-between px-4 pt-4">
        <RouterLink
          to="/"
          class="text-lg font-bold tracking-tight text-ink no-underline hover:opacity-80"
        >
          Time Since
        </RouterLink>
        <RouterLink
          to="/settings"
          class="flex size-11 items-center justify-center rounded-full bg-surface text-ink shadow-[var(--shadow)] hover:opacity-80"
          aria-label="Settings"
        >
          <AppIcon name="gear" />
        </RouterLink>
      </div>
    </header>
    <DemoBanner v-if="auth.user?.isDemo" />
    <main class="mx-auto max-w-xl px-4 py-5">
      <RouterView />
    </main>
    <ToastHost />
  </div>
</template>
