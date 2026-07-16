const RECOVERY_KEY = 'grade-journal-stale-reload'

export function isStaleAssetError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? '')
  return /ChunkLoadError|Loading chunk [^ ]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message)
}

export function cacheBustedUrl(currentUrl: string, timestamp = Date.now()): string {
  const url = new URL(currentUrl)
  url.searchParams.set('app-refresh', String(timestamp))
  return url.toString()
}

export function reloadLatestVersion(): void {
  try { window.sessionStorage.removeItem(RECOVERY_KEY) } catch { /* Storage may be unavailable. */ }
  window.location.replace(cacheBustedUrl(window.location.href))
}

export function recoverStaleDeployment(): boolean {
  const currentUrl = new URL(window.location.href)
  if (currentUrl.searchParams.has('app-refresh')) return false
  try {
    if (window.sessionStorage.getItem(RECOVERY_KEY)) return false
    window.sessionStorage.setItem(RECOVERY_KEY, '1')
  } catch {
    // Continue with one best-effort reload when session storage is unavailable.
  }
  window.location.replace(cacheBustedUrl(window.location.href))
  return true
}

export function installDeploymentRecovery(): () => void {
  const onPreloadError = (event: Event) => {
    event.preventDefault()
    recoverStaleDeployment()
  }
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (!isStaleAssetError(event.reason)) return
    event.preventDefault()
    recoverStaleDeployment()
  }
  window.addEventListener('vite:preloadError', onPreloadError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  const healthyTimer = window.setTimeout(() => {
    try { window.sessionStorage.removeItem(RECOVERY_KEY) } catch { /* Storage may be unavailable. */ }
    const url = new URL(window.location.href)
    if (!url.searchParams.has('app-refresh')) return
    url.searchParams.delete('app-refresh')
    window.history.replaceState(window.history.state, '', url)
  }, 5_000)
  return () => {
    window.clearTimeout(healthyTimer)
    window.removeEventListener('vite:preloadError', onPreloadError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}
