import { describe, expect, it } from 'vitest'
import { computeRankAxisBounds, computeScoreAxisBounds } from './chartAxis'

describe('computeScoreAxisBounds', () => {
  it('focuses raw total scores around data range instead of compressing against zero', () => {
    const bounds = computeScoreAxisBounds(
      [523.5, 560.5, 533, 560.5, 592],
      'raw',
      [750, 750, 750, 750, 750],
    )

    expect(bounds.min).toBeGreaterThanOrEqual(480)
    expect(bounds.min).toBeLessThan(523.5)
    expect(bounds.max).toBeGreaterThan(592)
    expect(bounds.max).toBeLessThanOrEqual(650)
    expect(bounds.interval).toBeDefined()

    // Ensure the 68.5-point climb fills a meaningful visual portion (>= 45%) of the chart height.
    const visualRatio = (592 - 523.5) / ((bounds.max ?? 0) - (bounds.min ?? 0))
    expect(visualRatio).toBeGreaterThanOrEqual(0.45)
  })

  it('focuses percentage scores instead of locking 0..100 when values are clustered', () => {
    const bounds = computeScoreAxisBounds(
      [69.8, 74.73, 71.07, 74.73, 78.93],
      'percentage',
    )

    expect(bounds.min).toBeGreaterThanOrEqual(60)
    expect(bounds.min).toBeLessThan(69.8)
    expect(bounds.max).toBeGreaterThan(78.93)
    expect(bounds.max).toBeLessThanOrEqual(90)
    expect(bounds.interval).toBeDefined()
  })

  it('keeps percentage axis capped at 100 when scores are near full marks', () => {
    const bounds = computeScoreAxisBounds([92, 95, 97, 99], 'percentage')
    expect(bounds.min).toBeLessThan(92)
    expect(bounds.max).toBe(100)
  })

  it('handles flat or single-point data without collapsing min and max', () => {
    const singleRaw = computeScoreAxisBounds([560], 'raw', [750])
    expect(singleRaw.min).toBeLessThan(560)
    expect(singleRaw.max).toBeGreaterThan(560)

    const fullPercent = computeScoreAxisBounds([100, 100], 'percentage')
    expect(fullPercent.min).toBeLessThan(100)
    expect(fullPercent.max).toBe(100)

    const zeroRaw = computeScoreAxisBounds([0], 'raw', [100])
    expect(zeroRaw.min).toBe(0)
    expect(zeroRaw.max).toBeGreaterThan(0)
  })

  it('handles empty or null-only series safely', () => {
    expect(computeScoreAxisBounds([null, null], 'raw')).toEqual({})
    expect(computeScoreAxisBounds([null, undefined], 'percentage')).toEqual({ min: 0, max: 100 })
  })

  it('focuses single-subject scores cleanly', () => {
    const bounds = computeScoreAxisBounds([110, 118, 114, 128], 'raw', [150, 150, 150, 150])
    expect(bounds.min).toBeGreaterThanOrEqual(95)
    expect(bounds.min).toBeLessThan(110)
    expect(bounds.max).toBeGreaterThan(128)
    expect(bounds.max).toBeLessThanOrEqual(145)
  })
})

describe('computeRankAxisBounds', () => {
  it('focuses mid-table ranks with headroom at the top for labels', () => {
    const bounds = computeRankAxisBounds([101, 49, 89, 58, 62])
    expect(bounds.min).toBeGreaterThanOrEqual(1)
    expect(bounds.min).toBeLessThan(49)
    expect(bounds.max).toBeGreaterThan(101)
    expect(bounds.max).toBeLessThanOrEqual(130)
  })

  it('focuses deep-rank improvements instead of anchoring at rank 1', () => {
    const bounds = computeRankAxisBounds([450, 410, 380, 320])
    expect(bounds.min).toBeGreaterThanOrEqual(200)
    expect(bounds.min).toBeLessThan(320)
    expect(bounds.max).toBeGreaterThan(450)
  })

  it('clamps top ranks to 1 and omits forced uneven interval', () => {
    const bounds = computeRankAxisBounds([12, 5, 8, 3])
    expect(bounds.min).toBe(1)
    expect(bounds.max).toBeGreaterThan(12)
    expect(bounds.interval).toBeUndefined()
  })

  it('handles single rank and empty rank arrays', () => {
    const single = computeRankAxisBounds([49])
    expect(single.min).toBeLessThan(49)
    expect(single.max).toBeGreaterThan(49)

    const topOne = computeRankAxisBounds([1])
    expect(topOne.min).toBe(1)
    expect(topOne.max).toBeGreaterThan(1)

    expect(computeRankAxisBounds([null])).toEqual({ min: 1 })
  })
})
