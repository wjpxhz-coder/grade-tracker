import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePwaInstall } from './usePwaInstall'

describe('usePwaInstall', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts uninstalled by default and responds to beforeinstallprompt event', async () => {
    const { result } = renderHook(() => usePwaInstall())

    expect(result.current.isInstalled).toBe(false)
    expect(result.current.isInstallable).toBe(false)

    const mockPrompt = vi.fn().mockResolvedValue(undefined)
    const mockEvent = new Event('beforeinstallprompt') as any
    mockEvent.prompt = mockPrompt
    mockEvent.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' })

    act(() => {
      window.dispatchEvent(mockEvent)
    })

    expect(result.current.isInstallable).toBe(true)

    let installResult = false
    await act(async () => {
      installResult = await result.current.promptInstall()
    })

    expect(mockPrompt).toHaveBeenCalledTimes(1)
    expect(installResult).toBe(true)
    expect(result.current.isInstallable).toBe(false)
  })

  it('handles appinstalled event', () => {
    const { result } = renderHook(() => usePwaInstall())

    expect(result.current.isInstalled).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })

    expect(result.current.isInstalled).toBe(true)
    expect(result.current.isInstallable).toBe(false)
  })
})
