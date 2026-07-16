import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  showToast: vi.fn(),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, configured: true }),
}))

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}))

vi.mock('../lib/api', () => ({
  listLoginProfiles: vi.fn().mockResolvedValue([
    {
      id: '11111111-1111-1111-1111-111111111111',
      display_name: 'wjpxhz',
      login_alias: 'wjpxhz',
      login_email: 'wjpxhz@gmail.com',
      color_key: 'sage',
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      display_name: 'cutesnake521',
      login_alias: 'cutesnake521',
      login_email: 'cutesnake521@gmail.com',
      color_key: 'peach',
    },
  ]),
  signIn: mocks.signIn,
}))

describe('LoginPage', () => {
  beforeEach(() => {
    mocks.signIn.mockReset().mockResolvedValue(undefined)
    mocks.showToast.mockReset()
  })

  it('submits an existing password without imposing the account-creation length policy', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await user.click(await screen.findByRole('radio', { name: /wjpxhz/i }))
    await user.type(screen.getByPlaceholderText('输入你的口令'), '1234567')
    await user.click(screen.getByRole('button', { name: '进入我们的手账' }))

    expect(mocks.signIn).toHaveBeenCalledWith('wjpxhz@gmail.com', '1234567')
    expect(mocks.showToast).toHaveBeenCalledWith('欢迎回来，wjpxhz', 'success')
  })
})
