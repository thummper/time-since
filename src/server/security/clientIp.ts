import type { Context } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'

/**
 * Client IP for rate-limit keys (KTD7). Only CF-Connecting-IP is trusted;
 * X-Forwarded-For and friends are ignored because clients can fake them.
 * Without that header (local dev, tests) the socket remote address is used.
 */
export function getClientIp(c: Context): string {
  const cf = c.req.header('cf-connecting-ip')?.trim()
  if (cf) return cf
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
