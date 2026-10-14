<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { errorMessage } from '../api/client.ts'
import { safeRedirect } from '../router.ts'
import { useAuthStore } from '../stores/auth.ts'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const busy = ref(false)
const error = ref<string | null>(null)

async function tryDemo(): Promise<void> {
  busy.value = true
  error.value = null
  try {
    await auth.startDemo()
    await router.replace(safeRedirect(route.query.redirect))
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="space-y-6 pt-8 text-center">
    <div class="space-y-2">
      <h1 class="text-3xl font-bold">Time Since</h1>
      <p class="text-muted">
        See at a glance how long it has been since each chore was last done, and get told when one
        is overdue.
      </p>
    </div>
    <p v-if="auth.demoExpired" role="alert" class="notice-error">
      Demo expired. Start a new demo or create an account.
    </p>
    <p v-if="error" role="alert" class="notice-error">{{ error }}</p>
    <div class="mx-auto flex max-w-xs flex-col gap-3">
      <button type="button" class="btn btn-primary" :disabled="busy" @click="tryDemo">
        Try demo
      </button>
      <RouterLink :to="{ name: 'login', query: route.query }" class="btn">Log in</RouterLink>
      <RouterLink :to="{ name: 'register', query: route.query }" class="btn">Sign up</RouterLink>
    </div>
    <p class="text-sm text-muted">The demo is a private sandbox with example timers.</p>
  </section>
</template>
