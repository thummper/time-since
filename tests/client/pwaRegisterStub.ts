import { ref } from 'vue'

/** Test stand-in for the virtual `virtual:pwa-register/vue` module. */
export function useRegisterSW() {
  return {
    needRefresh: ref(false),
    offlineReady: ref(false),
    updateServiceWorker: async () => {},
  }
}
