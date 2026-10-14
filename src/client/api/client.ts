/** A non-2xx response, or `status` 0 when the request never reached the server. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

let onUnauthorized: (() => void) | null = null

/** Runs when a request other than login or session lookup gets a 401. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

export interface RequestOptions {
  /** Do not treat a 401 as an expired session (login, register, session lookup). */
  anonymous?: boolean
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server')
  }
  if (!response.ok) {
    let message = response.statusText
    try {
      const data = (await response.json()) as { error?: unknown }
      if (typeof data.error === 'string') message = data.error
    } catch {
      // The body was not JSON. The status text stays.
    }
    if (response.status === 401 && !options.anonymous) onUnauthorized?.()
    throw new ApiError(response.status, message)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body ?? {}, options),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
}

/** A plain-language message for the user (R5 caps, rate limits, network loss). */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Try again.'
  if (error.status === 0) return 'Cannot reach the server. Check your connection and try again.'
  if (error.status === 429) return 'Too many requests. Wait a few minutes and try again.'
  if (
    error.status === 400 ||
    error.status === 401 ||
    error.status === 403 ||
    error.status === 409 ||
    error.status === 422
  )
    return error.message
  if (error.status === 404) return 'That no longer exists.'
  return 'Something went wrong. Try again.'
}
