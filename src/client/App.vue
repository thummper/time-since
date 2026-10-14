<script setup lang="ts">
import { watchEffect } from 'vue'
import DemoBanner from './components/DemoBanner.vue'
import AppIcon from './components/AppIcon.vue'
import ToastHost from './components/ToastHost.vue'
import UpdatePrompt from './components/UpdatePrompt.vue'
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
  <div class="min-h-screen pb-24">
    <header v-if="auth.user" class="border-b border-line bg-surface">
      <div class="mx-auto flex max-w-xl items-center justify-between px-4 py-2">
        <RouterLink to="/" class="text-lg font-bold text-ink no-underline">Time Since</RouterLink>
        <RouterLink to="/settings" class="btn btn-quiet" aria-label="Settings">
          <AppIcon name="gear" />
        </RouterLink>
      </div>
    </header>
    <DemoBanner v-if="auth.user?.isDemo" />
    <main class="mx-auto max-w-xl px-4 py-5">
      <RouterView />
    </main>
    <ToastHost />
    <UpdatePrompt />
  </div>
</template>
