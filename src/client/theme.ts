import { readonly, ref } from 'vue'

export type ThemeChoice = 'system' | 'light' | 'dark'

/** Also read by the inline script in index.html, so the first paint has the right colors. */
export const THEME_KEY = 'time-since:theme'

function read(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

function apply(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') delete root.dataset.theme
  else root.dataset.theme = choice
}

const current = ref<ThemeChoice>(read())

/** Applies the saved choice. Call once before the app mounts. */
export function initTheme(): void {
  current.value = read()
  apply(current.value)
}

export function useTheme() {
  function setTheme(choice: ThemeChoice): void {
    current.value = choice
    apply(choice)
    try {
      if (choice === 'system') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, choice)
    } catch {
      // Storage is blocked: the choice holds for this visit only.
    }
  }
  return { theme: readonly(current), setTheme }
}
