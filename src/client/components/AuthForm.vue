<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { errorMessage } from '../api/client.ts'
import { useAuthStore } from '../stores/auth.ts'
import { safeRedirect } from '../router.ts'

const props = defineProps<{ mode: 'login' | 'register' }>()

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit(): Promise<void> {
  busy.value = true
  error.value = null
  try {
    if (props.mode === 'login') await auth.login(email.value, password.value)
    else await auth.register(email.value, password.value)
    await router.replace(safeRedirect(route.query.redirect))
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="card space-y-4 p-5" @submit.prevent="submit">
    <label class="block">
      <span class="mb-1 block text-sm font-medium">Email</span>
      <input
        v-model="email"
        type="email"
        name="email"
        autocomplete="email"
        required
        class="field"
      />
    </label>
    <label class="block">
      <span class="mb-1 block text-sm font-medium">Password</span>
      <input
        v-model="password"
        type="password"
        name="password"
        :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
        required
        class="field"
      />
      <span v-if="mode === 'register'" class="mt-1 block text-sm text-muted">
        At least 8 characters.
      </span>
    </label>
    <p v-if="error" role="alert" class="notice-error">{{ error }}</p>
    <button type="submit" class="btn btn-primary w-full" :disabled="busy">
      {{ mode === 'login' ? 'Log in' : 'Create account' }}
    </button>
  </form>
</template>
