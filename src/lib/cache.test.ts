import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearWebsiteCache } from './cache'

describe('clearWebsiteCache', () => {
  const originalCaches = Object.getOwnPropertyDescriptor(window, 'caches')

  afterEach(() => {
    window.sessionStorage.clear()
    if (originalCaches) Object.defineProperty(window, 'caches', originalCaches)
    else Reflect.deleteProperty(window, 'caches')
  })

  it('clears temporary storage and every Cache Storage entry', async () => {
    window.sessionStorage.setItem('temporary-filter', 'math')
    const keys = vi.fn().mockResolvedValue(['assets-v1', 'images-v1'])
    const remove = vi.fn().mockResolvedValue(true)
    Object.defineProperty(window, 'caches', { configurable: true, value: { keys, delete: remove } })

    await clearWebsiteCache()

    expect(window.sessionStorage).toHaveLength(0)
    expect(keys).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith('assets-v1')
    expect(remove).toHaveBeenCalledWith('images-v1')
  })

  it('still clears temporary storage when Cache Storage is unavailable', async () => {
    window.sessionStorage.setItem('temporary-filter', 'math')
    Reflect.deleteProperty(window, 'caches')

    await clearWebsiteCache()

    expect(window.sessionStorage).toHaveLength(0)
  })
})
