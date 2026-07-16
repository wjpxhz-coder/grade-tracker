import { ArrowRight, BookOpenCheck, CalendarDays, Plus, Sparkles, TrendingUp, Trophy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExamCard } from '../components/ExamCard'
import { ErrorState } from '../components/ErrorState'
import { LoadingScreen } from '../components/LoadingScreen'
import { PageHeader } from '../components/PageHeader'
import { PersonSwitch } from '../components/PersonSwitch'
import { METRIC_LABELS, TrendCharts } from '../components/TrendCharts'
import { useAuth } from '../contexts/AuthContext'
import { useExamData } from '../hooks/useExamData'
import { calculateScoreRate, SUBJECT_CODES, type TrendMetric } from '../lib/score'

export function DashboardPage() {
  const { profile, profiles } = useAuth()
  const [studentId, setStudentId] = useState(profile?.id ?? '')
  const [metric, setMetric] = useState<TrendMetric>('total')
  useEffect(() => { if (!studentId && profile?.id) setStudentId(profile.id) }, [profile?.id, studentId])
  const { exams, subjectScores, isLoading, error, refetch } = useExamData(studentId)
  const selectedProfile = profiles.find((item) => item.id === studentId)
  const latest = exams[0]
  const scoreRate = latest ? calculateScoreRate(latest.total_score, latest.total_full_score) : null
  const metrics: TrendMetric[] = ['total', ...SUBJECT_CODES]
  const accent = selectedProfile?.color_key === 'peach' ? '#c57c5d' : '#4f7c6a'
  const examYears = useMemo(() => new Set(exams.map((exam) => exam.exam_date.slice(0, 4))).size, [exams])

  if (isLoading) return <LoadingScreen />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />

  return (
    <div className="page dashboard-page">
      <PageHeader eyebrow="成长总览" title={`早上好，${profile?.display_name ?? '你'}`} description="每一次考试都是一页，不急着定义好坏，只诚实记录变化。" actions={<Link className="button button--primary" to="/exams/new"><Plus size={17} />添加考试</Link>} />
      <PersonSwitch profiles={profiles} value={studentId} onChange={setStudentId} />

      <section className="summary-grid" aria-label="最近成绩概览">
        <article className="summary-card summary-card--hero">
          <div><span className="summary-card__icon"><Sparkles size={20} /></span><p>最近一次考试</p><h2>{latest?.title ?? '等待第一次记录'}</h2><small>{latest?.exam_date ?? '从今天开始也很好'}</small></div>
          <Link to={latest ? `/exams/${latest.id}` : '/exams/new'}>{latest ? '查看详情' : '添加记录'}<ArrowRight size={16} /></Link>
        </article>
        <article className="summary-card"><span className="summary-card__icon"><TrendingUp size={19} /></span><p>最近得分率</p><strong>{scoreRate === null ? '—' : `${scoreRate.toFixed(1)}%`}</strong><small>{latest?.total_score ?? '—'} / {latest?.total_full_score ?? '—'}</small></article>
        <article className="summary-card"><span className="summary-card__icon"><Trophy size={19} /></span><p>最近年级排名</p><strong>{latest?.rank_value ? `第 ${latest.rank_value} 名` : '—'}</strong><small>{latest?.participant_count ? `共 ${latest.participant_count} 人` : '参考人数未录入'}</small></article>
        <article className="summary-card"><span className="summary-card__icon"><BookOpenCheck size={19} /></span><p>已记录</p><strong>{exams.length} 场</strong><small>跨越 {examYears || 0} 个学年</small></article>
      </section>

      <section className="panel trend-panel">
        <div className="section-heading"><div><p className="eyebrow">成绩趋势</p><h2>{selectedProfile?.display_name ?? '成员'}的{METRIC_LABELS[metric]}曲线</h2></div><span className="section-heading__hint"><CalendarDays size={15} />点击数据点查看详情</span></div>
        <div className="metric-tabs" role="tablist" aria-label="趋势科目">
          {metrics.map((item) => <button key={item} role="tab" aria-selected={metric === item} type="button" onClick={() => setMetric(item)}>{METRIC_LABELS[item]}</button>)}
        </div>
        <TrendCharts exams={exams} subjectScores={subjectScores} metric={metric} accent={accent} />
      </section>

      <section className="recent-section">
        <div className="section-heading"><div><p className="eyebrow">时间轴</p><h2>最近的考试</h2></div><Link to="/exams">查看全部<ArrowRight size={16} /></Link></div>
        {exams.length ? <div className="exam-list">{exams.slice(0, 3).map((exam) => <ExamCard key={exam.id} exam={exam} profile={selectedProfile} />)}</div> : <div className="empty-inline"><BookOpenCheck size={26} /><div><strong>还没有考试记录</strong><p>添加第一场考试，折线和时间轴就会出现。</p></div><Link className="button button--secondary" to="/exams/new">现在添加</Link></div>}
      </section>
    </div>
  )
}
