<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { isPastTarget } from '../../shared/overdue.ts'
import { errorMessage } from '../api/client.ts'
import { useCollapsed } from '../collapsed.ts'
import AppIcon from '../components/AppIcon.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import ModalFrame from '../components/ModalFrame.vue'
import ResetDialog from '../components/ResetDialog.vue'
import SectionGroup from '../components/SectionGroup.vue'
import TimerCard from '../components/TimerCard.vue'
import TimerForm, { type TimerFormPayload } from '../components/TimerForm.vue'
import { useTimersStore } from '../stores/timers.ts'
import { useToastsStore } from '../stores/toasts.ts'
import type { TimerView } from '../../shared/types.ts'

const timers = useTimersStore()
const toasts = useToastsStore()
const collapsed = useCollapsed()

const adding = ref(false)
const addBusy = ref(false)
const addError = ref<string | null>(null)
const dialogTimer = ref<TimerView | null>(null)
/** The timer whose reset waits for confirmation. */
const confirmTimer = ref<TimerView | null>(null)

const summary = computed(() => {
  const count = timers.timers.length
  const overdue = timers.timers.filter((t) =>
    isPastTarget(t.targetMs, t.lastReset.at, timers.now),
  ).length
  const label = `${count} ${count === 1 ? 'timer' : 'timers'}`
  return overdue > 0 ? `${label} · ${overdue} overdue` : label
})

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

async function confirmReset(): Promise<void> {
  const timer = confirmTimer.value
  confirmTimer.value = null
  if (timer) await reset(timer)
}

async function submitDialog(payload: { at: number; note: string | null }): Promise<void> {
  const timer = dialogTimer.value
  dialogTimer.value = null
  if (timer) await reset(timer, payload)
}

async function addTimer(payload: TimerFormPayload): Promise<void> {
  addBusy.value = true
  addError.value = null
  try {
    const placement = await timers.placementFor(payload)
    const timer = await timers.createTimer(
      payload.name,
      payload.targetMs,
      payload.startedAt,
      placement,
    )
    collapsed.expand(timers.sectionOf(timer))
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
    <div>
      <p v-if="timers.status === 'ready' && timers.timers.length > 0" class="text-sm text-muted">
        {{ summary }}
      </p>
      <h1 class="text-[1.75rem] leading-tight font-bold tracking-tight">Your timers</h1>
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

      <div v-else class="space-y-4">
        <SectionGroup
          v-for="group in timers.grouped"
          :key="group.key"
          :group="group"
          :collapsed="group.collapsible && collapsed.isCollapsed(group.key)"
          @toggle="collapsed.toggle(group.key)"
        >
          <template #default="{ timer }">
            <TimerCard
              :timer="timer"
              :now="timers.now"
              :held="timers.isHeld(timer.id)"
              :busy="timers.isResetting(timer.id)"
              :error="timers.rowErrors[timer.id]"
              @reset="confirmTimer = timer"
              @retry="reset(timer)"
              @menu="dialogTimer = timer"
            />
          </template>
        </SectionGroup>
      </div>
    </template>

    <div
      v-if="timers.status === 'ready' && timers.timers.length > 0"
      class="pointer-events-none fixed inset-x-0 bottom-[var(--toast-stack,0px)] flex justify-center pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <button type="button" class="btn btn-primary btn-pill pointer-events-auto" @click="openAdd">
        <AppIcon name="plus" />
        <span>Add timer</span>
      </button>
    </div>

    <ModalFrame v-if="adding" title="Add timer" @close="adding = false">
      <TimerForm
        submit-label="Add timer"
        with-start
        :sections="timers.sections"
        :busy="addBusy"
        :error="addError"
        @submit="addTimer"
        @cancel="adding = false"
      />
    </ModalFrame>

    <ConfirmDialog
      v-if="confirmTimer"
      :title="`Reset ${confirmTimer.name}?`"
      confirm-label="Reset"
      @confirm="confirmReset"
      @cancel="confirmTimer = null"
    >
      <p>The timer starts again from now. You can undo this for a few seconds.</p>
    </ConfirmDialog>

    <ResetDialog
      v-if="dialogTimer"
      :timer-name="dialogTimer.name"
      @submit="submitDialog"
      @cancel="dialogTimer = null"
    />
  </section>
</template>
