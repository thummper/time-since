import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '../api/client.ts'
import { currentEndpoint, dropBrowserSubscription, resyncSubscription } from '../push/subscribe.ts'
import { useTimersStore } from './timers.ts'
import { useToastsStore } from './toasts.ts'

export interface SessionUser {
  id: number
  email: string
  isDemo: boolean
}

interface UserReply {
  user: { id: number; email: string; isDemo?: boolean }
}

/** Drops the previous user's data. */
function forgetData(): void {
  useTimersStore().clear()
  useToastsStore().toasts = []
}

function toUser(reply: UserReply): SessionUser {
  return { id: reply.user.id, email: reply.user.email, isDemo: reply.user.isDemo ?? false }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<SessionUser | null>(null)
  const loaded = ref(false)
  /** True after a demo session ended server-side; the welcome page says "Demo expired". */
  const demoExpired = ref(false)

  let loading: Promise<void> | null = null

  /** Looks up the current session once. Later calls reuse the answer. */
  function load(): Promise<void> {
    if (loaded.value) return Promise.resolve()
    loading ??= api
      .get<UserReply>('/api/auth/me', { anonymous: true })
      .then((reply) => {
        user.value = toUser(reply)
      })
      .catch((error: unknown) => {
        if (!(error instanceof ApiError)) throw error
        user.value = null
      })
      .finally(() => {
        loaded.value = true
        loading = null
      })
    return loading
  }

  function accept(reply: UserReply): void {
    forgetData()
    user.value = toUser(reply)
    demoExpired.value = false
    loaded.value = true
  }

  async function login(email: string, password: string): Promise<void> {
    accept(await api.post<UserReply>('/api/auth/login', { email, password }, { anonymous: true }))
    void resyncSubscription()
  }

  async function register(email: string, password: string): Promise<void> {
    accept(
      await api.post<UserReply>('/api/auth/register', { email, password }, { anonymous: true }),
    )
    void resyncSubscription()
  }

  async function startDemo(): Promise<void> {
    accept(await api.post<UserReply>('/api/demo', {}, { anonymous: true }))
  }

  async function logout(): Promise<void> {
    const endpoint = await currentEndpoint()
    try {
      await api.post('/api/auth/logout', endpoint ? { endpoint } : {}, { anonymous: true })
    } finally {
      user.value = null
      forgetData()
      void dropBrowserSubscription()
    }
  }

  /** A request got 401: the session is gone. */
  function expire(): void {
    demoExpired.value = user.value?.isDemo ?? false
    user.value = null
    forgetData()
  }

  return { user, loaded, demoExpired, load, login, register, startDemo, logout, expire }
})
