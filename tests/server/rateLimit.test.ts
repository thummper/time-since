import { afterEach, describe, expect, it } from 'vitest'
import type { Db } from '../../src/server/db/client.ts'
import { creds, makeApp, post } from './authHelpers.ts'

let db: Db | undefined
afterEach(() => db?.$client.close())

function setup(options: Parameters<typeof makeApp>[0] = {}) {
  const made = makeApp(options)
  db = made.db
  return made.app
}

const socket = (address: string) => ({ incoming: { socket: { remoteAddress: address } } })
const login = (
  app: ReturnType<typeof setup>,
  n: number,
  headers: Record<string, string> = {},
  env?: unknown,
) => post(app, '/api/auth/login', creds(`user${n}@example.com`, 'wrong password'), headers, env)

describe('rate limits', () => {
  it('returns 429 on the 11th login attempt within 15 minutes from one IP', async () => {
    const app = setup()
    for (let n = 1; n <= 10; n++) expect((await login(app, n)).status).toBe(401)
    expect((await login(app, 11)).status).toBe(429)
  })

  it('limits login attempts per email even from different IPs', async () => {
    const app = setup()
    for (let n = 1; n <= 10; n++) {
      const res = await post(app, '/api/auth/login', creds('same@example.com', 'wrong password'), {
        'cf-connecting-ip': `10.0.0.${n}`,
      })
      expect(res.status).toBe(401)
    }
    const res = await post(app, '/api/auth/login', creds('SAME@example.com', 'wrong password'), {
      'cf-connecting-ip': '10.0.0.99',
    })
    expect(res.status).toBe(429)
  })

  it('returns 429 on the 6th registration within an hour from one IP', async () => {
    const app = setup()
    for (let n = 1; n <= 5; n++) {
      expect((await post(app, '/api/auth/register', creds(`r${n}@example.com`))).status).toBe(201)
    }
    expect((await post(app, '/api/auth/register', creds('r6@example.com'))).status).toBe(429)
  })

  it('ignores X-Forwarded-For but keys on CF-Connecting-IP', async () => {
    const app = setup({ limits: { registerPerHour: 5, loginPerWindow: 1 } })
    expect((await login(app, 1, { 'cf-connecting-ip': '1.1.1.1' })).status).toBe(401)
    expect(
      (await login(app, 2, { 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' })).status,
    ).toBe(429)
    expect((await login(app, 3, { 'cf-connecting-ip': '3.3.3.3' })).status).toBe(401)
  })

  it('keys on the socket remote address when CF-Connecting-IP is missing', async () => {
    const app = setup({ limits: { registerPerHour: 5, loginPerWindow: 1 } })
    expect((await login(app, 1, {}, socket('7.7.7.7'))).status).toBe(401)
    expect((await login(app, 2, { 'x-forwarded-for': '8.8.8.8' }, socket('7.7.7.7'))).status).toBe(
      429,
    )
    expect((await login(app, 3, {}, socket('9.9.9.9'))).status).toBe(401)
  })
})
