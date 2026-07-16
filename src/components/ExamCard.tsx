import { CalendarDays, ChevronRight, Image, LockKeyhole, MessageSquareText, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDate, formatScore } from '../lib/format'
import type { Exam, Profile } from '../types/domain'

export function ExamCard({ exam, profile, noteCount, attachmentCount }: {
  exam: Exam
  profile?: Profile
  noteCount?: number
  attachmentCount?: number
}) {
  return (
    <Link to={`/exams/${exam.id}`} className="exam-card">
      <div className="exam-card__date"><CalendarDays size={15} />{formatDate(exam.exam_date)}</div>
      <div className="exam-card__body">
        <div>
          <div className="exam-card__title-row">
            <h3>{exam.title}</h3>
            {exam.visibility === 'private' ? <LockKeyhole size={15} aria-label="仅自己可见" /> : null}
          </div>
          <p>{profile?.display_name ?? '成员'} · {exam.kind === 'comprehensive' ? '综合考试' : '单科测验'}</p>
        </div>
        <div className="exam-card__metrics">
          <span><strong>{formatScore(exam.total_score, exam.total_full_score)}</strong><small>总分</small></span>
          <span><strong>{exam.rank_value === null ? '—' : `第 ${exam.rank_value} 名`}</strong><small><Trophy size={12} />排名</small></span>
        </div>
      </div>
      <div className="exam-card__footer">
        {noteCount === undefined ? null : <span>{noteCount ? <><MessageSquareText size={14} />{noteCount} 条心得</> : '尚未写心得'}</span>}
        {attachmentCount === undefined ? null : <span>{attachmentCount ? <><Image size={14} />{attachmentCount} 张图片</> : '尚未上传图片'}</span>}
        <ChevronRight size={18} />
      </div>
    </Link>
  )
}
