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

/** Status bar colors. They match --bg in style.css and the theme-color tags in index.html. */
export const THEME_COLORS = { light: '#f3f1fa', dark: '#121320' } as const

function apply(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') delete root.dataset.theme
  else root.dataset.theme = choice
  // index.html has one theme-color tag per system scheme. A fixed choice sets both to its color,
  // and System gives each tag back the color of its own scheme.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.getAttribute('media')?.includes('dark') ? 'dark' : 'light'
    meta.content = THEME_COLORS[choice === 'system' ? scheme : choice]
  }
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
