import { api } from '../api/client.ts'

export type PushPermission = 'unsupported' | NotificationPermission
export type SubscribeResult = 'subscribed' | 'denied' | 'unsupported'

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in globalThis &&
    'Notification' in globalThis
  )
}

export function pushPermission(): PushPermission {
  return pushSupported() ? Notification.permission : 'unsupported'
}

/** Converts the base64url VAPID key into the bytes `PushManager.subscribe` needs. */
function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64Url.length / 4) * 4, '=')
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** The active worker registration. Unlike `ready`, it never waits when none exists (dev mode). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

async function existingSubscription(): Promise<PushSubscription | null> {
  return (await (await registration())?.pushManager.getSubscription()) ?? null
}

/** The push endpoint of this browser, or null when it has none. */
export async function currentEndpoint(): Promise<string | null> {
  try {
    return (await existingSubscription())?.endpoint ?? null
  } catch {
    return null
  }
}

/**
 * Asks for permission, subscribes this browser, and registers it with the server.
 * Call it only from a user gesture.
 */
export async function subscribePush(): Promise<SubscribeResult> {
  const worker = await registration()
  if (!worker) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const { publicKey } = await api.get<{ publicKey: string }>('/api/push/key')
  const subscription =
    (await worker.pushManager.getSubscription()) ??
    (await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }))
  try {
    await api.post('/api/push/subscribe', subscription.toJSON())
  } catch (error) {
    await subscription.unsubscribe().catch(() => false)
    throw error
  }
  return 'subscribed'
}

/** Removes this browser's subscription from the server and the browser. */
export async function unsubscribePush(): Promise<void> {
  const subscription = await existingSubscription()
  if (!subscription) return
  try {
    await api.post('/api/push/unsubscribe', { endpoint: subscription.endpoint })
  } finally {
    await subscription.unsubscribe().catch(() => false)
  }
}

/** Drops the browser subscription only (after the server deleted its row). */
export async function dropBrowserSubscription(): Promise<void> {
  try {
    await (await existingSubscription())?.unsubscribe()
  } catch {
    // The browser had nothing to drop.
  }
}

/** After login: hands an existing subscription to the new user (KTD11). Never throws. */
export async function resyncSubscription(): Promise<void> {
  try {
    if (pushPermission() !== 'granted') return
    const subscription = await existingSubscription()
    if (subscription) await api.post('/api/push/subscribe', subscription.toJSON())
  } catch {
    // Alerts stay off for this device until the user opens Settings.
  }
}
