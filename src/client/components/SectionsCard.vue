<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NAME_MAX } from '../../shared/limits.ts'
import { compareSections } from '../../shared/sections.ts'
import type { SectionView } from '../../shared/types.ts'
import { errorMessage } from '../api/client.ts'
import { useTimersStore } from '../stores/timers.ts'
import ConfirmDialog from './ConfirmDialog.vue'

const timers = useTimersStore()

const sorted = computed(() => [...timers.sections].sort(compareSections))

/** The section being renamed, with the draft name. */
const editingId = ref<number | null>(null)
const draft = ref('')
const busy = ref(false)
const problem = ref<string | null>(null)
const confirmDelete = ref<SectionView | null>(null)
const deleteError = ref<string | null>(null)

// KTD6: sections arrive with the timers list, so load it when Settings opens first.
onMounted(() => {
  if (timers.status === 'idle' || timers.status === 'error') void timers.fetchTimers()
})

function startRename(section: SectionView): void {
  editingId.value = section.id
  draft.value = section.name
  problem.value = null
}

function stopRename(): void {
  editingId.value = null
  problem.value = null
}

async function saveRename(): Promise<void> {
  const id = editingId.value
  const name = draft.value.trim()
  if (id === null) return
  if (name.length < 1 || name.length > NAME_MAX) {
    problem.value = `Name must be 1 to ${NAME_MAX} characters.`
    return
  }
  busy.value = true
  try {
    await timers.renameSection(id, name)
    stopRename()
  } catch (e) {
    problem.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

async function remove(): Promise<void> {
  const section = confirmDelete.value
  confirmDelete.value = null
  if (!section) return
  deleteError.value = null
  try {
    await timers.deleteSection(section.id)
  } catch (e) {
    deleteError.value = errorMessage(e)
  }
}
</script>

<template>
  <div class="card space-y-3 p-4" data-testid="sections-card">
    <h2 class="font-semibold">Sections</h2>
    <p v-if="timers.status === 'ready' && sorted.length === 0" class="text-sm text-muted">
      Make a section from the Section field when you add or edit a timer. Pick "New section…".
    </p>
    <ul v-else class="divide-y divide-line">
      <li v-for="section in sorted" :key="section.id" class="py-2">
        <form
          v-if="editingId === section.id"
          class="space-y-2"
          novalidate
          @submit.prevent="saveRename"
        >
          <input
            v-model="draft"
            name="sectionName"
            type="text"
            :maxlength="NAME_MAX"
            autocomplete="off"
            :aria-label="`New name for ${section.name}`"
            class="field"
          />
          <p v-if="problem" role="alert" class="notice-error">{{ problem }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn btn-quiet" @click="stopRename">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="busy">Save</button>
          </div>
        </form>
        <div v-else class="flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate" data-testid="section-name">{{ section.name }}</span>
          <button
            type="button"
            class="btn btn-quiet"
            :aria-label="`Rename ${section.name}`"
            @click="startRename(section)"
          >
            Rename
          </button>
          <button
            type="button"
            class="btn btn-quiet btn-danger"
            :aria-label="`Delete ${section.name}`"
            @click="confirmDelete = section"
          >
            Delete
          </button>
        </div>
      </li>
    </ul>
    <p v-if="deleteError" role="alert" class="notice-error">{{ deleteError }}</p>

    <ConfirmDialog
      v-if="confirmDelete"
      :title="`Delete ${confirmDelete.name}?`"
      confirm-label="Delete section"
      danger
      @confirm="remove"
      @cancel="confirmDelete = null"
    >
      <p>Its timers go back to automatic placement. No timer is deleted.</p>
    </ConfirmDialog>
  </div>
</template>
