import { describe, expect, it } from 'vitest'
import type { Exam, SubjectScore } from '../types/domain'
import { deriveComparableExamInsights } from './insights'

function exam(overrides: Partial<Exam> & Pick<Exam, 'id' | 'exam_date'>): Exam {
  const { id, exam_date: examDate, ...rest } = overrides
  return {
    id,
    space_id: 'space-1',
    student_id: 'student-1',
    title: overrides.id,
    exam_date: examDate,
    kind: 'comprehensive',
    primary_subject: null,
    total_score: null,
    total_full_score: null,
    rank_value: null,
    participant_count: null,
    rank_scope: null,
    visibility: 'shared',
    academic_year: null,
    term: null,
    category: null,
    created_by: 'student-1',
    updated_by: 'student-1',
    version: 1,
    created_at: `${examDate}T08:00:00Z`,
    updated_at: `${examDate}T08:00:00Z`,
    deleted_at: null,
    deleted_by: null,
    ...rest,
  }
}

function subjectScore(
  examId: string,
  overrides: Partial<SubjectScore> = {},
): SubjectScore {
  return {
    id: `${examId}-math`,
    exam_id: examId,
    subject: 'math',
    score: null,
    full_score: null,
    rank_value: null,
    participant_count: null,
    ...overrides,
  }
}

describe('deriveComparableExamInsights', () => {
  it('marks the first valid record as neutral', () => {
    const insights = deriveComparableExamInsights([
      exam({
        id: 'first',
        exam_date: '2026-03-01',
        total_score: 80,
        total_full_score: 100,
        rank_value: 10,
        participant_count: 100,
        rank_scope: 'overall',
      }),
    ], [])

    expect(insights.get('first')).toEqual({
      scoreRate: 80,
      scoreRateDelta: null,
      rankPercentile: 91,
      rankPercentileDelta: null,
      rankChange: null,
      comparisonLabel: '首次可比记录',
      tone: 'neutral',
    })
  })

  it('compares percentage points rather than raw scores when full scores differ', () => {
    const insights = deriveComparableExamInsights([
      exam({ id: 'earlier', exam_date: '2026-03-01', total_score: 80, total_full_score: 100 }),
      exam({ id: 'later', exam_date: '2026-04-01', total_score: 90, total_full_score: 120 }),
    ], [])

    expect(insights.get('later')).toMatchObject({
      scoreRate: 75,
      scoreRateDelta: -5,
      comparisonLabel: '较上次综合考试',
      tone: 'down',
    })
  })

  it('keeps missing scores null and does not manufacture a comparison', () => {
    const insights = deriveComparableExamInsights([
      exam({ id: 'earlier', exam_date: '2026-03-01', total_score: 80, total_full_score: 100 }),
      exam({ id: 'missing', exam_date: '2026-04-01', total_score: null, total_full_score: 100 }),
    ], [])

    expect(insights.get('missing')).toMatchObject({
      scoreRate: null,
      scoreRateDelta: null,
      rankPercentile: null,
      rankPercentileDelta: null,
      rankChange: null,
      comparisonLabel: '首次可比记录',
      tone: 'neutral',
    })

    const subjectInsights = deriveComparableExamInsights([
      exam({ id: 'comprehensive', exam_date: '2026-03-01', total_score: 500, total_full_score: 600 }),
      exam({
        id: 'math-quiz',
        exam_date: '2026-04-01',
        kind: 'single_subject',
        primary_subject: 'math',
        total_score: 90,
        total_full_score: 100,
      }),
    ], [
      subjectScore('comprehensive', { score: null, full_score: 100 }),
      subjectScore('math-quiz', { score: 90, full_score: 100 }),
    ])

    expect(subjectInsights.get('math-quiz')).toMatchObject({
      scoreRate: 90,
      scoreRateDelta: null,
      comparisonLabel: '首次可比记录',
      tone: 'neutral',
    })
  })

  it('does not skip an immediately previous comprehensive exam with missing scores', () => {
    const insights = deriveComparableExamInsights([
      exam({ id: 'first', exam_date: '2026-03-01', total_score: 80, total_full_score: 100 }),
      exam({ id: 'missing', exam_date: '2026-04-01', total_score: null, total_full_score: 100 }),
      exam({ id: 'latest', exam_date: '2026-05-01', total_score: 90, total_full_score: 100 }),
    ], [])

    expect(insights.get('latest')).toMatchObject({
      scoreRate: 90,
      scoreRateDelta: null,
      comparisonLabel: '首次可比记录',
      tone: 'neutral',
    })
  })

  it('compares a single-subject result with the same subject from a comprehensive exam', () => {
    const exams = [
      exam({ id: 'comprehensive', exam_date: '2026-03-01', total_score: 500, total_full_score: 600 }),
      exam({
        id: 'english-quiz',
        exam_date: '2026-03-15',
        kind: 'single_subject',
        primary_subject: 'english',
        total_score: 95,
        total_full_score: 100,
        rank_scope: 'subject',
      }),
      exam({
        id: 'math-quiz',
        exam_date: '2026-04-01',
        kind: 'single_subject',
        primary_subject: 'math',
        total_score: 108,
        total_full_score: 120,
        rank_scope: 'subject',
      }),
    ]
    const scores = [
      subjectScore('comprehensive', { score: 80, full_score: 100 }),
      subjectScore('english-quiz', { subject: 'english', score: 95, full_score: 100 }),
      subjectScore('math-quiz', { score: 108, full_score: 120 }),
    ]

    expect(deriveComparableExamInsights(exams, scores).get('math-quiz')).toMatchObject({
      scoreRate: 90,
      scoreRateDelta: 10,
      comparisonLabel: '较上次数学记录',
      tone: 'up',
    })
  })

  it('prefers percentile changes and only falls back to comparable raw ranks', () => {
    const percentileInsights = deriveComparableExamInsights([
      exam({ id: 'rank-1', exam_date: '2026-03-01', rank_value: 20, participant_count: 100, rank_scope: 'overall' }),
      exam({ id: 'rank-2', exam_date: '2026-04-01', rank_value: 30, participant_count: 200, rank_scope: 'overall' }),
    ], [])
    const percentile = percentileInsights.get('rank-2')

    expect(percentile?.rankPercentile).toBe(85.5)
    expect(percentile?.rankPercentileDelta).toBeCloseTo(4.5)
    expect(percentile?.rankChange).toBeNull()
    expect(percentile?.tone).toBe('up')

    const rawInsights = deriveComparableExamInsights([
      exam({ id: 'raw-1', exam_date: '2026-03-01', rank_value: 20, participant_count: null, rank_scope: 'overall' }),
      exam({ id: 'raw-2', exam_date: '2026-04-01', rank_value: 15, participant_count: null, rank_scope: 'overall' }),
    ], [])

    expect(rawInsights.get('raw-2')).toMatchObject({
      rankPercentile: null,
      rankPercentileDelta: null,
      rankChange: 5,
      tone: 'up',
    })
  })
})
