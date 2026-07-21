import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, Edit3, History, ImagePlus, LoaderCircle, LockKeyhole, MessageSquarePlus, RotateCcw, Trash2, Upload, Users, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AiImageAnalysisPanel } from '../components/AiImageAnalysisPanel'
import { AttachmentTile } from '../components/AttachmentTile'
import { ErrorState } from '../components/ErrorState'
import { LoadingScreen } from '../components/LoadingScreen'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { addNote, deleteNote, getExamDetails, listExams, listSubjectScores, restoreExam, softDeleteAttachment, softDeleteExam, updateNote, uploadExamImage } from '../lib/api'
import { ATTACHMENT_CATEGORY_LABELS, SUBJECT_LABELS } from '../lib/constants'
import { formatDate, formatDateTime, formatScore } from '../lib/format'
import { deriveComparableExamInsights, type ComparableExamInsight } from '../lib/insights'
import { calculateRankPercentile, calculateScoreRate, type SubjectCode } from '../lib/score'
import type { AttachmentCategory, AuditEvent, ExamNote, Profile } from '../types/domain'

const AUDIT_FIELD_LABELS: Record<string, string> = {
  title: '名称', exam_date: '日期', kind: '类型', primary_subject: '科目',
  total_score: '分数', total_full_score: '满分', rank_value: '排名',
  participant_count: '参考人数', visibility: '可见范围', academic_year: '学年',
  term: '学期', category: '分类',
}

function auditDescription(event: AuditEvent): string {
  const changes = event.changes as { old?: Record<string, unknown>; new?: Record<string, unknown> } | null
  const oldData = changes?.old ?? {}
  const newData = changes?.new ?? {}
  if (event.entity_type === 'exam') {
    if (event.action === 'create') return '创建了这场考试'
    if (event.action === 'delete') return '将考试移入了回收站'
    if (event.action === 'restore') return '恢复了这场考试'
    const fields = Object.keys(AUDIT_FIELD_LABELS).filter((key) => oldData[key] !== newData[key]).map((key) => AUDIT_FIELD_LABELS[key])
    return fields.length ? `修改了考试的${fields.slice(0, 4).join('、')}${fields.length > 4 ? '等信息' : ''}` : '更新了考试记录'
  }
  if (event.entity_type === 'subject_score') {
    const subject = String(newData.subject ?? oldData.subject ?? '')
    const label = SUBJECT_LABELS[subject as keyof typeof SUBJECT_LABELS] ?? '分科'
    return event.action === 'create' ? `添加了${label}成绩` : event.action === 'delete' ? `删除了${label}成绩` : `修改了${label}成绩`
  }
  const entity = event.entity_type === 'exam_note' ? '心得' : event.entity_type === 'attachment' ? '图片' : '内容'
  const verb = event.action === 'create' ? '添加了' : event.action === 'delete' ? '删除了' : event.action === 'restore' ? '恢复了' : '修改了'
  return `${verb}${entity}`
}

function comparisonCopy(insight: ComparableExamInsight | undefined): { value: string; detail: string } {
  if (!insight) return { value: '首次可比记录', detail: '有同类历史记录后显示变化' }
  if (insight.scoreRateDelta !== null) {
    const sign = insight.scoreRateDelta > 0 ? '+' : ''
    return { value: `${sign}${insight.scoreRateDelta.toFixed(1)} 个百分点`, detail: `${insight.comparisonLabel} · 得分率` }
  }
  if (insight.rankPercentileDelta !== null) {
    const sign = insight.rankPercentileDelta > 0 ? '+' : ''
    return { value: `${sign}${insight.rankPercentileDelta.toFixed(1)} 个百分点`, detail: `${insight.comparisonLabel} · 排名百分位` }
  }
  if (insight.rankChange !== null) {
    const sign = insight.rankChange > 0 ? '+' : ''
    return { value: `${sign}${insight.rankChange} 名`, detail: `${insight.comparisonLabel} · 名次变化` }
  }
  return { value: insight.comparisonLabel, detail: '暂无足够数据计算变化' }
}

export function AuditDrawer({ open, onClose, events, profileMap, returnFocusRef }: {
  open: boolean
  onClose: () => void
  events: AuditEvent[]
  profileMap: Map<string, Profile>
  returnFocusRef: RefObject<HTMLButtonElement | null>
}) {
  const titleId = useId()
  const descriptionId = useId()
  const drawerRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !drawerRef.current) return
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )]
      if (!focusable.length) {
        event.preventDefault()
        drawerRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!drawerRef.current.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      returnFocusRef.current?.focus()
    }
  }, [onClose, open, returnFocusRef])

  if (!open) return null

  return (
    <div className="audit-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside
        ref={drawerRef}
        className="audit-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header className="audit-drawer__header">
          <div>
            <p className="eyebrow">协作记录</p>
            <h2 id={titleId}>活动记录</h2>
            <p id={descriptionId}>按时间倒序显示这场考试的最近修改。</p>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="关闭活动记录"><X /></button>
        </header>
        <div className="audit-drawer__body">
          {events.length ? (
            <ol className="audit-list">
              {events.map((event) => (
                <li key={event.id}>
                  <ProfileAvatar profile={profileMap.get(event.actor_id)} size="small" />
                  <div>
                    <p><strong>{profileMap.get(event.actor_id)?.display_name ?? '成员'}</strong>{auditDescription(event)}</p>
                    <time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time>
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="muted-copy">暂无修改记录。</p>}
        </div>
      </aside>
    </div>
  )
}

export function ExamDetailPage() {
  const { examId } = useParams()
  const { user, profiles } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [newNote, setNewNote] = useState('')
  const [editingNote, setEditingNote] = useState<ExamNote | null>(null)
  const [category, setCategory] = useState<AttachmentCategory>('answer_sheet')
  const [attachmentSubject, setAttachmentSubject] = useState<SubjectCode | ''>('')
  const [uploadStatus, setUploadStatus] = useState('')
  const [auditOpen, setAuditOpen] = useState(false)
  const auditButtonRef = useRef<HTMLButtonElement>(null)
  const closeAudit = useCallback(() => setAuditOpen(false), [])
  const query = useQuery({ queryKey: ['exam', examId], queryFn: () => getExamDetails(examId!), enabled: Boolean(examId) })
  const exam = query.data
  const historyQuery = useQuery({
    queryKey: ['exams', exam?.student_id ?? 'detail-pending', 'active'],
    queryFn: () => listExams({ studentId: exam!.student_id }),
    enabled: Boolean(exam?.student_id),
  })
  const historyExamIds = historyQuery.data?.map((item) => item.id) ?? []
  const historyScoresQuery = useQuery({
    queryKey: ['subject-scores', ...historyExamIds],
    queryFn: () => listSubjectScores(historyExamIds),
    enabled: historyQuery.isSuccess,
  })
  const comparableInsight = useMemo(() => {
    if (!exam || !historyQuery.data || !historyScoresQuery.data) return undefined
    return deriveComparableExamInsights(historyQuery.data, historyScoresQuery.data).get(exam.id)
  }, [exam, historyQuery.data, historyScoresQuery.data])
  const comparison = comparisonCopy(comparableInsight)
  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const owner = exam ? profileMap.get(exam.student_id) : undefined
  const scoreRate = exam ? calculateScoreRate(exam.total_score, exam.total_full_score) : null
  const rankPercentile = exam ? calculateRankPercentile(exam.rank_value, exam.participant_count) : null
  const canEdit = Boolean(exam && !exam.deleted_at && (exam.visibility === 'shared' || exam.student_id === user?.id))

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['exam', examId] }),
      queryClient.invalidateQueries({ queryKey: ['exams'] }),
      queryClient.invalidateQueries({ queryKey: ['subject-scores'] }),
      queryClient.invalidateQueries({ queryKey: ['storage-usage'] }),
    ])
  }

  const noteMutation = useMutation({
    mutationFn: async () => {
      const content = (editingNote?.content ?? newNote).trim()
      if (!content) throw new Error('请先写下一点心得。')
      return editingNote ? updateNote(editingNote.id, content) : addNote(examId!, user!.id, content)
    },
    onSuccess: async () => { setNewNote(''); setEditingNote(null); await invalidate(); showToast('心得已保存', 'success') },
    onError: (error) => showToast(error.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => softDeleteExam(exam!),
    onSuccess: async () => { await invalidate(); showToast('已移入回收站，可在 30 天内恢复', 'success'); void navigate('/trash') },
    onError: (error) => showToast(error.message, 'error'),
  })
  const restoreMutation = useMutation({
    mutationFn: () => restoreExam(exam!),
    onSuccess: async () => { await invalidate(); showToast('考试记录已恢复', 'success') },
    onError: (error) => showToast(error.message, 'error'),
  })

  async function handleFiles(files: FileList | null) {
    if (!files?.length || !exam || !user) return
    const array = [...files]
    let successCount = 0
    try {
      for (let index = 0; index < array.length; index += 1) {
        setUploadStatus(`正在优化并上传 ${index + 1} / ${array.length}`)
        await uploadExamImage({
          file: array[index],
          exam,
          uploaderId: user.id,
          category,
          subject: exam.kind === 'single_subject' ? exam.primary_subject : (attachmentSubject || null),
          pageOrder: exam.attachments.length + index,
        })
        successCount += 1
      }
      showToast(`${array.length} 张图片已安全上传`, 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片上传失败'
      showToast(successCount ? `已成功上传 ${successCount} 张；下一张失败：${message}` : message, 'error')
    } finally {
      if (successCount) await invalidate()
      setUploadStatus('')
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  if (query.isLoading) return <LoadingScreen label="正在翻开这次考试…" />
  if (query.error || !exam) return <ErrorState error={query.error ?? new Error('没有找到这场考试')} onRetry={() => void query.refetch()} />

  return (
    <div className="page detail-page">
      <header className="detail-header">
        <Link to="/exams" className="icon-button" aria-label="返回考试列表"><ArrowLeft /></Link>
        <div className="detail-header__main"><div className="detail-header__badges"><span>{exam.kind === 'comprehensive' ? '综合考试' : '单科测验'}</span>{exam.visibility === 'private' ? <span><LockKeyhole size={13} />仅自己可见</span> : <span><Users size={13} />双方可见</span>}{exam.deleted_at ? <span className="badge-danger">回收站</span> : null}</div><h1>{exam.title}</h1><p><CalendarDays size={15} />{formatDate(exam.exam_date)} · {owner?.display_name ?? '成员'}的成绩{exam.category ? ` · ${exam.category}` : ''}</p></div>
        <div className="detail-header__actions">
          <button ref={auditButtonRef} className="button button--ghost" type="button" onClick={() => setAuditOpen(true)} aria-haspopup="dialog"><History size={16} />活动记录{exam.audit_events.length ? <span className="button__count">{exam.audit_events.length}</span> : null}</button>
          {exam.deleted_at ? <button className="button button--primary" type="button" onClick={() => restoreMutation.mutate()} disabled={restoreMutation.isPending}><RotateCcw size={16} />恢复</button> : <><Link className="button button--secondary" to={`/exams/${exam.id}/edit`}><Edit3 size={16} />共同编辑</Link><button className="icon-button icon-button--danger" type="button" onClick={() => { if (window.confirm('移入回收站后，30 天内可以恢复。确定继续吗？')) deleteMutation.mutate() }} aria-label="移入回收站"><Trash2 /></button></>}
        </div>
      </header>

      {exam.deleted_at ? <div className="deleted-banner">这条记录已在 {formatDateTime(exam.deleted_at)} 移入回收站。恢复后才能继续编辑。</div> : null}

      <section className="detail-summary-band" aria-label="成绩摘要">
        <div className="detail-summary-band__primary">
          <span>总成绩</span>
          <strong>{formatScore(exam.total_score, exam.total_full_score)}</strong>
          <small>{scoreRate === null ? '得分率未计算' : `得分率 ${scoreRate.toFixed(1)}%`}</small>
        </div>
        <div className={`detail-summary-band__insight detail-summary-band__insight--${comparableInsight?.tone ?? 'neutral'}`}>
          <span>可比变化</span>
          <strong>{comparison.value}</strong>
          <small>{comparison.detail}</small>
        </div>
        <div>
          <span>年级排名</span>
          <strong>{exam.rank_value === null ? '未录入' : `第 ${exam.rank_value} 名`}</strong>
          <small>{rankPercentile === null ? (exam.participant_count ? `共 ${exam.participant_count} 人` : '参考人数未录入') : `排名百分位 ${rankPercentile.toFixed(1)}`}</small>
        </div>
        <div>
          <span>最近修改</span>
          <strong>{profileMap.get(exam.updated_by)?.display_name ?? '成员'}</strong>
          <small>{formatDateTime(exam.updated_at)} · v{exam.version}</small>
        </div>
      </section>

      <div className="detail-columns">
        <div className="detail-primary">
          <section className="panel detail-section">
            <div className="section-heading"><div><p className="eyebrow">分科成绩</p><h2>六科明细</h2></div></div>
            {exam.subject_scores.length ? (
              <div className="subject-performance-list">
                {exam.subject_scores.map((item) => {
                  const itemRate = calculateScoreRate(item.score, item.full_score)
                  return (
                    <div className="subject-performance" key={item.id}>
                      <div className="subject-performance__heading">
                        <strong>{SUBJECT_LABELS[item.subject]}</strong>
                        <span>得分 {formatScore(item.score, item.full_score)}</span>
                      </div>
                      <div className="subject-performance__meta">
                        <span>{itemRate === null ? '得分率未计算' : `得分率 ${itemRate.toFixed(1)}%`}</span>
                        <span>{item.rank_value === null ? '排名未录入' : `排名 第 ${item.rank_value} 名`}</span>
                        {item.participant_count === null ? null : <span>参考 {item.participant_count} 人</span>}
                      </div>
                      {itemRate === null ? (
                        <p className="subject-performance__missing">缺少有效得分或满分，未显示比例。</p>
                      ) : (
                        <div className="subject-performance__track" role="progressbar" aria-label={`${SUBJECT_LABELS[item.subject]}得分率`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(Math.min(100, Math.max(0, itemRate)).toFixed(1))}>
                          <span style={{ width: `${Math.min(100, Math.max(0, itemRate))}%` }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : <p className="muted-copy">这次考试没有录入分科成绩。</p>}
          </section>

          <section className="panel detail-section">
            <div className="section-heading"><div><p className="eyebrow">试卷与答题卡</p><h2>图片资料</h2></div>{canEdit ? <div className="upload-actions">{exam.kind === 'comprehensive' ? <select aria-label="图片所属科目" value={attachmentSubject} onChange={(event) => setAttachmentSubject(event.target.value as SubjectCode | '')}><option value="">不指定科目</option>{Object.entries(SUBJECT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : null}<select aria-label="图片类别" value={category} onChange={(event) => setCategory(event.target.value as AttachmentCategory)}>{Object.entries(ATTACHMENT_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="button button--secondary" type="button" onClick={() => fileInput.current?.click()} disabled={Boolean(uploadStatus)}>{uploadStatus ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}{uploadStatus || '上传图片'}</button><input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/webp,.heic,.heif" multiple onChange={(event) => void handleFiles(event.target.files)} /></div> : null}</div>
            {exam.attachments.length ? <div className="attachment-grid">{exam.attachments.map((attachment) => <AttachmentTile key={attachment.id} attachment={attachment} canEdit={canEdit} onDelete={() => { if (window.confirm('这张图片将随记录保留 30 天后永久删除。')) void softDeleteAttachment(attachment, user!.id).then(invalidate).then(() => showToast('图片已移入回收状态', 'success')).catch((error: Error) => showToast(error.message, 'error')) }} />)}</div> : <div className="empty-inline"><ImagePlus size={26} /><div><strong>还没有图片</strong><p>上传前会自动压缩、纠正方向并移除 EXIF 信息。</p></div>{canEdit ? <button className="button button--secondary" type="button" onClick={() => fileInput.current?.click()}>选择图片</button> : null}</div>}
          </section>

          <AiImageAnalysisPanel examId={exam.id} attachments={exam.attachments} canAnalyze={canEdit} />

          <section className="panel detail-section">
            <div className="section-heading"><div><p className="eyebrow">心得时间线</p><h2>当时怎么想</h2></div></div>
            {canEdit ? <div className="note-composer"><ProfileAvatar profile={profileMap.get(user!.id)} /><div><textarea value={editingNote?.content ?? newNote} onChange={(event) => editingNote ? setEditingNote({ ...editingNote, content: event.target.value }) : setNewNote(event.target.value)} placeholder="做得好的、失误原因、下一步行动……" maxLength={4000} /><div><small>{(editingNote?.content ?? newNote).length} / 4000</small>{editingNote ? <button type="button" className="button button--ghost" onClick={() => setEditingNote(null)}>取消编辑</button> : null}<button className="button button--primary" type="button" onClick={() => noteMutation.mutate()} disabled={noteMutation.isPending}><MessageSquarePlus size={16} />{editingNote ? '保存修改' : '添加心得'}</button></div></div></div> : null}
            {exam.exam_notes.length ? <div className="notes-timeline">{exam.exam_notes.map((note) => { const author = profileMap.get(note.author_id); const mine = note.author_id === user?.id; return <article key={note.id}><ProfileAvatar profile={author} /><div><header><strong>{author?.display_name ?? '成员'}</strong><time>{formatDateTime(note.created_at)}{note.updated_at !== note.created_at ? ' · 已编辑' : ''}</time></header><p>{note.content}</p>{mine && canEdit ? <footer><button type="button" onClick={() => setEditingNote(note)}>编辑</button><button type="button" onClick={() => { if (window.confirm('确定删除这条心得吗？')) void deleteNote(note.id).then(invalidate).catch((error: Error) => showToast(error.message, 'error')) }}>删除</button></footer> : null}</div></article> })}</div> : <p className="muted-copy">还没有心得。写下此刻的判断，未来回看会更有意义。</p>}
          </section>
        </div>

      </div>
      <AuditDrawer open={auditOpen} onClose={closeAudit} events={exam.audit_events} profileMap={profileMap} returnFocusRef={auditButtonRef} />
    </div>
  )
}
