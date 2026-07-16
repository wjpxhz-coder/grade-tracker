import type { User } from '@supabase/supabase-js'
import type {
  Attachment,
  AttachmentCategory,
  AuditEvent,
  Exam,
  ExamInput,
  ExamNote,
  ExamWithRelations,
  LoginProfile,
  Profile,
  SpaceMember,
  StorageUsage,
  SubjectScore,
} from '../types/domain'
import { ATTACHMENT_BUCKET, supabase } from './supabase'
import { adaptHeic2Any, isHeicImage, optimizeImage } from './image'

function fail(message: string, cause?: unknown): never {
  const detail = cause instanceof Error ? cause.message : String(cause ?? '')
  throw new Error(detail ? `${message}：${detail}` : message)
}

function isVersionConflict(error: { message?: string; details?: string } | null): boolean {
  return Boolean(error && /version_conflict|expected=.*actual=/i.test(`${error.message ?? ''} ${error.details ?? ''}`))
}

export async function listLoginProfiles(): Promise<LoginProfile[]> {
  const { data, error } = await supabase
    .from('login_profiles')
    .select('id, display_name, login_alias, login_email, color_key')
    .order('login_alias')
  if (error) fail('无法读取登录账号', error)
  return (data ?? []) as LoginProfile[]
}

export async function signIn(loginEmail: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: loginEmail,
    password,
  })
  if (error) fail('登录失败，请检查口令', error)
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) fail('退出登录失败', error)
}

export async function getProfile(user: User): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, login_alias, color_key, created_at, updated_at')
    .eq('id', user.id)
    .single()
  if (error) fail('无法读取个人资料', error)
  return data as Profile
}

export async function getMembership(userId: string): Promise<SpaceMember> {
  const { data, error } = await supabase
    .from('space_members')
    .select('space_id, user_id, joined_at')
    .eq('user_id', userId)
    .single()
  if (error) fail('账号尚未加入双人空间', error)
  return data as SpaceMember
}

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, login_alias, color_key, created_at, updated_at')
    .order('created_at')
  if (error) fail('无法读取空间成员', error)
  return (data ?? []) as Profile[]
}

export async function listExams(options: {
  studentId?: string
  deleted?: boolean
} = {}): Promise<Exam[]> {
  let query = supabase.from('exams').select('*')
  query = options.deleted ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null)
  if (options.studentId) query = query.eq('student_id', options.studentId)
  const { data, error } = await query.order('exam_date', { ascending: false }).order('created_at', { ascending: false })
  if (error) fail('无法读取考试记录', error)
  return (data ?? []) as Exam[]
}

export async function listSubjectScores(examIds?: string[]): Promise<SubjectScore[]> {
  if (examIds?.length === 0) return []
  let query = supabase.from('subject_scores').select('*')
  if (examIds) query = query.in('exam_id', examIds)
  const { data, error } = await query.order('subject')
  if (error) fail('无法读取分科成绩', error)
  return (data ?? []) as SubjectScore[]
}

export async function getExamDetails(examId: string): Promise<ExamWithRelations> {
  const [examResult, subjectsResult, notesResult, attachmentsResult, auditResult] = await Promise.all([
    supabase.from('exams').select('*').eq('id', examId).single(),
    supabase.from('subject_scores').select('*').eq('exam_id', examId).order('subject'),
    supabase.from('exam_notes').select('*').eq('exam_id', examId).is('deleted_at', null).order('created_at'),
    supabase.from('attachments').select('*').eq('exam_id', examId).is('deleted_at', null).order('page_order'),
    supabase.from('audit_events').select('*').eq('exam_id', examId).order('created_at', { ascending: false }).limit(50),
  ])
  if (examResult.error) fail('无法读取考试详情', examResult.error)
  if (subjectsResult.error) fail('无法读取分科成绩', subjectsResult.error)
  if (notesResult.error) fail('无法读取心得', notesResult.error)
  if (attachmentsResult.error) fail('无法读取图片', attachmentsResult.error)
  if (auditResult.error) fail('无法读取修改记录', auditResult.error)
  return {
    ...(examResult.data as Exam),
    subject_scores: (subjectsResult.data ?? []) as SubjectScore[],
    exam_notes: (notesResult.data ?? []) as ExamNote[],
    attachments: (attachmentsResult.data ?? []) as Attachment[],
    audit_events: (auditResult.data ?? []) as AuditEvent[],
  }
}

export async function saveExam(input: ExamInput, expectedVersion?: number): Promise<Exam> {
  const { data, error } = await supabase.rpc('save_exam', {
    payload: input,
    expected_version: expectedVersion ?? null,
  })
  if (error) {
    if (isVersionConflict(error)) {
      throw new Error('这条考试记录已被另一方修改，请刷新后再保存。')
    }
    fail('保存考试失败', error)
  }
  return (Array.isArray(data) ? data[0] : data) as Exam
}

export async function softDeleteExam(exam: Pick<Exam, 'id' | 'version'>): Promise<Exam> {
  const { data, error } = await supabase.rpc('soft_delete_exam', {
    exam_id: exam.id,
    expected_version: exam.version,
  })
  if (isVersionConflict(error)) throw new Error('这条考试记录已被另一方修改，请刷新后再删除。')
  if (error) fail('移入回收站失败', error)
  return (Array.isArray(data) ? data[0] : data) as Exam
}

export async function restoreExam(exam: Pick<Exam, 'id' | 'version'>): Promise<Exam> {
  const { data, error } = await supabase.rpc('restore_exam', {
    exam_id: exam.id,
    expected_version: exam.version,
  })
  if (isVersionConflict(error)) throw new Error('这条考试记录已发生变化，请刷新回收站后再恢复。')
  if (error) fail('恢复考试失败', error)
  return (Array.isArray(data) ? data[0] : data) as Exam
}

export async function addNote(examId: string, authorId: string, content: string): Promise<ExamNote> {
  const { data, error } = await supabase
    .from('exam_notes')
    .insert({ exam_id: examId, author_id: authorId, content: content.trim() })
    .select('*')
    .single()
  if (error) fail('添加心得失败', error)
  return data as ExamNote
}

export async function updateNote(noteId: string, content: string): Promise<ExamNote> {
  const { data, error } = await supabase
    .from('exam_notes')
    .update({ content: content.trim() })
    .eq('id', noteId)
    .select('*')
    .single()
  if (error) fail('修改心得失败', error)
  return data as ExamNote
}

export async function deleteNote(noteId: string): Promise<void> {
  const { error } = await supabase
    .from('exam_notes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', noteId)
    .is('deleted_at', null)
    .select('id')
    .single()
  if (error) fail('删除心得失败', error)
}

export async function listDeletedNotes(): Promise<ExamNote[]> {
  const { data, error } = await supabase
    .from('exam_notes')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
  if (error) fail('无法读取已删除心得', error)
  return (data ?? []) as ExamNote[]
}

export async function restoreNote(noteId: string): Promise<void> {
  const { error } = await supabase
    .from('exam_notes')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', noteId)
    .not('deleted_at', 'is', null)
    .select('id')
    .single()
  if (error) fail('恢复心得失败', error)
}

async function heicConverter() {
  const module = await import('heic2any')
  return adaptHeic2Any(module.default)
}

export async function uploadExamImage(options: {
  file: File
  exam: Exam
  uploaderId: string
  category: AttachmentCategory
  pageOrder: number
}): Promise<Attachment> {
  const converted = await optimizeImage(options.file, {
    heicConverter: isHeicImage(options.file) ? await heicConverter() : undefined,
  })
  const objectId = crypto.randomUUID()
  const extension = converted.image.type === 'image/webp' ? 'webp' : 'jpg'
  const prefix = `${options.exam.space_id}/${options.exam.id}/${objectId}`
  const storagePath = `${prefix}.${extension}`
  const thumbnailPath = `${prefix}-thumb.${extension}`

  const fullUpload = await supabase.storage.from(ATTACHMENT_BUCKET).upload(storagePath, converted.image, {
    contentType: converted.image.type,
    cacheControl: '3600',
    upsert: false,
  })
  if (fullUpload.error) fail('上传高清图片失败', fullUpload.error)

  const thumbnailUpload = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(thumbnailPath, converted.thumbnail, {
      contentType: converted.thumbnail.type,
      cacheControl: '3600',
      upsert: false,
    })
  if (thumbnailUpload.error) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([storagePath])
    fail('上传缩略图失败', thumbnailUpload.error)
  }

  const { data, error } = await supabase
    .from('attachments')
    .insert({
      id: objectId,
      exam_id: options.exam.id,
      uploader_id: options.uploaderId,
      category: options.category,
      storage_path: storagePath,
      thumbnail_path: thumbnailPath,
      original_name: options.file.name,
      mime_type: converted.image.type,
      byte_size: converted.image.size,
      thumbnail_byte_size: converted.thumbnail.size,
      width: converted.width,
      height: converted.height,
      page_order: options.pageOrder,
      sha256: converted.sha256,
    })
    .select('*')
    .single()
  if (error) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([storagePath, thumbnailPath])
    if (error.code === '23505') throw new Error('这张图片已经上传过了。')
    fail('保存图片信息失败', error)
  }
  return data as Attachment
}

export async function softDeleteAttachment(attachment: Attachment, userId: string): Promise<void> {
  const { error } = await supabase
    .from('attachments')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', attachment.id)
    .is('deleted_at', null)
    .select('id')
    .single()
  if (error) fail('删除图片失败', error)
}

export async function listDeletedAttachments(): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
  if (error) fail('无法读取已删除图片', error)
  return (data ?? []) as Attachment[]
}

export async function restoreAttachment(attachmentId: string): Promise<void> {
  const { error } = await supabase
    .from('attachments')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', attachmentId)
    .not('deleted_at', 'is', null)
    .select('id')
    .single()
  if (error?.code === '23505') throw new Error('当前考试中已有相同图片，不能重复恢复。')
  if (error) fail('恢复图片失败', error)
}

export async function createAttachmentUrls(attachment: Attachment): Promise<{ full: string; thumbnail: string }> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrls([attachment.storage_path, attachment.thumbnail_path], 10 * 60)
  if (error) fail('读取私有图片失败', error)
  return {
    full: data?.[0]?.signedUrl ?? '',
    thumbnail: data?.[1]?.signedUrl ?? '',
  }
}

export async function downloadAttachment(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).download(path)
  if (error || !data) fail('下载图片失败', error)
  return data
}

export async function getStorageUsage(): Promise<StorageUsage> {
  const { data, error } = await supabase.rpc('get_storage_usage')
  if (error) fail('无法读取存储用量', error)
  const value = Array.isArray(data) ? data[0] : data
  return (value ?? { used_bytes: 0, file_count: 0 }) as StorageUsage
}

export interface ExportSnapshot {
  profiles: Profile[]
  exams: Exam[]
  subjectScores: SubjectScore[]
  notes: ExamNote[]
  attachments: Attachment[]
}

export async function loadExportSnapshot(): Promise<ExportSnapshot> {
  const [profiles, exams, subjectScores, notes, attachments] = await Promise.all([
    supabase.from('profiles').select('id, display_name, login_alias, color_key, created_at, updated_at'),
    supabase.from('exams').select('*').order('exam_date'),
    supabase.from('subject_scores').select('*').order('exam_id'),
    supabase.from('exam_notes').select('*').order('created_at'),
    supabase.from('attachments').select('*').order('exam_id').order('page_order'),
  ])
  for (const result of [profiles, exams, subjectScores, notes, attachments]) {
    if (result.error) fail('准备导出数据失败', result.error)
  }
  return {
    profiles: (profiles.data ?? []) as Profile[],
    exams: (exams.data ?? []) as Exam[],
    subjectScores: (subjectScores.data ?? []) as SubjectScore[],
    notes: (notes.data ?? []) as ExamNote[],
    attachments: (attachments.data ?? []) as Attachment[],
  }
}
