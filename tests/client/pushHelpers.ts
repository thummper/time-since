import { vi } from 'vitest'

export const ENDPOINT = 'https://push.example.com/send/abc'
export const KEY_B64 = 'BEl62iUYgUivxIkv69yViEuiBIa-ib37J8xQmvuqF6Q'

export function fakeSubscription(endpoint = ENDPOINT) {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256', auth: 'auth' } }),
    unsubscribe: vi.fn(async () => true),
  }
}

export interface FakePush {
  subscription: ReturnType<typeof fakeSubscription> | null
  subscribe: ReturnType<typeof vi.fn>
  getSubscription: ReturnType<typeof vi.fn>
  requestPermission: ReturnType<typeof vi.fn>
}

/** Installs a fake service worker, PushManager, and Notification. */
export function installPush(
  permission: NotificationPermission,
  existing: ReturnType<typeof fakeSubscription> | null = null,
): FakePush {
  const state: FakePush = {
    subscription: existing,
    subscribe: vi.fn(async () => {
      state.subscription = fakeSubscription()
      return state.subscription
    }),
    getSubscription: vi.fn(async () => state.subscription),
    requestPermission: vi.fn(async () => permission),
  }
  const notification = Object.assign(function () {}, {
    permission,
    requestPermission: state.requestPermission,
  })
  vi.stubGlobal('Notification', notification)
  vi.stubGlobal('PushManager', function () {})
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: async () => ({
        pushManager: { getSubscription: state.getSubscription, subscribe: state.subscribe },
      }),
    },
  })
  return state
}

export function removePush(): void {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  vi.unstubAllGlobals()
}
