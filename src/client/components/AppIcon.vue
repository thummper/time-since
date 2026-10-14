<script setup lang="ts">
type IconName = 'alert' | 'dots' | 'gear' | 'plus' | 'reset' | 'back'

defineProps<{ name: IconName }>()

const paths: Record<IconName, string> = {
  alert: 'M12 3 2 20h20L12 3Zm0 6v5m0 3v.01',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7.5 7.5 0 0 0-2-1.2L14.6 3h-4l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7.5 7.5 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z',
  plus: 'M12 5v14M5 12h14',
  reset: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5',
  back: 'M15 5l-7 7 7 7',
}
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="paths[name]" />
  </svg>
</template>
