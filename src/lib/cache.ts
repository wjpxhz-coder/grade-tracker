import { invalidateAvatarCache } from './avatarCache'

/**
 * Removes data the app can safely recreate locally. User records and browser
 * preferences live elsewhere.
 */
export async function clearWebsiteCache(): Promise<void> {
  try {
    window.sessionStorage.clear()
    invalidateAvatarCache()
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }

  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cacheNames = await window.caches.keys()
      await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)))
    } catch {
      // Cache Storage is optional and can be disabled by the browser.
    }
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    } catch {
      // Service Worker API can be restricted.
    }
  }
}

