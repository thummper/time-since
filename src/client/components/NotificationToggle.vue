<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { errorMessage } from '../api/client.ts'
import {
  currentEndpoint,
  pushPermission,
  pushSupported,
  subscribePush,
  unsubscribePush,
} from '../push/subscribe.ts'

const supported = ref(pushSupported())
const blocked = ref(pushPermission() === 'denied')
const on = ref(false)
const busy = ref(false)
const problem = ref('')

const hint = computed(() => {
  if (!supported.value) return 'Alerts are not supported in this browser.'
  if (blocked.value) return 'Notifications are blocked. Allow them in the browser site settings.'
  return problem.value
})

onMounted(async () => {
  if (!supported.value || blocked.value) return
  on.value = (await currentEndpoint()) !== null
})

async function toggle(): Promise<void> {
  busy.value = true
  problem.value = ''
  try {
    if (on.value) {
      await unsubscribePush()
      on.value = false
    } else {
      const result = await subscribePush()
      blocked.value = result === 'denied'
      supported.value = result !== 'unsupported'
      on.value = result === 'subscribed'
    }
  } catch (error) {
    problem.value = errorMessage(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="card space-y-2 p-4" data-testid="notification-toggle">
    <div class="flex items-center justify-between gap-3">
      <span class="font-semibold">Overdue alerts on this device</span>
      <button
        type="button"
        role="switch"
        class="btn"
        data-testid="notification-switch"
        :aria-checked="on"
        :disabled="busy || !supported || blocked"
        @click="toggle"
      >
        {{ on ? 'On' : 'Off' }}
      </button>
    </div>
    <p v-if="hint" class="text-sm text-muted" role="status">{{ hint }}</p>
  </div>
</template>
