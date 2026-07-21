import type { User } from '@supabase/supabase-js'
import type {
  AiAttachmentInsight,
  AiImageAnalysisResult,
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
import { ATTACHMENT_BUCKET, PROFILE_AVATAR_BUCKET, supabase } from './supabase'
import { adaptHeic2Any, isHeicImage, optimizeImage } from './image'
import type { SubjectCode } from './score'

function fail(message: string, cause?: unknown): never {
  const detail = cause instanceof Error ? cause.message : String(cause ?? '')
  throw new Error(detail ? `${message}：${detail}` : message)
}

function isVersionConflict(error: { message?: string; details?: string } | null): boolean {
  return Boolean(error && /version_conflict|expected=.*actual=/i.test(`${error.message ?? ''} ${error.details ?? ''}`))
}

const AI_ANALYSIS_ERROR_MESSAGES: Record<string, string> = {
  invalid_json: '分析请求格式不正确，请刷新后重试。',
  invalid_request: '请选择有效的考试图片后重试。',
  too_many_attachments: '单批图片数量超过服务限制。',
  unauthorized: '登录已失效，请重新登录后再分析。',
  origin_not_allowed: '当前页面来源不允许调用 AI 分析。',
  exam_forbidden: '你没有权限分析这场考试的图片。',
  exam_not_found: '没有找到这场考试，可能已被删除。',
  method_not_allowed: 'AI 分析服务暂不接受这个请求。',
  server_not_configured: 'AI 分析服务尚未配置，请联系管理员。',
  provider_error: 'AI 服务暂时不可用，请稍后重试。',
  provider_auth_error: 'AI 服务认证配置无效，请联系管理员。',
  provider_rate_limited: 'AI 服务当前繁忙，请稍后重试。',
  provider_timeout: 'AI 分析等待超时，请稍后重试。',
  provider_unreachable: '暂时无法连接 AI 服务，请稍后重试。',
  provider_refusal: 'AI 未能分析这张图片，请检查图片内容后重试。',
  provider_incomplete: 'AI 返回的摘要不完整，请稍后重试。',
  invalid_provider_response: 'AI 返回内容无法保存，请稍后重试。',
  storage_download_failed: '无法读取原始图片，请重新上传或稍后重试。',
  invalid_image_size: '图片大小不符合分析要求，请重新上传后重试。',
  summary_save_failed: '摘要保存失败，请稍后重试。',
  invalid_attachment_selection: '所选图片无效或已被删除，请刷新后重试。',
  internal_error: 'AI 分析服务发生内部错误，请稍后重试。',
}

export function aiAnalysisErrorMessage(codeOrMessage?: string): string {
  if (!codeOrMessage) return 'AI 图片分析失败，请稍后重试。'
  return AI_ANALYSIS_ERROR_MESSAGES[codeOrMessage] ?? codeOrMessage
}

async function readFunctionErrorCode(error: unknown): Promise<string | undefined> {
  const context = (error as { context?: unknown } | null)?.context
  if (!(context instanceof Response)) return undefined
  try {
    const payload = await context.clone().json() as { error?: unknown }
    return typeof payload.error === 'string' ? payload.error : undefined
  } catch {
    return undefined
  }
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
    .select('id, display_name, login_alias, color_key, avatar_path, created_at, updated_at')
    .eq('id', user.id)
    .single()
  if (error) fail('无法读取个人资料', error)
  return data as Profile
}

export async function updateMyProfile(displayName: string, avatarPath: string | null): Promise<Profile> {
  const { data, error } = await supabase.rpc('update_my_profile', {
    p_display_name: displayName.trim(),
    p_avatar_path: avatarPath,
  })
  if (error) fail('保存个人资料失败', error)
  return (Array.isArray(data) ? data[0] : data) as Profile
}

export async function uploadProfileAvatar(userId: string, file: File): Promise<string> {
  const converted = await optimizeImage(file, {
    maxInputBytes: 10 * 1024 * 1024,
    maxLongEdge: 512,
    maxOutputBytes: 512 * 1024,
    quality: 0.84,
    outputType: 'image/webp',
    heicConverter: isHeicImage(file) ? await heicConverter() : undefined,
  })
  const path = `${userId}/${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).upload(path, converted.image, {
    contentType: 'image/webp',
    cacheControl: '3600',
    upsert: false,
  })
  if (error) fail('上传头像失败', error)
  return path
}

export async function deleteProfileAvatar(path: string): Promise<void> {
  const { error } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([path])
  if (error) fail('删除旧头像失败', error)
}

export async function createProfileAvatarUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).createSignedUrl(path, 60 * 60)
  if (error || !data?.signedUrl) fail('读取头像失败', error)
  return data.signedUrl
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
    .select('id, display_name, login_alias, color_key, avatar_path, created_at, updated_at')
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

export async function listAiAttachmentInsights(examId: string): Promise<AiAttachmentInsight[]> {
  const { data, error } = await supabase
    .from('ai_attachment_insights')
    .select('id, attachment_id, exam_id, sha256, model, prompt_version, title, summary, key_findings, confidence, details, usage, analyzed_by, created_at, updated_at')
    .eq('exam_id', examId)
    .order('updated_at', { ascending: false })
  if (error) fail('无法读取 AI 图片摘要', error)
  return (data ?? []) as AiAttachmentInsight[]
}

export async function analyzeExamImages(options: {
  examId: string
  attachmentIds?: string[]
  force?: boolean
}): Promise<AiImageAnalysisResult> {
  const { data, error } = await supabase.functions.invoke('analyze-exam-images', {
    body: {
      examId: options.examId,
      ...(options.attachmentIds ? { attachmentIds: options.attachmentIds } : {}),
      ...(options.force ? { force: true } : {}),
    },
  })
  if (error) {
    const code = await readFunctionErrorCode(error)
    throw new Error(aiAnalysisErrorMessage(code ?? error.message))
  }
  if (!data || typeof data !== 'object' || !Array.isArray((data as AiImageAnalysisResult).items)) {
    throw new Error(aiAnalysisErrorMessage('invalid_provider_response'))
  }
  return data as AiImageAnalysisResult
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
  subject?: SubjectCode | null
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
      subject: options.subject ?? null,
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
    supabase.from('profiles').select('id, display_name, login_alias, color_key, avatar_path, created_at, updated_at'),
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
