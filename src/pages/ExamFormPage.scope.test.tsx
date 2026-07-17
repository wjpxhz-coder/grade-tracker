import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ExamFormPage } from './ExamFormPage'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    profile: { id: 'user-1', display_name: '芽', login_alias: 'sprout', color_key: 'sage' },
    profiles: [
      { id: 'user-1', display_name: '芽', login_alias: 'sprout', color_key: 'sage' },
      { id: 'user-2', display_name: '暖墨', login_alias: 'ink', color_key: 'peach' },
    ],
    membership: { space_id: 'space-1', user_id: 'user-1' },
  }),
}))

vi.mock('../contexts/StudentScopeContext', () => ({
  useStudentScope: () => ({ studentId: 'user-2', selectedProfile: null, setStudentId: vi.fn() }),
}))

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../lib/api', () => ({
  getExamDetails: vi.fn(),
  saveExam: vi.fn(),
  uploadExamImage: vi.fn(),
}))

describe('ExamFormPage student scope', () => {
  it('defaults a new record to the globally selected student', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/exams/new']}>
          <ExamFormPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByRole('combobox', { name: /成绩属于/ })).toHaveValue('user-2')
  })
})
