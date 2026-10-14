import { beforeEach, describe, expect, it, vi } from 'vitest'

// A plain function, not vi.fn(): vitest flags a mock that rejects with an error carrying extra fields.
type Send = (...args: unknown[]) => Promise<unknown>
const fake = vi.hoisted(() => ({ impl: null as unknown, calls: [] as unknown[][] }))
vi.mock('web-push', () => ({
  default: {
    sendNotification: (...args: unknown[]) => {
      fake.calls.push(args)
      return (fake.impl as Send)(...args)
    },
  },
}))
const resolveWith = (value: unknown) => void (fake.impl = () => Promise.resolve(value))
const rejectWith = (error: unknown) => void (fake.impl = () => Promise.reject(error))

import { createWebPushSender, SEND_TIMEOUT_MS } from '../../src/server/push/sender.ts'

const vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:a@example.com' }
const target = { endpoint: 'https://fcm.googleapis.com/x', p256dh: 'key', auth: 'auth' }
const payload = { title: 'T', body: 'B', url: '/timers/1' }

class FakePushError extends Error {
  constructor(readonly statusCode: number) {
    super('push failed')
  }
}

beforeEach(() => {
  fake.calls = []
})

describe('createWebPushSender', () => {
  it('maps a 201 answer to 201', async () => {
    resolveWith({ statusCode: 201 })
    expect(await createWebPushSender(vapid).send(target, payload)).toBe(201)
  })

  it('maps a push service error to its status code', async () => {
    rejectWith(new FakePushError(410))
    expect(await createWebPushSender(vapid).send(target, payload)).toBe(410)
  })

  it('maps a network or timeout error to null', async () => {
    rejectWith(new Error('socket hang up'))
    expect(await createWebPushSender(vapid).send(target, payload)).toBeNull()
    rejectWith(Object.assign(new Error('timeout'), { code: 'ECONNRESET' }))
    expect(await createWebPushSender(vapid).send(target, payload)).toBeNull()
  })

  it('sends a JSON payload with TTL, VAPID details and a request timeout', async () => {
    resolveWith({ statusCode: 201 })
    await createWebPushSender(vapid).send(target, payload)
    const [subscription, body, options] = fake.calls[0]!
    expect(subscription).toEqual({
      endpoint: target.endpoint,
      keys: { p256dh: 'key', auth: 'auth' },
    })
    expect(JSON.parse(body as string)).toEqual(payload)
    expect(options).toMatchObject({
      TTL: 86_400,
      vapidDetails: { subject: vapid.subject, publicKey: 'pub', privateKey: 'priv' },
      timeout: 10_000,
    })
    expect(SEND_TIMEOUT_MS).toBe(10_000)
  })
})
