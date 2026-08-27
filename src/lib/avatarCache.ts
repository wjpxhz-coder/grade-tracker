const AVATAR_CACHE_KEY = 'grade_tracker_avatar_urls_v1'
const EXPIRATION_BUFFER_MS = 5 * 60 * 1000

interface CachedAvatarEntry {
  url: string
  expiresAt: number
}

type AvatarCacheStore = Record<string, CachedAvatarEntry>

function getStore(): AvatarCacheStore {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  try {
    const raw = window.localStorage.getItem(AVATAR_CACHE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as AvatarCacheStore
  } catch {
    return {}
  }
}

function saveStore(store: AvatarCacheStore): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(store))
  } catch {
    // Handle LocalStorage write limits or private mode restrictions safely.
  }
}

export function getCachedAvatarUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  const store = getStore()
  const entry = store[path]
  if (!entry) return undefined

  if (typeof entry.expiresAt !== 'number' || entry.expiresAt <= Date.now() + EXPIRATION_BUFFER_MS) {
    delete store[path]
    saveStore(store)
    return undefined
  }

  return entry.url
}

export function setCachedAvatarUrl(
  path: string,
  url: string,
  expiresInSeconds: number = 3600,
): void {
  if (!path || !url) return
  const store = getStore()
  store[path] = {
    url,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  }
  saveStore(store)
}

export function invalidateAvatarCache(path?: string | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  if (!path) {
    try {
      window.localStorage.removeItem(AVATAR_CACHE_KEY)
    } catch {
      // Ignore storage errors.
    }
    return
  }

  const store = getStore()
  if (path in store) {
    delete store[path]
    saveStore(store)
  }
}

export function preloadImage(url: string | null | undefined): void {
  if (!url || typeof window === 'undefined') return
  try {
    const img = new Image()
    img.src = url
  } catch {
    // Non-blocking preload.
  }
}
