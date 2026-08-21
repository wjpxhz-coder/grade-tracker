import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Exam, Profile, SubjectScore } from '../types/domain'
import { ScoreCurveReplayModal } from './ScoreCurveReplayModal'

vi.mock('echarts-for-react/lib/core', () => ({
  default: () => <div data-testid="mock-echarts" />,
}))

vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    preference: 'light',
    resolvedTheme: 'light',
    setPreference: vi.fn(),
  }),
}))

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

describe('ScoreCurveReplayModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
  })

  afterEach(cleanup)

  it('renders nothing when isOpen is false', () => {
    render(
      <ScoreCurveReplayModal
        isOpen={false}
        onClose={onClose}
        exams={exams}
        subjectScores={subjectScores}
        selectedProfile={profile}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders modal content and spotlight on the first exam when opened', () => {
    render(
      <ScoreCurveReplayModal
        isOpen={true}
        onClose={onClose}
        exams={exams}
        subjectScores={subjectScores}
        selectedProfile={profile}
      />,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/小溪的总成绩成长轨迹/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '高二期末考试' })).toBeInTheDocument()
    expect(screen.getByText(/523.5 \/ 750/)).toBeInTheDocument()
    expect(screen.getByText(/第 85 名/)).toBeInTheDocument()
  })

  it('advances to next exam and rewinds to previous exam on button clicks', () => {
    render(
      <ScoreCurveReplayModal
        isOpen={true}
        onClose={onClose}
        exams={exams}
        subjectScores={subjectScores}
        selectedProfile={profile}
      />,
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

  it('responds to keyboard navigation', () => {
    render(
      <ScoreCurveReplayModal
        isOpen={true}
        onClose={onClose}
        exams={exams}
        subjectScores={subjectScores}
        selectedProfile={profile}
      />,
    )

    // Press right arrow to step forward
    fireEvent.keyDown(window, { code: 'ArrowRight' })
    expect(screen.getByRole('heading', { name: '高二最后一次考试' })).toBeInTheDocument()

    // Press space to toggle play/pause
    fireEvent.keyDown(window, { code: 'Space' })

    // Press left arrow to step backward
    fireEvent.keyDown(window, { code: 'ArrowLeft' })
    expect(screen.getByRole('heading', { name: '高二期末考试' })).toBeInTheDocument()

    // Press escape to close
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('supports switching subject tabs and score display mode', () => {
    render(
      <ScoreCurveReplayModal
        isOpen={true}
        onClose={onClose}
        exams={exams}
        subjectScores={subjectScores}
        selectedProfile={profile}
      />,
    )

    const mathTab = screen.getByRole('tab', { name: '数学' })
    fireEvent.click(mathTab)
    expect(screen.getByText(/小溪的数学成长轨迹/)).toBeInTheDocument()

    const percentBtn = screen.getByRole('button', { name: '得分率' })
    fireEvent.click(percentBtn)
    expect(percentBtn).toHaveClass('active')
  })

  it('renders empty state if no exam data for selected metric', () => {
    render(
      <ScoreCurveReplayModal
        isOpen={true}
        onClose={onClose}
        exams={[]}
        subjectScores={[]}
        selectedProfile={profile}
      />,
    )

    expect(screen.getByText(/暂无可播放的总成绩数据/)).toBeInTheDocument()
  })
})
