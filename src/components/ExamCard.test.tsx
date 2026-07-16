import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ExamCard } from './ExamCard'
import type { Exam, Profile } from '../types/domain'

const profile: Profile = { id: 'user-1', display_name: '小芽', login_alias: 'sprout', color_key: 'sage' }
const exam: Exam = {
  id: 'exam-1',
  space_id: 'space-1',
  student_id: profile.id,
  title: '高二期中考试',
  exam_date: '2026-11-08',
  kind: 'comprehensive',
  primary_subject: null,
  total_score: 612,
  total_full_score: 750,
  rank_value: 38,
  participant_count: 860,
  rank_scope: 'overall',
  visibility: 'shared',
  academic_year: '2026-2027',
  term: '高二上学期',
  category: '期中',
  created_by: profile.id,
  updated_by: profile.id,
  version: 1,
  created_at: '2026-11-08T08:00:00Z',
  updated_at: '2026-11-08T08:00:00Z',
  deleted_at: null,
  deleted_by: null,
}

describe('ExamCard', () => {
  it('renders score, ranking, owner and detail link', () => {
    render(<MemoryRouter><ExamCard exam={exam} profile={profile} noteCount={2} attachmentCount={4} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: '高二期中考试' })).toBeInTheDocument()
    expect(screen.getByText('612 / 750')).toBeInTheDocument()
    expect(screen.getByText('第 38 名')).toBeInTheDocument()
    expect(screen.getByText(/小芽/)).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/exams/exam-1')
  })
})
