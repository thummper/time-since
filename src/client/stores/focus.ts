/**
 * Calls `cb` when the window gains focus or the tab becomes visible, but not
 * while the tab is hidden. Returns a function that stops listening.
 */
export function onAppFocus(cb: () => void): () => void {
  const handler = (): void => {
    if (document.visibilityState === 'hidden') return
    cb()
  }
  window.addEventListener('focus', handler)
  document.addEventListener('visibilitychange', handler)
  return () => {
    window.removeEventListener('focus', handler)
    document.removeEventListener('visibilitychange', handler)
  }
}
