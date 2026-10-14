<script setup lang="ts">
import { useToastsStore } from '../stores/toasts.ts'
import UndoToast from './UndoToast.vue'

const toasts = useToastsStore()
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-xl flex-col gap-2 p-4"
  >
    <UndoToast
      v-for="toast in toasts.toasts"
      :key="toast.id"
      :toast="toast"
      @close="toasts.dismiss(toast.id)"
    />
  </div>
</template>
