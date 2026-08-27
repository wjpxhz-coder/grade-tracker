import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCachedAvatarUrl,
  invalidateAvatarCache,
  preloadImage,
  setCachedAvatarUrl,
} from './avatarCache'

describe('avatarCache', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('stores and retrieves cached avatar url within validity window', () => {
    setCachedAvatarUrl('user1/avatar.webp', 'https://example.com/avatar1.webp', 3600)
    expect(getCachedAvatarUrl('user1/avatar.webp')).toBe('https://example.com/avatar1.webp')
  })

  it('returns undefined and cleans up when the cached url is expired or close to expiry', () => {
    // 3 minutes remaining is less than the 5 minute buffer
    setCachedAvatarUrl('user1/avatar.webp', 'https://example.com/avatar1.webp', 180)
    expect(getCachedAvatarUrl('user1/avatar.webp')).toBeUndefined()
  })

  it('invalidates a specific path', () => {
    setCachedAvatarUrl('user1/avatar.webp', 'https://example.com/avatar1.webp', 3600)
    setCachedAvatarUrl('user2/avatar.webp', 'https://example.com/avatar2.webp', 3600)

    invalidateAvatarCache('user1/avatar.webp')

    expect(getCachedAvatarUrl('user1/avatar.webp')).toBeUndefined()
    expect(getCachedAvatarUrl('user2/avatar.webp')).toBe('https://example.com/avatar2.webp')
  })

  it('invalidates the entire cache when no path is given', () => {
    setCachedAvatarUrl('user1/avatar.webp', 'https://example.com/avatar1.webp', 3600)
    setCachedAvatarUrl('user2/avatar.webp', 'https://example.com/avatar2.webp', 3600)

    invalidateAvatarCache()

    expect(getCachedAvatarUrl('user1/avatar.webp')).toBeUndefined()
    expect(getCachedAvatarUrl('user2/avatar.webp')).toBeUndefined()
  })

  it('gracefully handles empty path or missing entry', () => {
    expect(getCachedAvatarUrl(null)).toBeUndefined()
    expect(getCachedAvatarUrl(undefined)).toBeUndefined()
    expect(getCachedAvatarUrl('')).toBeUndefined()
    expect(getCachedAvatarUrl('unknown/path.webp')).toBeUndefined()
  })

  it('preloads image by instantiating Image constructor', () => {
    const originalImage = window.Image
    const mockImageInstances: { src?: string }[] = []
    window.Image = class {
      src = ''
      constructor() {
        mockImageInstances.push(this)
      }
    } as unknown as typeof Image

    try {
      preloadImage('https://example.com/test.webp')
      expect(mockImageInstances).toHaveLength(1)
      expect(mockImageInstances[0].src).toBe('https://example.com/test.webp')
    } finally {
      window.Image = originalImage
    }
  })
})
