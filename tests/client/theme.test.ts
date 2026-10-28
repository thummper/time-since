// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initTheme, THEME_COLORS, THEME_KEY, useTheme } from '../../src/client/theme.ts'
import { installFetch, listRoute } from './helpers.ts'
import { meRoute, mountApp, REAL_USER } from './mountApp.ts'

afterEach(() => {
  useTheme().setTheme('system')
  localStorage.clear()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const root = () => document.documentElement

describe('theme', () => {
  it('follows the system by default, with no data-theme attribute', () => {
    initTheme()
    expect(useTheme().theme.value).toBe('system')
    expect(root().dataset.theme).toBeUndefined()
  })

  it('applies and saves a chosen theme, and System clears it', () => {
    const { theme, setTheme } = useTheme()
    setTheme('dark')
    expect(theme.value).toBe('dark')
    expect(root().dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    setTheme('system')
    expect(root().dataset.theme).toBeUndefined()
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('sets the status bar color to match the chosen theme', () => {
    document.head.innerHTML =
      '<meta name="theme-color" media="(prefers-color-scheme: light)">' +
      '<meta name="theme-color" media="(prefers-color-scheme: dark)">'
    const colors = () =>
      [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => m.content)
    const { setTheme } = useTheme()
    setTheme('dark')
    expect(colors()).toEqual([THEME_COLORS.dark, THEME_COLORS.dark])
    setTheme('light')
    expect(colors()).toEqual([THEME_COLORS.light, THEME_COLORS.light])
    setTheme('system')
    expect(colors()).toEqual([THEME_COLORS.light, THEME_COLORS.dark])
    document.head.innerHTML = ''
  })

  it('restores the saved choice on start and ignores unknown values', () => {
    localStorage.setItem(THEME_KEY, 'light')
    initTheme()
    expect(root().dataset.theme).toBe('light')
    localStorage.setItem(THEME_KEY, 'neon')
    initTheme()
    expect(root().dataset.theme).toBeUndefined()
  })
})

describe('Settings appearance switch', () => {
  it('switches the theme from the Settings page', async () => {
    installFetch([meRoute(REAL_USER), listRoute()])
    const { wrapper } = await mountApp('/settings')
    const group = wrapper.find('[data-testid="theme-switch"]')
    expect(group.find<HTMLInputElement>('input[value="system"]').element.checked).toBe(true)
    await group.find('input[value="dark"]').setValue(true)
    expect(root().dataset.theme).toBe('dark')
    await group.find('input[value="light"]').setValue(true)
    expect(root().dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
  })
})
