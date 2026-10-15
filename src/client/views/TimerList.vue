<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { errorMessage } from '../api/client.ts'
import AppIcon from '../components/AppIcon.vue'
import ModalFrame from '../components/ModalFrame.vue'
import ResetDialog from '../components/ResetDialog.vue'
import TimerCard from '../components/TimerCard.vue'
import TimerForm from '../components/TimerForm.vue'
import { useTimersStore } from '../stores/timers.ts'
import { useToastsStore } from '../stores/toasts.ts'
import type { TimerView } from '../../shared/types.ts'

const timers = useTimersStore()
const toasts = useToastsStore()

const adding = ref(false)
const addBusy = ref(false)
const addError = ref<string | null>(null)
const dialogTimer = ref<TimerView | null>(null)

onMounted(() => {
  void timers.fetchTimers({ silent: timers.status === 'ready' })
})

async function reset(timer: TimerView, input: { at?: number; note?: string | null } = {}) {
  const done = await timers.reset(timer.id, input)
  if (done) {
    toasts.pushUndo({ timerId: timer.id, resetId: done.id, message: `${timer.name} reset` })
  }
  return done
}

async function submitDialog(payload: { at: number; note: string | null }): Promise<void> {
  const timer = dialogTimer.value
  dialogTimer.value = null
  if (timer) await reset(timer, payload)
}

async function addTimer(payload: {
  name: string
  targetMs: number | null
  startedAt?: number
}): Promise<void> {
  addBusy.value = true
  addError.value = null
  try {
    await timers.createTimer(payload.name, payload.targetMs, payload.startedAt)
    adding.value = false
  } catch (e) {
    addError.value = errorMessage(e)
  } finally {
    addBusy.value = false
  }
}

function openAdd(): void {
  addError.value = null
  adding.value = true
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Your timers</h1>
      <button type="button" class="btn btn-primary" @click="openAdd">
        <AppIcon name="plus" />
        <span>Add timer</span>
      </button>
    </div>

    <p
      v-if="timers.status === 'loading' || timers.status === 'idle'"
      class="py-8 text-center text-muted"
    >
      Loading timers…
    </p>

    <div v-else-if="timers.status === 'error'" role="alert" class="notice-error space-y-2">
      <p>{{ timers.loadError }}</p>
      <button type="button" class="btn" @click="timers.fetchTimers()">Retry</button>
    </div>

    <template v-else>
      <div
        v-if="timers.loadError"
        role="alert"
        class="notice-error flex items-center justify-between gap-2"
      >
        <span>{{ timers.loadError }} Showing the last values.</span>
        <button type="button" class="btn" @click="timers.fetchTimers({ silent: true })">
          Retry
        </button>
      </div>

      <div v-if="timers.timers.length === 0" class="card space-y-3 p-8 text-center">
        <p class="font-semibold">No timers yet</p>
        <p class="text-muted">Add a timer for something you want to keep track of.</p>
        <button type="button" class="btn btn-primary" @click="openAdd">
          <AppIcon name="plus" />
          <span>Add timer</span>
        </button>
      </div>

      <ul v-else class="space-y-3">
        <li v-for="timer in timers.sorted" :key="timer.id">
          <TimerCard
            :timer="timer"
            :now="timers.now"
            :held="timers.isHeld(timer.id)"
            :busy="timers.isResetting(timer.id)"
            :error="timers.rowErrors[timer.id]"
            @reset="reset(timer)"
            @menu="dialogTimer = timer"
          />
        </li>
      </ul>
    </template>

    <ModalFrame v-if="adding" title="Add timer" @close="adding = false">
      <TimerForm
        submit-label="Add timer"
        with-start
        :busy="addBusy"
        :error="addError"
        @submit="addTimer"
        @cancel="adding = false"
      />
    </ModalFrame>

    <ResetDialog
      v-if="dialogTimer"
      :timer-name="dialogTimer.name"
      @submit="submitDialog"
      @cancel="dialogTimer = null"
    />
  </section>
</template>
