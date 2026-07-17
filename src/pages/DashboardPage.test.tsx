import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../contexts/AuthContext'
import { useStudentScope } from '../contexts/StudentScopeContext'
import { useExamData } from '../hooks/useExamData'
import type { Exam, Profile } from '../types/domain'
import { DashboardPage } from './DashboardPage'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../contexts/StudentScopeContext', () => ({ useStudentScope: vi.fn() }))
vi.mock('../hooks/useExamData', () => ({ useExamData: vi.fn() }))
vi.mock('../components/TrendCharts', () => ({
  METRIC_LABELS: {
    total: '总成绩', chinese: '语文', math: '数学', english: '英语',
    biology: '生物', chemistry: '化学', physics: '物理',
  },
  TrendCharts: ({ activeExamId }: { activeExamId?: string }) => (
    <output data-testid="active-exam">{activeExamId ?? ''}</output>
  ),
}))

const profile: Profile = {
  id: 'student-1',
  display_name: '芽',
  login_alias: 'sprout',
  color_key: 'sage',
}

function exam(id: string, title: string, date: string, score: number): Exam {
  return {
    id,
    title,
    exam_date: date,
    space_id: 'space-1',
    student_id: profile.id,
    kind: 'comprehensive',
    primary_subject: null,
    total_score: score,
    total_full_score: 750,
    rank_value: 20,
    participant_count: 500,
    rank_scope: 'overall',
    visibility: 'shared',
    academic_year: '2026-2027',
    term: '高二上学期',
    category: '月考',
    created_by: profile.id,
    updated_by: profile.id,
    version: 1,
    created_at: `${date}T08:00:00Z`,
    updated_at: `${date}T08:00:00Z`,
    deleted_at: null,
    deleted_by: null,
  }
}

const exams = [
  exam('exam-2', '最新月考', '2026-11-08', 630),
  exam('exam-1', '上次月考', '2026-09-18', 600),
]

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      user: null,
      profile,
      membership: null,
      profiles: [profile],
      loading: false,
      configured: true,
      refreshIdentity: vi.fn(),
    })
    vi.mocked(useStudentScope).mockReturnValue({
      studentId: profile.id,
      selectedProfile: profile,
      setStudentId: vi.fn(),
    })
    vi.mocked(useExamData).mockReturnValue({
      exams,
      subjectScores: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  afterEach(cleanup)

  it('links recent row pointer and keyboard focus to the controlled chart highlight', () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    const latestRow = screen.getByRole('link', { name: /最新月考/ })

    fireEvent.mouseEnter(latestRow)
    expect(screen.getByTestId('active-exam')).toHaveTextContent('exam-2')
    expect(latestRow).toHaveAttribute('data-active', 'true')

    fireEvent.mouseLeave(latestRow)
    expect(screen.getByTestId('active-exam')).toBeEmptyDOMElement()

    fireEvent.focus(latestRow)
    expect(screen.getByTestId('active-exam')).toHaveTextContent('exam-2')
    fireEvent.blur(latestRow)
    expect(screen.getByTestId('active-exam')).toBeEmptyDOMElement()
  })

  it('uses the selected subject values in comprehensive-exam recent rows', () => {
    vi.mocked(useExamData).mockReturnValue({
      exams,
      subjectScores: [
        { id: 'score-2', exam_id: 'exam-2', subject: 'math', score: 95, full_score: 100, rank_value: 8, participant_count: 500 },
        { id: 'score-1', exam_id: 'exam-1', subject: 'math', score: 80, full_score: 100, rank_value: 16, participant_count: 500 },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    fireEvent.click(screen.getByRole('tab', { name: '数学' }))
    const latestRow = screen.getByRole('link', { name: /最新月考/ })
    expect(latestRow).toHaveTextContent('95.0%')
    expect(latestRow).toHaveTextContent('+15.0 个点')
  })
})
