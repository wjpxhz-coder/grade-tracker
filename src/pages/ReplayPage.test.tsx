import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStudentScope } from '../contexts/StudentScopeContext'
import { useTheme } from '../contexts/ThemeContext'
import { useExamData } from '../hooks/useExamData'
import type { Exam, Profile, SubjectScore } from '../types/domain'
import { ReplayPage } from './ReplayPage'

vi.mock('echarts-for-react/lib/core', () => ({
  default: () => <div data-testid="mock-echarts" />,
}))

vi.mock('../contexts/StudentScopeContext', () => ({ useStudentScope: vi.fn() }))
vi.mock('../contexts/ThemeContext', () => ({ useTheme: vi.fn() }))
vi.mock('../hooks/useExamData', () => ({ useExamData: vi.fn() }))

const profile: Profile = {
  id: 'student-1',
  display_name: '小溪',
  login_alias: 'stream',
  color_key: 'sage',
}

const exams: Exam[] = [
  {
    id: 'exam-1',
    title: '高二期末考试',
    exam_date: '2026-06-27',
    space_id: 'space-1',
    student_id: profile.id,
    kind: 'comprehensive',
    primary_subject: null,
    total_score: 523.5,
    total_full_score: 750,
    rank_value: 85,
    participant_count: 850,
    rank_scope: 'overall',
    visibility: 'shared',
    academic_year: '2025-2026',
    term: '高二下学期',
    category: '期末',
    created_by: profile.id,
    updated_by: profile.id,
    version: 1,
    created_at: '2026-06-27T08:00:00Z',
    updated_at: '2026-06-27T08:00:00Z',
    deleted_at: null,
    deleted_by: null,
  },
  {
    id: 'exam-2',
    title: '高二最后一次考试',
    exam_date: '2026-07-07',
    space_id: 'space-1',
    student_id: profile.id,
    kind: 'comprehensive',
    primary_subject: null,
    total_score: 560.5,
    total_full_score: 750,
    rank_value: 49,
    participant_count: 850,
    rank_scope: 'overall',
    visibility: 'shared',
    academic_year: '2025-2026',
    term: '高二下学期',
    category: '期末',
    created_by: profile.id,
    updated_by: profile.id,
    version: 1,
    created_at: '2026-07-07T08:00:00Z',
    updated_at: '2026-07-07T08:00:00Z',
    deleted_at: null,
    deleted_by: null,
  },
]

const subjectScores: SubjectScore[] = [
  {
    id: 'score-1',
    exam_id: 'exam-1',
    subject: 'math',
    score: 110,
    full_score: 150,
    rank_value: 70,
    participant_count: 850,
    created_at: '2026-06-27T08:00:00Z',
    updated_at: '2026-06-27T08:00:00Z',
  },
  {
    id: 'score-2',
    exam_id: 'exam-2',
    subject: 'math',
    score: 128,
    full_score: 150,
    rank_value: 35,
    participant_count: 850,
    created_at: '2026-07-07T08:00:00Z',
    updated_at: '2026-07-07T08:00:00Z',
  },
]

describe('ReplayPage', () => {
  beforeEach(() => {
    vi.mocked(useStudentScope).mockReturnValue({
      studentId: profile.id,
      selectedProfile: profile,
      setStudentId: vi.fn(),
    })
    vi.mocked(useTheme).mockReturnValue({
      preference: 'light',
      resolvedTheme: 'light',
      setPreference: vi.fn(),
    })
    vi.mocked(useExamData).mockReturnValue({
      exams,
      subjectScores,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  afterEach(cleanup)

  it('renders clean replay page with back link, title, and initial exam spotlight', () => {
    render(
      <MemoryRouter initialEntries={['/replay']}>
        <ReplayPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: /返回总览/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('heading', { name: /小溪的总成绩轨迹/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '高二期末考试' })).toBeInTheDocument()
    expect(screen.getByText(/523.5 \/ 750/)).toBeInTheDocument()
    expect(screen.getByText(/第 85 名/)).toBeInTheDocument()
  })

  it('advances and rewinds exam frames via playback buttons', () => {
    render(
      <MemoryRouter initialEntries={['/replay']}>
        <ReplayPage />
      </MemoryRouter>,
    )

    const nextBtn = screen.getByRole('button', { name: '下一场' })
    fireEvent.click(nextBtn)

    expect(screen.getByRole('heading', { name: '高二最后一次考试' })).toBeInTheDocument()
    expect(screen.getByText(/560.5 \/ 750/)).toBeInTheDocument()
    expect(screen.getByText(/第 49 名/)).toBeInTheDocument()

    const prevBtn = screen.getByRole('button', { name: '上一场' })
    fireEvent.click(prevBtn)

    expect(screen.getByRole('heading', { name: '高二期末考试' })).toBeInTheDocument()
  })

  it('handles keyboard navigation (ArrowRight, Space, ArrowLeft)', () => {
    render(
      <MemoryRouter initialEntries={['/replay']}>
        <ReplayPage />
      </MemoryRouter>,
    )

    fireEvent.keyDown(window, { code: 'ArrowRight' })
    expect(screen.getByRole('heading', { name: '高二最后一次考试' })).toBeInTheDocument()

    fireEvent.keyDown(window, { code: 'Space' })

    fireEvent.keyDown(window, { code: 'ArrowLeft' })
    expect(screen.getByRole('heading', { name: '高二期末考试' })).toBeInTheDocument()
  })

  it('supports switching metrics and score display modes', () => {
    render(
      <MemoryRouter initialEntries={['/replay']}>
        <ReplayPage />
      </MemoryRouter>,
    )

    const mathTab = screen.getByRole('tab', { name: '数学' })
    fireEvent.click(mathTab)
    expect(screen.getByRole('heading', { name: /小溪的数学轨迹/ })).toBeInTheDocument()

    const percentBtn = screen.getByRole('button', { name: '得分率' })
    fireEvent.click(percentBtn)
    expect(percentBtn).toHaveClass('active')
  })

  it('renders empty state when there are no exams', () => {
    vi.mocked(useExamData).mockReturnValue({
      exams: [],
      subjectScores: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/replay']}>
        <ReplayPage />
      </MemoryRouter>,
    )

    expect(screen.getByText(/还没有总成绩记录/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回主页' })).toHaveAttribute('href', '/')
  })
})
