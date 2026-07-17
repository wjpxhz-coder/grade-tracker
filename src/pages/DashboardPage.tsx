import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Plus,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState'
import { LoadingScreen } from '../components/LoadingScreen'
import { PageHeader } from '../components/PageHeader'
import { METRIC_LABELS, TrendCharts } from '../components/TrendCharts'
import { useAuth } from '../contexts/AuthContext'
import { useStudentScope } from '../contexts/StudentScopeContext'
import { useExamData } from '../hooks/useExamData'
import { getGreeting } from '../lib/greeting'
import { deriveComparableExamInsights, type ComparableExamInsight } from '../lib/insights'
import { formatDate, formatScore } from '../lib/format'
import { deriveTrendPoints, SUBJECT_CODES, type ExamTrendRecord, type TrendMetric, type TrendPoint } from '../lib/score'
import type { Exam, Profile, SubjectScore } from '../types/domain'

function signed(value: number, suffix: string): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`
}

function toneForDelta(value: number | null | undefined): ComparableExamInsight['tone'] {
  if (value === null || value === undefined) return 'neutral'
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'steady'
}

function toTrendRecords(exams: Exam[], scores: SubjectScore[]): ExamTrendRecord[] {
  const byExam = new Map<string, SubjectScore[]>()
  for (const score of scores) byExam.set(score.exam_id, [...(byExam.get(score.exam_id) ?? []), score])
  return exams.map((exam) => ({
    id: exam.id,
    name: exam.title,
    examDate: exam.exam_date,
    kind: exam.kind,
    primarySubject: exam.primary_subject,
    score: exam.total_score,
    maxScore: exam.total_full_score,
    rank: exam.rank_value,
    participantCount: exam.participant_count,
    subjectScores: (byExam.get(exam.id) ?? []).map((score) => ({
      subject: score.subject,
      score: score.score,
      maxScore: score.full_score,
      rank: score.rank_value,
      participantCount: score.participant_count,
    })),
  }))
}

function RecentExamRow({
  exam,
  profile,
  point,
  active,
  onActiveChange,
}: {
  exam: Exam
  profile: Profile | null
  point?: TrendPoint
  active: boolean
  onActiveChange: (examId: string | undefined) => void
}) {
  const rate = point?.scoreRate
  const delta = point?.scoreRateChange
  return (
    <Link
      to={`/exams/${exam.id}`}
      className="recent-exam-row"
      data-active={active ? 'true' : undefined}
      onMouseEnter={() => onActiveChange(exam.id)}
      onMouseLeave={() => onActiveChange(undefined)}
      onFocus={() => onActiveChange(exam.id)}
      onBlur={() => onActiveChange(undefined)}
    >
      <time dateTime={exam.exam_date}>{formatDate(exam.exam_date)}</time>
      <span className="recent-exam-row__main">
        <strong>{exam.title}</strong>
        <small>{profile?.display_name ?? '成员'} · {exam.kind === 'comprehensive' ? '综合考试' : '单科测验'}</small>
      </span>
      <span className="recent-exam-row__score">
        <strong>{rate === null || rate === undefined ? '—' : `${rate.toFixed(1)}%`}</strong>
        <small className={`change-text change-text--${toneForDelta(delta)}`}>
          {rate === null || rate === undefined
            ? '得分率未录入'
            : delta === null || delta === undefined
              ? '首次可比记录'
              : signed(delta, ' 个点')}
        </small>
      </span>
      <ArrowRight size={17} aria-hidden="true" />
    </Link>
  )
}

export function DashboardPage() {
  const { profile } = useAuth()
  const { studentId, selectedProfile } = useStudentScope()
  const [metric, setMetric] = useState<TrendMetric>('total')
  const [activeExamId, setActiveExamId] = useState<string>()
  const { exams, subjectScores, isLoading, error, refetch } = useExamData(studentId)
  const insights = useMemo(
    () => deriveComparableExamInsights(exams, subjectScores),
    [exams, subjectScores],
  )
  const latest = exams[0]
  const latestInsight = latest ? insights.get(latest.id) : undefined
  const metrics: TrendMetric[] = ['total', ...SUBJECT_CODES]
  const examYears = useMemo(
    () => new Set(exams.map((exam) => exam.academic_year ?? exam.exam_date.slice(0, 4))).size,
    [exams],
  )
  const metricPoints = useMemo(() => {
    const points = deriveTrendPoints(toTrendRecords(exams, subjectScores), metric)
    return new Map(points.map((point) => [point.examId, point]))
  }, [exams, metric, subjectScores])
  const recentMetricExams = useMemo(
    () => exams.filter((exam) => {
      const point = metricPoints.get(exam.id)
      return point && (point.score !== null || point.rank !== null)
    }).slice(0, 5),
    [exams, metricPoints],
  )

  useEffect(() => {
    setActiveExamId(undefined)
  }, [metric, studentId])

  useEffect(() => {
    if (metric !== 'total' || exams.length === 0 || exams.some((exam) => exam.kind === 'comprehensive')) return
    const firstSubject = exams.find((exam) => exam.primary_subject)?.primary_subject
    if (firstSubject) setMetric(firstSubject)
  }, [exams, metric])

  if (isLoading) return <LoadingScreen />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />

  const scoreDelta = latestInsight?.scoreRateDelta
  const rankPercentileDelta = latestInsight?.rankPercentileDelta
  const rankDelta = latestInsight?.rankChange
  const rankChangeText = !latest || latest.rank_value === null
    ? '—'
    : rankPercentileDelta !== null && rankPercentileDelta !== undefined
    ? signed(rankPercentileDelta, ' 个百分点')
    : rankDelta === null || rankDelta === undefined
      ? (latestInsight?.comparisonLabel ?? '首次可比记录')
      : rankDelta === 0
        ? '持平'
        : rankDelta > 0 ? `提升 ${rankDelta} 名` : `下降 ${Math.abs(rankDelta)} 名`

  return (
    <div className="page dashboard-page">
      <PageHeader
        eyebrow="成长总览"
        title={`${getGreeting()}，${profile?.display_name ?? '你'}`}
        description="每一次考试都是一页，不急着定义好坏，只诚实记录变化。"
        actions={<Link className="button button--primary" to="/exams/new"><Plus size={17} />添加考试</Link>}
      />
      <section className="insight-strip" aria-label="最近成绩摘要">
        <div className="insight-strip__primary">
          <span>最近成绩</span>
          <strong>{latest ? formatScore(latest.total_score, latest.total_full_score) : '—'}</strong>
          <small>{latest ? `${latest.title} · ${formatDate(latest.exam_date)}` : '等待第一次记录'}</small>
        </div>
        <div className={`insight-strip__item change-text--${toneForDelta(scoreDelta)}`}>
          <TrendingUp aria-hidden="true" />
          <span>得分率变化</span>
          <strong>{scoreDelta === null || scoreDelta === undefined ? (latestInsight?.comparisonLabel ?? '—') : signed(scoreDelta, ' 个百分点')}</strong>
          <small>{latestInsight?.scoreRate === null || latestInsight?.scoreRate === undefined ? '当前得分率未录入' : `当前 ${latestInsight.scoreRate.toFixed(1)}%`}</small>
        </div>
        <div className={`insight-strip__item change-text--${toneForDelta(rankPercentileDelta ?? rankDelta)}`}>
          <Trophy aria-hidden="true" />
          <span>排名变化</span>
          <strong>{rankChangeText}</strong>
          <small>{latest?.rank_value === null || latest?.rank_value === undefined ? '排名未录入' : `当前第 ${latest.rank_value} 名`}</small>
        </div>
        <div className="insight-strip__item">
          <BookOpenCheck aria-hidden="true" />
          <span>累计记录</span>
          <strong>{exams.length} 场</strong>
          <small>跨越 {examYears} 个学年</small>
        </div>
      </section>

      <section className="dashboard-workspace" aria-labelledby="trend-heading">
        <div className="dashboard-workspace__chart">
          <div className="section-heading">
            <div><p className="eyebrow">成绩轨迹</p><h2 id="trend-heading">{selectedProfile?.display_name ?? '成员'}的{METRIC_LABELS[metric]}曲线</h2></div>
            <span className="section-heading__hint"><CalendarDays size={15} />点击数据点查看详情</span>
          </div>
          <div className="metric-tabs" role="tablist" aria-label="趋势科目">
            {metrics.map((item) => (
              <button key={item} role="tab" aria-selected={metric === item} type="button" onClick={() => setMetric(item)}>
                {METRIC_LABELS[item]}
              </button>
            ))}
          </div>
          <TrendCharts
            exams={exams}
            subjectScores={subjectScores}
            metric={metric}
            accentKey={selectedProfile?.color_key === 'peach' ? 'peach' : 'sage'}
            activeExamId={activeExamId}
            onActiveExamChange={setActiveExamId}
            variant="workspace"
          />
        </div>

        <aside className="dashboard-workspace__recent" aria-labelledby="recent-heading">
          <div className="section-heading">
            <div><p className="eyebrow">时间轴</p><h2 id="recent-heading">最近{METRIC_LABELS[metric]}记录</h2></div>
            <Link to="/exams">查看全部<ArrowRight size={16} /></Link>
          </div>
          {recentMetricExams.length ? (
            <div className="recent-exam-list">
              {recentMetricExams.map((exam) => (
                <RecentExamRow
                  key={exam.id}
                  exam={exam}
                  profile={selectedProfile}
                  point={metricPoints.get(exam.id)}
                  active={activeExamId === exam.id}
                  onActiveChange={setActiveExamId}
                />
              ))}
            </div>
          ) : (
            <div className="empty-inline">
              <BookOpenCheck size={26} />
              <div>
                <strong>{exams.length ? `还没有${METRIC_LABELS[metric]}记录` : '还没有考试记录'}</strong>
                <p>{exams.length ? '选择其他科目，或添加一条新记录。' : '添加第一场考试，成长轨迹会从这里开始。'}</p>
              </div>
              <Link className="button button--secondary" to="/exams/new">现在添加</Link>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}
