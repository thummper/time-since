<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { formatElapsed, formatWhen } from '../../shared/format.ts'
import { resolveGoal } from '../../shared/gaps.ts'
import { NOTE_MAX } from '../../shared/limits.ts'
import { isPastTarget, overdueByMs } from '../../shared/overdue.ts'
import { errorMessage } from '../api/client.ts'
import AppIcon from '../components/AppIcon.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import GapGraph from '../components/GapGraph.vue'
import ModalFrame from '../components/ModalFrame.vue'
import StatsPanel from '../components/StatsPanel.vue'
import TimerForm, { type TimerFormPayload } from '../components/TimerForm.vue'
import { expandSection } from '../collapsed.ts'
import { onAppFocus } from '../stores/focus.ts'
import { useTimersStore } from '../stores/timers.ts'

const route = useRoute()
const router = useRouter()
const timers = useTimersStore()

const id = computed(() => Number(route.params.id))
const timer = computed(() => timers.byId(id.value))
const log = computed(() =>
  [...(timers.logs[id.value] ?? [])].sort((a, b) => b.at - a.at || b.id - a.id),
)
const goal = computed(() =>
  timer.value ? resolveGoal(timer.value.targetMs, timer.value.stats.averageGapMs) : null,
)

/** True once the first load finished, so "no longer exists" never shows too early. */
const loaded = ref(false)
const loading = ref(true)
const error = ref<string | null>(null)

const editing = ref(false)
const editBusy = ref(false)
const editError = ref<string | null>(null)

const confirmingDelete = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

const noteEditId = ref<number | null>(null)
const noteDraft = ref('')
const entryError = ref<string | null>(null)
const confirmEntryId = ref<number | null>(null)

const elapsedMs = computed(() => (timer.value ? timers.now - timer.value.lastReset.at : 0))
const overdueMs = computed(() =>
  timer.value ? overdueByMs(timer.value.targetMs, timer.value.lastReset.at, timers.now) : 0,
)
const overdue = computed(() =>
  timer.value ? isPastTarget(timer.value.targetMs, timer.value.lastReset.at, timers.now) : false,
)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  await timers.fetchTimers({ silent: timers.status === 'ready' })
  if (timers.status !== 'ready') {
    error.value = timers.loadError ?? 'Could not load this timer.'
  } else if (timers.byId(id.value)) {
    try {
      await timers.fetchLog(id.value)
    } catch (e) {
      error.value = errorMessage(e)
    }
  }
  loaded.value = error.value === null
  loading.value = false
}

/** Quiet refresh when the app regains focus. Errors keep the old log on screen. */
function refreshLog(): void {
  if (!loaded.value || !timer.value) return
  void timers.fetchLog(id.value).catch(() => undefined)
}

let stopFocus: (() => void) | undefined
onMounted(() => {
  void load()
  stopFocus = onAppFocus(refreshLog)
})
onBeforeUnmount(() => stopFocus?.())

function openEdit(): void {
  editError.value = null
  editing.value = true
}

function openDelete(): void {
  deleteError.value = null
  confirmingDelete.value = true
}

async function saveTimer(payload: TimerFormPayload): Promise<void> {
  editBusy.value = true
  editError.value = null
  try {
    const placement = await timers.placementFor(payload)
    const saved = await timers.updateTimer(id.value, {
      name: payload.name,
      targetMs: payload.targetMs,
      placement,
    })
    if (saved) expandSection(timers.sectionOf(saved))
    editing.value = false
  } catch (e) {
    editError.value = errorMessage(e)
  } finally {
    editBusy.value = false
  }
}

async function removeTimer(): Promise<void> {
  deleteBusy.value = true
  deleteError.value = null
  try {
    await timers.deleteTimer(id.value)
    await router.replace({ name: 'list' })
  } catch (e) {
    deleteError.value = errorMessage(e)
  } finally {
    deleteBusy.value = false
  }
}

function startNoteEdit(entry: { id: number; note: string | null }): void {
  noteEditId.value = entry.id
  noteDraft.value = entry.note ?? ''
  entryError.value = null
}

async function saveNote(entryId: number): Promise<void> {
  entryError.value = null
  try {
    if (await timers.editNote(id.value, entryId, noteDraft.value.trim())) noteEditId.value = null
  } catch (e) {
    entryError.value = errorMessage(e)
  }
}

const confirmEntry = computed(() => log.value.find((e) => e.id === confirmEntryId.value) ?? null)

async function removeEntry(): Promise<void> {
  const entryId = confirmEntryId.value
  confirmEntryId.value = null
  if (entryId === null) return
  entryError.value = null
  try {
    await timers.deleteEntry(id.value, entryId)
  } catch (e) {
    entryError.value = errorMessage(e)
  }
}
</script>

<template>
  <section class="space-y-5">
    <RouterLink to="/" class="btn btn-quiet -ml-3">
      <AppIcon name="back" />
      <span>All timers</span>
    </RouterLink>

    <p v-if="loading && !loaded" class="py-8 text-center text-muted">Loading timer…</p>

    <div v-else-if="error" role="alert" class="notice-error space-y-2">
      <p>{{ error }}</p>
      <button type="button" class="btn" @click="load">Retry</button>
    </div>

    <div v-else-if="!timer" class="card space-y-3 p-8 text-center">
      <p class="font-semibold">Timer no longer exists</p>
      <RouterLink to="/" class="btn btn-primary">Back to the list</RouterLink>
    </div>

    <template v-else>
      <header class="space-y-1">
        <h1 class="break-words text-2xl font-bold">{{ timer.name }}</h1>
        <p class="text-4xl font-bold tabular-nums" :class="overdue ? 'text-danger' : ''">
          {{ formatElapsed(elapsedMs) }}
        </p>
        <p v-if="overdue" class="flex items-center gap-1 text-sm font-semibold text-danger">
          <AppIcon name="alert" />
          <span>Overdue by {{ formatElapsed(overdueMs) }}</span>
        </p>
        <p v-if="timer.targetMs !== null" class="text-sm text-muted">
          Target {{ formatElapsed(timer.targetMs) }}
        </p>
      </header>

      <GapGraph
        v-if="timers.logs[timer.id]"
        :entries="timers.logs[timer.id]!"
        :now="timers.now"
        :goal="goal"
      />

      <StatsPanel :stats="timer.stats" />

      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn" @click="openEdit">Rename or change target</button>
        <button type="button" class="btn btn-danger" @click="openDelete">Delete timer</button>
      </div>

      <div class="space-y-2">
        <h2 class="text-lg font-semibold">Log</h2>
        <p v-if="entryError" role="alert" class="notice-error">{{ entryError }}</p>
        <ul class="card divide-y divide-line">
          <li v-for="entry in log" :key="entry.id" class="space-y-1 p-3" data-testid="log-entry">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-medium">
                  {{ formatWhen(entry.at) }}
                  <span v-if="entry.isOrigin" class="text-sm text-muted">(created)</span>
                </p>
                <p
                  v-if="entry.note && noteEditId !== entry.id"
                  class="break-words text-sm text-muted"
                >
                  {{ entry.note }}
                </p>
              </div>
              <div v-if="noteEditId !== entry.id" class="flex shrink-0 gap-1">
                <button
                  type="button"
                  class="btn btn-quiet"
                  :aria-label="`Edit note for ${formatWhen(entry.at)}`"
                  @click="startNoteEdit(entry)"
                >
                  Note
                </button>
                <button
                  v-if="!entry.isOrigin"
                  type="button"
                  class="btn btn-quiet btn-danger"
                  :aria-label="`Delete entry for ${formatWhen(entry.at)}`"
                  @click="confirmEntryId = entry.id"
                >
                  Delete
                </button>
              </div>
            </div>
            <form
              v-if="noteEditId === entry.id"
              class="space-y-2"
              @submit.prevent="saveNote(entry.id)"
            >
              <textarea
                v-model="noteDraft"
                rows="2"
                :maxlength="NOTE_MAX"
                aria-label="Note"
                class="field resize-none"
              />
              <div class="flex justify-end gap-2">
                <button type="button" class="btn btn-quiet" @click="noteEditId = null">
                  Cancel
                </button>
                <button type="submit" class="btn btn-primary">Save note</button>
              </div>
            </form>
          </li>
        </ul>
      </div>

      <ConfirmDialog
        v-if="confirmEntry"
        title="Delete this entry?"
        confirm-label="Delete entry"
        danger
        @confirm="removeEntry"
        @cancel="confirmEntryId = null"
      >
        <p>The reset from {{ formatWhen(confirmEntry.at) }} will be removed from the log.</p>
      </ConfirmDialog>

      <ModalFrame v-if="editing" title="Edit timer" @close="editing = false">
        <TimerForm
          :initial="{ name: timer.name, targetMs: timer.targetMs, placement: timer.placement }"
          :sections="timers.sections"
          :busy="editBusy"
          :error="editError"
          @submit="saveTimer"
          @cancel="editing = false"
        />
      </ModalFrame>

      <ModalFrame
        v-if="confirmingDelete"
        title="Delete this timer?"
        @close="confirmingDelete = false"
      >
        <div class="space-y-4">
          <p>
            "{{ timer.name }}" and its log of {{ timer.stats.resetCount }}
            {{ timer.stats.resetCount === 1 ? 'reset' : 'resets' }} will be deleted. You cannot undo
            this.
          </p>
          <p v-if="deleteError" role="alert" class="notice-error">{{ deleteError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn btn-quiet" @click="confirmingDelete = false">
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-danger"
              :disabled="deleteBusy"
              @click="removeTimer"
            >
              Delete timer
            </button>
          </div>
        </div>
      </ModalFrame>
    </template>
  </section>
</template>
