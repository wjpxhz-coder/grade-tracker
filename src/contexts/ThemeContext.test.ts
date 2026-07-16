import { afterEach, describe, expect, it } from 'vitest'
import { applyTheme, isThemePreference, readThemePreference, resolveTheme, THEME_STORAGE_KEY } from './ThemeContext'

describe('theme preferences', () => {
  afterEach(() => {
    window.localStorage.clear()
    delete document.documentElement.dataset.theme
    document.documentElement.style.colorScheme = ''
  })

  it('validates and resolves explicit and system preferences', () => {
    expect(isThemePreference('dark')).toBe(true)
    expect(isThemePreference('unknown')).toBe(false)
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('falls back to system when storage contains an unknown value', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    expect(readThemePreference()).toBe('system')
  })

  it('applies the resolved theme before the app renders', () => {
    expect(applyTheme('dark')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})
