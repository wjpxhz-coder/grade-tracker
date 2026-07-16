import type { ExamKind, RankScope, SubjectCode } from '../lib/score'

export type Visibility = 'shared' | 'private'
export type AttachmentCategory = 'answer_sheet' | 'paper' | 'correction' | 'other'

export interface LoginProfile {
  id: string
  display_name: string
  login_alias: string
  login_email: string
  color_key: 'sage' | 'peach' | string
}

export interface Profile {
  id: string
  display_name: string
  login_alias: string
  color_key: string
  created_at?: string
  updated_at?: string
}

export interface SpaceMember {
  space_id: string
  user_id: string
  joined_at?: string
}

export interface Exam {
  id: string
  space_id: string
  student_id: string
  title: string
  exam_date: string
  kind: ExamKind
  primary_subject: SubjectCode | null
  total_score: number | null
  total_full_score: number | null
  rank_value: number | null
  participant_count: number | null
  rank_scope: RankScope | null
  visibility: Visibility
  academic_year: string | null
  term: string | null
  category: string | null
  created_by: string
  updated_by: string
  version: number
  created_at: string
  updated_at: string
  deleted_at: string | null
  deleted_by: string | null
}

export interface SubjectScore {
  id: string
  exam_id: string
  subject: SubjectCode
  score: number | null
  full_score: number | null
  rank_value: number | null
  participant_count: number | null
  created_at?: string
  updated_at?: string
}

export interface ExamNote {
  id: string
  exam_id: string
  author_id: string
  content: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Attachment {
  id: string
  exam_id: string
  uploader_id: string
  category: AttachmentCategory
  storage_path: string
  thumbnail_path: string
  original_name: string
  mime_type: string
  byte_size: number
  thumbnail_byte_size: number
  width: number | null
  height: number | null
  page_order: number
  sha256: string | null
  created_at: string
  deleted_at: string | null
  deleted_by: string | null
}

export interface AuditEvent {
  id: string
  space_id: string
  exam_id: string | null
  actor_id: string
  entity_type: string
  entity_id: string
  action: 'create' | 'update' | 'delete' | 'restore' | string
  changes: Record<string, unknown> | null
  created_at: string
}

export interface ExamWithRelations extends Exam {
  subject_scores: SubjectScore[]
  exam_notes: ExamNote[]
  attachments: Attachment[]
  audit_events: AuditEvent[]
}

export interface SubjectScoreInput {
  subject: SubjectCode
  score: number | null
  full_score: number | null
  rank_value?: number | null
  participant_count?: number | null
}

export interface ExamInput {
  id?: string
  space_id: string
  student_id: string
  title: string
  exam_date: string
  kind: ExamKind
  primary_subject: SubjectCode | null
  total_score: number | null
  total_full_score: number | null
  rank_value: number | null
  participant_count: number | null
  rank_scope: RankScope | null
  visibility: Visibility
  academic_year: string | null
  term: string | null
  category: string | null
  subject_scores: SubjectScoreInput[]
}

export interface StorageUsage {
  used_bytes: number
  file_count: number
}
