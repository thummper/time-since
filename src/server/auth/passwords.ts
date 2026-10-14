import { hash, verify } from '@node-rs/argon2'

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 256

// @node-rs/argon2 defaults to argon2id.
export const hashPassword = (password: string): Promise<string> => hash(password)

let dummyHash: Promise<string> | undefined

/**
 * Verifies a password. A null hash (demo user) or unknown account fails like a
 * wrong password, and still spends one hash's worth of time.
 */
export async function verifyPassword(
  storedHash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (!storedHash) {
    dummyHash ??= hash('time-since-dummy-password')
    await verify(await dummyHash, password).catch(() => false)
    return false
  }
  try {
    return await verify(storedHash, password)
  } catch {
    return false
  }
}
