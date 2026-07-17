import { describe, expect, it } from 'vitest'
import { getGreeting } from './greeting'

describe('getGreeting', () => {
  it.each([
    [5, '早上好'],
    [10, '早上好'],
    [11, '中午好'],
    [13, '中午好'],
    [14, '下午好'],
    [17, '下午好'],
    [18, '晚上好'],
    [4, '晚上好'],
  ])('returns %s 点对应的问候语', (hour, expected) => {
    expect(getGreeting(hour)).toBe(expected)
  })
})
