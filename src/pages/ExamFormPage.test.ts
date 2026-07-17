import { describe, expect, it } from 'vitest'
import { buildSubjectScoreInputs, deriveExamFormSummary, emptySubjects, validateExamForm, type FormState } from './ExamFormPage'

function form(overrides: Partial<FormState> = {}): FormState {
  return {
    studentId: 'user-1',
    title: '期中考试',
    examDate: '2026-07-16',
    kind: 'comprehensive',
    primarySubject: 'math',
    totalScore: '',
    totalFullScore: '',
    rankValue: '',
    participantCount: '',
    rankScope: 'overall',
    visibility: 'shared',
    academicYear: '',
    term: '',
    category: '',
    subjects: emptySubjects(),
    ...overrides,
  }
}

describe('exam form contract', () => {
  it('starts each subject with the configured full score', () => {
    const subjects = emptySubjects()
    expect(subjects.chinese.fullScore).toBe('150')
    expect(subjects.math.fullScore).toBe('150')
    expect(subjects.english.fullScore).toBe('150')
    expect(subjects.biology.fullScore).toBe('100')
    expect(subjects.chemistry.fullScore).toBe('100')
    expect(subjects.physics.fullScore).toBe('100')
  })

  it('allows a known scale with a missing score, but not a score without its scale', () => {
    expect(validateExamForm(form({ totalFullScore: '750' }), 'user-1')).toBeNull()
    expect(validateExamForm(form({ totalScore: '600' }), 'user-1')).toMatch(/总满分/)
  })

  it('preserves a rank-only comprehensive subject row', () => {
    const subjects = emptySubjects()
    subjects.math = { score: '', fullScore: '', rank: '8', participantCount: '200' }
    expect(validateExamForm(form({ subjects }), 'user-1')).toBeNull()
    expect(buildSubjectScoreInputs(form({ subjects }))).toContainEqual(
      { subject: 'math', score: null, full_score: null, rank_value: 8, participant_count: 200 },
    )
  })

  it('normalizes a single-subject test into exactly one primary-subject row', () => {
    const value = form({
      kind: 'single_subject',
      primarySubject: 'physics',
      totalScore: '88',
      totalFullScore: '100',
      rankValue: '12',
      participantCount: '260',
    })
    expect(validateExamForm(value, 'user-1')).toBeNull()
    expect(buildSubjectScoreInputs(value)).toEqual([
      { subject: 'physics', score: 88, full_score: 100, rank_value: 12, participant_count: 260 },
    ])
  })

  it('rejects invalid private ownership and inconsistent rankings', () => {
    expect(validateExamForm(form({ studentId: 'user-2', visibility: 'private' }), 'user-1')).toMatch(/只能创建给自己/)
    expect(validateExamForm(form({ rankValue: '201', participantCount: '200' }), 'user-1')).toMatch(/不能大于参考人数/)
  })

  it('rejects non-numeric values and subject scores above their full score', () => {
    expect(validateExamForm(form({ totalScore: 'abc', totalFullScore: '750' }), 'user-1')).toMatch(/只能填写数字/)
    const subjects = emptySubjects()
    subjects.english = { score: '101', fullScore: '100', rank: '', participantCount: '' }
    expect(validateExamForm(form({ subjects }), 'user-1')).toMatch(/0 到满分/)
  })

  it('derives five live section states, score rate and pending image count', () => {
    const summary = deriveExamFormSummary(form({ totalScore: '600', totalFullScore: '750' }), 3, 'user-1')
    expect(summary.sections).toHaveLength(5)
    expect(summary.sections.find((section) => section.id === 'basics')?.status).toBe('complete')
    expect(summary.sections.find((section) => section.id === 'results')?.status).toBe('complete')
    expect(summary.sections.find((section) => section.id === 'attachments')?.detail).toBe('待上传 3 张')
    expect(summary.scoreRate).toBe(80)
    expect(summary.missingFields).toEqual([])
    expect(summary.pendingImageCount).toBe(3)
  })

  it('surfaces required and incomplete subject fields in the live summary', () => {
    const subjects = emptySubjects()
    subjects.math = { score: '88', fullScore: '', rank: '', participantCount: '' }
    const summary = deriveExamFormSummary(form({ title: '', subjects }), 0, 'user-1')
    expect(summary.sections.find((section) => section.id === 'basics')?.status).toBe('needs-attention')
    expect(summary.sections.find((section) => section.id === 'subjects')?.status).toBe('needs-attention')
    expect(summary.missingFields).toEqual(['考试名称', '数学满分'])
  })
})
