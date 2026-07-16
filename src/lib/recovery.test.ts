import { describe, expect, it } from 'vitest'
import { cacheBustedUrl, isStaleAssetError } from './recovery'

describe('deployment recovery', () => {
  it('recognizes stale lazy-chunk failures without treating normal errors as deploy failures', () => {
    expect(isStaleAssetError(new TypeError('Failed to fetch dynamically imported module: /assets/Dashboard-old.js'))).toBe(true)
    expect(isStaleAssetError(new Error('ChunkLoadError: Loading chunk 42 failed'))).toBe(true)
    expect(isStaleAssetError(new Error('保存考试失败'))).toBe(false)
  })

  it('keeps the route and hash while adding a cache-busting query', () => {
    expect(cacheBustedUrl('https://example.com/grade-tracker/?old=1#/exams', 123)).toBe('https://example.com/grade-tracker/?old=1&app-refresh=123#/exams')
  })
})
