<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import NotificationToggle from '../components/NotificationToggle.vue'
import { useAuthStore } from '../stores/auth.ts'

const auth = useAuthStore()
const router = useRouter()
const busy = ref(false)

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
