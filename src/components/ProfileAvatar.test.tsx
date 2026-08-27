import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setCachedAvatarUrl } from '../lib/avatarCache'
import { ProfileAvatar } from './ProfileAvatar'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {
    ...actual,
    createProfileAvatarUrl: vi.fn().mockResolvedValue('https://example.com/resolved-avatar.webp'),
  }
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

beforeEach(() => {
  window.localStorage.clear()
})

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('ProfileAvatar', () => {
  it('renders text fallback when profile has no avatar path', () => {
    render(
      <ProfileAvatar
        profile={{ display_name: '小芽', color_key: 'sage', avatar_path: null }}
      />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByText('小')).toBeInTheDocument()
    expect(screen.queryByRole('img', { hidden: true })).toBeNull()
  })

  it('renders image immediately on first frame when signed URL is present in persistent cache', () => {
    const avatarPath = 'user-1/test-avatar.webp'
    setCachedAvatarUrl(avatarPath, 'https://example.com/cached-avatar.webp', 3600)

    render(
      <ProfileAvatar
        profile={{ display_name: '小芽', color_key: 'sage', avatar_path: avatarPath }}
        size="large"
      />,
      { wrapper: createWrapper() },
    )

    const img = document.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://example.com/cached-avatar.webp')
    expect(img?.getAttribute('fetchpriority')).toBe('high')
    expect(img?.getAttribute('decoding')).toBe('async')
  })
})
