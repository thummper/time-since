<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue'

const { needRefresh, updateServiceWorker } = useRegisterSW()
</script>

<template>
  <div
    v-if="needRefresh"
    class="card fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl items-center justify-between gap-3 p-3"
    role="status"
    data-testid="update-prompt"
  >
    <span>Update available</span>
    <button type="button" class="btn btn-primary" @click="updateServiceWorker(true)">Reload</button>
  </div>
</template>
