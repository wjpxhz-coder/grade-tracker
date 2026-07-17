import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquareText, RotateCcw, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState'
import { LoadingScreen } from '../components/LoadingScreen'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { listDeletedAttachments, listDeletedNotes, listExams, restoreAttachment, restoreExam, restoreNote } from '../lib/api'
import { daysUntilPurge, formatDate, formatDateTime } from '../lib/format'
import type { Exam } from '../types/domain'

export function TrashPage() {
  const { profiles, user } = useAuth()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['exams', 'trash'], queryFn: () => listExams({ deleted: true }) })
  const allExamsQuery = useQuery({ queryKey: ['exams', 'trash-context'], queryFn: () => listExams() })
  const attachmentsQuery = useQuery({ queryKey: ['attachments', 'trash'], queryFn: listDeletedAttachments })
  const notesQuery = useQuery({ queryKey: ['notes', 'trash'], queryFn: listDeletedNotes })
  const restore = useMutation({
    mutationFn: (exam: Exam) => restoreExam(exam),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['exams'] }); showToast('考试记录已恢复', 'success') },
    onError: (error) => showToast(error.message, 'error'),
  })
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
  const examMap = new Map([...(query.data ?? []), ...(allExamsQuery.data ?? [])].map((exam) => [exam.id, exam]))

  if (query.isLoading || attachmentsQuery.isLoading || notesQuery.isLoading) return <LoadingScreen label="正在查看回收站…" />
  if (query.error || attachmentsQuery.error || notesQuery.error) return <ErrorState error={query.error ?? attachmentsQuery.error ?? notesQuery.error} onRetry={() => { void query.refetch(); void attachmentsQuery.refetch(); void notesQuery.refetch() }} />

  async function handleRestoreAttachment(id: string) {
    try {
      await restoreAttachment(id)
      await Promise.all([attachmentsQuery.refetch(), queryClient.invalidateQueries({ queryKey: ['exam'] })])
      showToast('图片已恢复', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '恢复图片失败', 'error')
    }
  }

  async function handleRestoreNote(id: string) {
    try {
      await restoreNote(id)
      await Promise.all([notesQuery.refetch(), queryClient.invalidateQueries({ queryKey: ['exam'] })])
      showToast('心得已恢复', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '恢复心得失败', 'error')
    }
  }

  return (
    <div className="page">
      <PageHeader eyebrow="安全恢复" title="回收站" description="删除的考试、图片和心得保留 30 天，之后自动永久清除。" />
      {query.data?.length ? <><h2 className="trash-heading">已删除考试</h2><div className="trash-list">{query.data.map((exam) => <article className="trash-card" key={exam.id}><span className="trash-card__icon"><Trash2 /></span><div><h2>{exam.title}</h2><p>{profileMap.get(exam.student_id)?.display_name ?? '成员'} · {formatDate(exam.exam_date)}</p><small>删除于 {formatDateTime(exam.deleted_at!)} · 还可保留约 {daysUntilPurge(exam.deleted_at!)} 天</small></div><button className="button button--secondary" type="button" disabled={restore.isPending} onClick={() => restore.mutate(exam)}><RotateCcw size={16} />恢复</button></article>)}</div></> : null}
      {attachmentsQuery.data?.length ? <><h2 className="trash-heading">单独删除的图片</h2><div className="trash-list">{attachmentsQuery.data.map((attachment) => { const exam = examMap.get(attachment.exam_id); return <article className="trash-card" key={attachment.id}><span className="trash-card__icon"><Trash2 /></span><div><h2>{attachment.original_name}</h2><p>来自：{exam?.title ?? '考试记录'}</p><small>删除于 {formatDateTime(attachment.deleted_at!)} · 还可保留约 {daysUntilPurge(attachment.deleted_at!)} 天</small></div><button className="button button--secondary" type="button" onClick={() => void handleRestoreAttachment(attachment.id)}><RotateCcw size={16} />恢复图片</button></article> })}</div></> : null}
      {notesQuery.data?.length ? <><h2 className="trash-heading">已删除心得</h2><div className="trash-list">{notesQuery.data.map((note) => { const exam = examMap.get(note.exam_id); const canRestore = note.author_id === user?.id && !exam?.deleted_at; return <article className="trash-card" key={note.id}><span className="trash-card__icon"><MessageSquareText /></span><div><h2>{note.content.slice(0, 60)}{note.content.length > 60 ? '…' : ''}</h2><p>{profileMap.get(note.author_id)?.display_name ?? '成员'} · 来自：{exam?.title ?? '考试记录'}</p><small>删除于 {formatDateTime(note.deleted_at!)} · 还可保留约 {daysUntilPurge(note.deleted_at!)} 天</small></div>{canRestore ? <button className="button button--secondary" type="button" onClick={() => void handleRestoreNote(note.id)}><RotateCcw size={16} />恢复心得</button> : <span className="trash-card__reason">{exam?.deleted_at ? '请先恢复考试' : '仅作者可恢复'}</span>}</article> })}</div></> : null}
      {!query.data?.length && !attachmentsQuery.data?.length && !notesQuery.data?.length ? <section className="empty-state"><Trash2 size={34} /><h2>回收站是空的</h2><p>误删的考试、图片和心得会在这里等待 30 天。</p><Link className="button button--secondary" to="/settings">返回数据与恢复</Link></section> : null}
    </div>
  )
}
