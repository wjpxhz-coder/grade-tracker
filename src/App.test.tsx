import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./lib/supabase', () => ({
  ATTACHMENT_BUCKET: 'exam-attachments',
  isSupabaseConfigured: false,
  supabase: {},
}))

describe('application bootstrap', () => {
  it('shows a clear setup state when Supabase variables are missing', async () => {
    window.location.hash = '#/login'
    render(<App />)
    expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeInTheDocument()
    expect(screen.getByText('还差一步配置')).toBeInTheDocument()
    expect(screen.getByText(/\.env\.local/)).toBeInTheDocument()
  })
})
