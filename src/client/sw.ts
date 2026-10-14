/// <reference lib="webworker" />
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>
}

interface PushData {
  title?: string
  body?: string
  url?: string
}

// The app shell is precached. Nothing under /api is ever cached: no route matches it.
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }),
)

// The page asks for the update through the prompt (registerType 'prompt').
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting()
})

self.addEventListener('push', (event) => {
  let data: PushData
  try {
    data = (event.data?.json() ?? {}) as PushData
  } catch {
    data = { body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Time Since', {
      body: data.body,
      icon: '/icons/icon-192.png',
      data: { url: data.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(
    (event.notification.data as { url?: string } | null)?.url ?? '/',
    self.location.origin,
  ).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (open) {
        await open.focus()
        if (open.url !== url) await open.navigate(url)
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})

self.addEventListener('pushsubscriptionchange', (event) => {
  const change = event as ExtendableEvent & {
    oldSubscription?: PushSubscription | null
    newSubscription?: PushSubscription | null
  }
  change.waitUntil(
    (async () => {
      const oldEndpoint = change.oldSubscription?.endpoint
      const subscription =
        change.newSubscription ??
        (oldEndpoint && change.oldSubscription?.options.applicationServerKey
          ? await self.registration.pushManager.subscribe(change.oldSubscription.options)
          : null)
      if (!oldEndpoint || !subscription) return
      await fetch('/api/push/resubscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ oldEndpoint, subscription: subscription.toJSON() }),
      })
    })(),
  )
})
