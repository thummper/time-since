// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  currentEndpoint,
  resyncSubscription,
  subscribePush,
  unsubscribePush,
} from '../../src/client/push/subscribe.ts'
import { installFetch, type Route } from './helpers.ts'
import { ENDPOINT, fakeSubscription, installPush, KEY_B64, removePush } from './pushHelpers.ts'

afterEach(removePush)

const keyRoute: Route = ['GET', /^\/api\/push\/key$/, () => [200, { publicKey: KEY_B64 }]]
const subscribeRoute: Route = ['POST', /^\/api\/push\/subscribe$/, () => [201, { ok: true }]]
const unsubscribeRoute: Route = ['POST', /^\/api\/push\/unsubscribe$/, () => [200, { ok: true }]]

describe('subscribePush', () => {
  it('posts the endpoint and keys after permission is granted', async () => {
    const push = installPush('granted')
    const { calls } = installFetch([keyRoute, subscribeRoute])
    expect(await subscribePush()).toBe('subscribed')
    expect(push.requestPermission).toHaveBeenCalledOnce()
    expect(push.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      }),
    )
    const post = calls.find((c) => c.path === '/api/push/subscribe')!
    expect(post.body).toEqual({ endpoint: ENDPOINT, keys: { p256dh: 'p256', auth: 'auth' } })
  })

  it('does nothing when permission is denied', async () => {
    const push = installPush('denied')
    const { calls } = installFetch([keyRoute, subscribeRoute])
    expect(await subscribePush()).toBe('denied')
    expect(push.subscribe).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('reports unsupported when the browser has no push', async () => {
    const { calls } = installFetch([keyRoute, subscribeRoute])
    expect(await subscribePush()).toBe('unsupported')
    expect(calls).toEqual([])
  })

  it('removes the browser subscription when the server rejects it', async () => {
    const push = installPush('granted')
    installFetch([keyRoute, ['POST', /^\/api\/push\/subscribe$/, () => [503, { error: 'x' }]]])
    await expect(subscribePush()).rejects.toThrow()
    expect(push.subscription!.unsubscribe).toHaveBeenCalled()
  })
})

describe('unsubscribePush and currentEndpoint', () => {
  it('tells the server and the browser', async () => {
    const sub = fakeSubscription()
    installPush('granted', sub)
    const { calls } = installFetch([unsubscribeRoute])
    expect(await currentEndpoint()).toBe(ENDPOINT)
    await unsubscribePush()
    expect(calls[0]).toMatchObject({ path: '/api/push/unsubscribe', body: { endpoint: ENDPOINT } })
    expect(sub.unsubscribe).toHaveBeenCalled()
  })

  it('returns null without support', async () => {
    expect(await currentEndpoint()).toBeNull()
  })
})

describe('resyncSubscription', () => {
  it('re-posts an existing subscription when permission is granted', async () => {
    installPush('granted', fakeSubscription())
    const { calls } = installFetch([subscribeRoute])
    await resyncSubscription()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.body).toMatchObject({ endpoint: ENDPOINT })
  })

  it('does nothing without a subscription', async () => {
    installPush('granted', null)
    const { calls } = installFetch([subscribeRoute])
    await resyncSubscription()
    expect(calls).toEqual([])
  })

  it('does nothing without permission', async () => {
    installPush('default', fakeSubscription())
    const { calls } = installFetch([subscribeRoute])
    await resyncSubscription()
    expect(calls).toEqual([])
  })
})
