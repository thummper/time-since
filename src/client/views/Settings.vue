<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import NotificationToggle from '../components/NotificationToggle.vue'
import SectionsCard from '../components/SectionsCard.vue'
import { useAuthStore } from '../stores/auth.ts'
import { type ThemeChoice, useTheme } from '../theme.ts'

const auth = useAuthStore()
const router = useRouter()
const busy = ref(false)
const { theme, setTheme } = useTheme()

const themeOptions: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

async function leave(): Promise<void> {
  busy.value = true
  try {
    await auth.logout()
  } finally {
    busy.value = false
    await router.replace({ name: 'welcome' })
  }
}
</script>

<template>
  <section class="space-y-5">
    <div class="flex items-center gap-2">
      <RouterLink to="/" class="btn btn-quiet" aria-label="Back to timers">
        <AppIcon name="back" />
      </RouterLink>
      <h1 class="text-2xl font-bold">Settings</h1>
    </div>

    <div v-if="auth.user && !auth.user.isDemo" class="card p-4">
      <p class="text-sm text-muted">Signed in as</p>
      <p class="break-all font-semibold" data-testid="account-email">{{ auth.user.email }}</p>
    </div>

    <fieldset class="card space-y-3 p-4" data-testid="theme-switch">
      <legend class="float-left mb-3 w-full font-semibold">Appearance</legend>
      <div class="clear-both grid grid-cols-3 gap-1 rounded-[0.875rem] bg-bg p-1">
        <label
          v-for="option in themeOptions"
          :key="option.value"
          class="flex min-h-[44px] cursor-pointer items-center justify-center rounded-[0.625rem] text-sm font-semibold text-muted has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-[var(--shadow)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
        >
          <input
            type="radio"
            name="theme"
            class="sr-only"
            :value="option.value"
            :checked="theme === option.value"
            @change="setTheme(option.value)"
          />
          {{ option.label }}
        </label>
      </div>
      <p class="text-sm text-muted">System follows your device's light or dark setting.</p>
    </fieldset>

    <SectionsCard />

    <NotificationToggle v-if="auth.user && !auth.user.isDemo" />

    <div class="card space-y-3 p-4">
      <p v-if="auth.user?.isDemo" class="text-sm">
        Leaving the demo ends this sandbox. You cannot reopen it, and its timers are lost.
      </p>
      <button type="button" class="btn btn-danger" :disabled="busy" @click="leave">
        {{ auth.user?.isDemo ? 'Leave demo' : 'Log out' }}
      </button>
    </div>
  </section>
</template>
