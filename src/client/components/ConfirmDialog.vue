<script setup lang="ts">
import ModalFrame from './ModalFrame.vue'

defineProps<{
  title: string
  confirmLabel: string
  /** Shows the confirm button in the danger style, for actions that remove data. */
  danger?: boolean
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <ModalFrame :title="title" @close="emit('cancel')">
    <div class="space-y-4">
      <slot />
      <div class="flex justify-end gap-2">
        <button type="button" class="btn btn-quiet" @click="emit('cancel')">Cancel</button>
        <button
          type="button"
          class="btn"
          :class="danger ? 'btn-danger' : 'btn-primary'"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </ModalFrame>
</template>
