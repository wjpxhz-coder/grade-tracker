/**
 * Removes data the app can safely recreate locally. User records and browser
 * preferences live elsewhere, so this deliberately does not touch localStorage.
 */
export async function clearWebsiteCache(): Promise<void> {
  try {
    window.sessionStorage.clear()
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }

  if (typeof window === 'undefined' || !('caches' in window)) return

  try {
    const cacheNames = await window.caches.keys()
    await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)))
  } catch {
    // Cache Storage is optional and can be disabled by the browser.
  }
}
