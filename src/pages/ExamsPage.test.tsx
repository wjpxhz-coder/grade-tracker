import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStudentScope } from '../contexts/StudentScopeContext'
import { useExamData } from '../hooks/useExamData'
import type { Exam, Profile, SubjectScore } from '../types/domain'
import { ExamsPage } from './ExamsPage'

vi.mock('../contexts/StudentScopeContext', () => ({ useStudentScope: vi.fn() }))
vi.mock('../hooks/useExamData', () => ({ useExamData: vi.fn() }))

const profile: Profile = {
  id: 'student-1',
  display_name: '芽',
  login_alias: 'sprout',
  color_key: 'sage',
}

function exam(overrides: Partial<Exam> & Pick<Exam, 'id' | 'title' | 'exam_date'>): Exam {
  return {
    space_id: 'space-1',
    student_id: profile.id,
    kind: 'comprehensive',
    primary_subject: null,
    total_score: 600,
    total_full_score: 750,
    rank_value: 20,
    participant_count: 500,
    rank_scope: 'overall',
    visibility: 'shared',
    academic_year: '2026-2027',
    term: '高二上学期',
    category: '期中',
    created_by: profile.id,
    updated_by: profile.id,
    version: 1,
    created_at: `${overrides.exam_date}T08:00:00Z`,
    updated_at: `${overrides.exam_date}T08:00:00Z`,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  }
}

const exams: Exam[] = [
  exam({ id: 'exam-2', title: '高二期中考试', exam_date: '2026-11-08', total_score: 630, visibility: 'private' }),
  exam({
    id: 'exam-1',
    title: '数学月考',
    exam_date: '2026-09-18',
    kind: 'single_subject',
    primary_subject: 'math',
    total_score: 132,
    total_full_score: 150,
    rank_scope: 'subject',
    category: '月考',
  }),
]

const subjectScores: SubjectScore[] = [{
  id: 'score-1',
  exam_id: 'exam-1',
  subject: 'math',
  score: 132,
  full_score: 150,
  rank_value: 20,
  participant_count: 500,
}]

function LocationProbe() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  return <output data-testid="location">{JSON.stringify(Object.fromEntries(params))}</output>
}

function renderPage(initialEntry = '/exams') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/exams" element={<><ExamsPage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ExamsPage', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.mocked(useStudentScope).mockReturnValue({
      studentId: profile.id,
      selectedProfile: profile,
      setStudentId: vi.fn(),
    })
    vi.mocked(useExamData).mockReturnValue({
      exams,
      subjectScores,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  it('restores URL filters and renders the matching period as a semantic table', () => {
    renderPage('/exams?q=期中&kind=comprehensive&year=2026-2027')

    expect(screen.getByRole('searchbox')).toHaveValue('期中')
    expect(screen.getByRole('button', { name: '综合考试' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: '学年' })).toHaveValue('2026-2027')
    expect(screen.getByRole('table', { name: /2026-2027高二上学期/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /高二期中考试/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /数学月考/ })).not.toBeInTheDocument()
    expect(screen.getByText('仅自己可见')).toBeInTheDocument()
  })

  it('writes search and kind changes back to the URL', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByRole('searchbox'), '月考')
    expect(screen.getByTestId('location')).toHaveTextContent('"q":"月考"')
    expect(screen.getByRole('link', { name: /数学月考/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '单科测验' }))
    expect(screen.getByTestId('location')).toHaveTextContent('"kind":"single_subject"')
    expect(screen.getByText('双方可见')).toBeInTheDocument()
  })
})
