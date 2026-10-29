import type { Context } from 'hono'

/** The JSON body as a plain object. A bad, missing, array or non-object body reads as `{}`. */
export async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json()
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** A route id: 1 to 15 digits. Anything else is null. */
export function parseId(value: string | undefined): number | null {
  return value !== undefined && /^\d{1,15}$/.test(value) ? Number(value) : null
}
