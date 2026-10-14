import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import App from '../../src/client/App.vue'
import { createAppRouter, watchSession } from '../../src/client/router.ts'
import { type Route } from './helpers.ts'

export const REAL_USER = { user: { id: 1, email: 'ada@example.com', isDemo: false } }
export const DEMO_USER = { user: { id: 2, email: 'demo-x@demo.invalid', isDemo: true } }

export const meRoute = (user: typeof REAL_USER | null): Route => [
  'GET',
  /^\/api\/auth\/me$/,
  () => (user ? [200, user] : [401, { error: 'Not logged in' }]),
]

const mounted: Array<{ unmount: () => void }> = []

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
})

/** Mounts the whole app at `path` with a memory router and a fresh Pinia. */
export async function mountApp(path: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createAppRouter(createMemoryHistory())
  watchSession(router)
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [pinia, router] } })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}
