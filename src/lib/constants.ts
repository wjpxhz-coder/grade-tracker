import type { AttachmentCategory } from '../types/domain'
import type { SubjectCode } from './score'

export const SUBJECT_LABELS: Record<SubjectCode, string> = {
  chinese: '语文',
  math: '数学',
  english: '英语',
  biology: '生物',
  chemistry: '化学',
  physics: '物理',
}

export const DEFAULT_SUBJECT_FULL_SCORES: Record<SubjectCode, number> = {
  chinese: 150,
  math: 150,
  english: 150,
  biology: 100,
  chemistry: 100,
  physics: 100,
}

export const ATTACHMENT_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  answer_sheet: '答题卡',
  paper: '试卷',
  correction: '订正',
  other: '其他',
}

export const PROFILE_ACCENTS: Record<string, string> = {
  sage: '#4f7c6a',
  peach: '#c57c5d',
}
