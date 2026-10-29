import { ref } from 'vue'

/** KTD9: the collapsed section keys on this device. */
export const COLLAPSED_KEY = 'time-since:collapsed-sections'

function read(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]')
    return new Set(Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

function write(keys: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...keys]))
  } catch {
    // Storage can be full or blocked; the state still holds until the page closes.
  }
}

/** Opens a section from anywhere, so a timer saved into it shows (R15). */
export function expandSection(key: string): void {
  const keys = read()
  if (keys.delete(key)) write(keys)
}

/** Collapsed state for the list page (R13). Reads storage once, when the page sets up. */
export function useCollapsed() {
  const keys = ref(read())

  function update(change: (next: Set<string>) => void): void {
    const next = new Set(keys.value)
    change(next)
    keys.value = next
    write(next)
  }

  return {
    isCollapsed: (key: string) => keys.value.has(key),
    toggle: (key: string) =>
      update((next) => {
        if (!next.delete(key)) next.add(key)
      }),
    expand: (key: string) => update((next) => next.delete(key)),
  }
}
