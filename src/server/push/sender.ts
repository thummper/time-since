import webpush from 'web-push'

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushPayload {
  title: string
  body: string
  url: string
}

/**
 * Sends one push message. Resolves with the push service HTTP status, or
 * null on a network error. It never throws for a delivery failure.
 */
export interface PushSender {
  send(target: PushTarget, payload: PushPayload): Promise<number | null>
}

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

const TTL_SECONDS = 24 * 60 * 60
/** Longest wait for one push service answer. A timeout counts as a temporary failure. */
export const SEND_TIMEOUT_MS = 10_000

export function createWebPushSender(vapid: VapidConfig): PushSender {
  return {
    async send(target, payload) {
      try {
        const res = await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(payload),
          {
            TTL: TTL_SECONDS,
            urgency: 'high',
            timeout: SEND_TIMEOUT_MS,
            vapidDetails: {
              subject: vapid.subject,
              publicKey: vapid.publicKey,
              privateKey: vapid.privateKey,
            },
          },
        )
        return res.statusCode
      } catch (error) {
        const status = (error as { statusCode?: unknown }).statusCode
        return typeof status === 'number' ? status : null
      }
    },
  }
}
