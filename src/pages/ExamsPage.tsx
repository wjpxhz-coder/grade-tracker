import {
  BookOpenText,
  BookOpenCheck,
  Layers3,
  LockKeyhole,
  Minus,
  MoveDownRight,
  MoveUpRight,
  Plus,
  Search,
  UsersRound,
} from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState'
import { LoadingScreen } from '../components/LoadingScreen'
import { PageHeader } from '../components/PageHeader'
import { useStudentScope } from '../contexts/StudentScopeContext'
import { useExamData } from '../hooks/useExamData'
import { SUBJECT_LABELS } from '../lib/constants'
import { formatDate } from '../lib/format'
import { deriveComparableExamInsights, type ComparableExamInsight } from '../lib/insights'
import type { ExamKind } from '../lib/score'
import type { Exam } from '../types/domain'

type KindFilter = 'all' | ExamKind
type ExamGroup = {
  key: string
  academicYear: string
  term: string
  exams: Exam[]
}

function isKindFilter(value: string | null): value is KindFilter {
  return value === 'all' || value === 'comprehensive' || value === 'single_subject'
}

function changeTone(delta: number | null | undefined): ComparableExamInsight['tone'] {
  if (delta === null || delta === undefined) return 'neutral'
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'steady'
}

function ChangeCue({ delta }: { delta: number | null | undefined }) {
  if (delta === null || delta === undefined || delta === 0) return <Minus aria-hidden="true" />
  return delta > 0 ? <MoveUpRight aria-hidden="true" /> : <MoveDownRight aria-hidden="true" />
}

function scoreChangeText(insight: ComparableExamInsight | undefined): string {
  if (insight?.scoreRate === null) return '得分率未录入'
  if (insight?.scoreRateDelta === null || insight?.scoreRateDelta === undefined) {
    return '首次可比记录'
  }
  const value = insight.scoreRateDelta
  if (value === 0) return '与上次持平'
  return `较上次${value > 0 ? '提升' : '下降'} ${Math.abs(value).toFixed(1)} 个百分点`
}

function rankChangeText(insight: ComparableExamInsight | undefined, exam: Exam): string {
  if (exam.rank_value === null) return '排名未录入'
  const percentileDelta = insight?.rankPercentileDelta
  if (percentileDelta !== null && percentileDelta !== undefined) {
    if (percentileDelta === 0) return '排名百分位持平'
    return `百分位${percentileDelta > 0 ? '提升' : '下降'} ${Math.abs(percentileDelta).toFixed(1)} 个点`
  }
  const rankDelta = insight?.rankChange
  if (rankDelta !== null && rankDelta !== undefined) {
    if (rankDelta === 0) return '排名持平'
    return `${rankDelta > 0 ? '提升' : '下降'} ${Math.abs(rankDelta)} 名`
  }
  return '首次可比记录'
}

export function ExamsPage() {
  const { studentId, selectedProfile } = useStudentScope()
  const [searchParams, setSearchParams] = useSearchParams()
  const data = useExamData(studentId)
  const query = searchParams.get('q') ?? ''
  const requestedKind = searchParams.get('kind')
  const kind: KindFilter = isKindFilter(requestedKind) ? requestedKind : 'all'
  const requestedYear = searchParams.get('year') ?? 'all'
  const availableYears = useMemo(
    () => Array.from(new Set(data.exams.flatMap((exam) => exam.academic_year ? [exam.academic_year] : []))).sort((a, b) => b.localeCompare(a, 'zh-CN')),
    [data.exams],
  )
  const hasUnassignedYear = data.exams.some((exam) => !exam.academic_year)
  const year = requestedYear === 'all' || requestedYear === 'unassigned' || availableYears.includes(requestedYear)
    ? requestedYear
    : 'all'
  const insights = useMemo(
    () => deriveComparableExamInsights(data.exams, data.subjectScores),
    [data.exams, data.subjectScores],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN')
    return data.exams.filter((exam) => {
      const matchesKind = kind === 'all' || exam.kind === kind
      const matchesYear = year === 'all'
        || (year === 'unassigned' ? !exam.academic_year : exam.academic_year === year)
      const subject = exam.primary_subject ? SUBJECT_LABELS[exam.primary_subject] : ''
      const matchesQuery = !needle || [exam.title, exam.category, exam.term, exam.academic_year, subject]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('zh-CN')
        .includes(needle)
      return matchesKind && matchesYear && matchesQuery
    })
  }, [data.exams, kind, query, year])

  const groups = useMemo<ExamGroup[]>(() => {
    const byPeriod = new Map<string, ExamGroup>()
    for (const exam of filtered) {
      const academicYear = exam.academic_year?.trim() || '学年未填写'
      const term = exam.term?.trim() || '学期未填写'
      const key = JSON.stringify([academicYear, term])
      const group = byPeriod.get(key)
      if (group) group.exams.push(exam)
      else byPeriod.set(key, { key, academicYear, term, exams: [exam] })
    }
    return Array.from(byPeriod.values())
  }, [filtered])

  function setFilter(name: 'q' | 'kind' | 'year', value: string, defaultValue = '') {
    const next = new URLSearchParams(searchParams)
    if (!value || value === defaultValue) next.delete(name)
    else next.set(name, value)
    setSearchParams(next, { replace: true })
  }

  function clearFilters() {
    const next = new URLSearchParams(searchParams)
    next.delete('q')
    next.delete('kind')
    next.delete('year')
    setSearchParams(next, { replace: true })
  }

  if (data.isLoading) return <LoadingScreen />
  if (data.error) return <ErrorState error={data.error} onRetry={() => void data.refetch()} />

  return (
    <div className="page exams-page">
      <PageHeader
        eyebrow="考试档案"
        title="每一场，都算数"
        description="按学年和学期回看成绩，保留当时的轨迹与想法。"
        actions={<Link className="button button--primary" to="/exams/new"><Plus size={17} />添加考试</Link>}
      />

      <section className="exam-filters" aria-label="筛选考试">
        <label className="search-field">
          <span className="sr-only">搜索考试</span>
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setFilter('q', event.target.value)}
            placeholder="搜索名称、学期、类型或科目"
          />
        </label>
        <div className="segmented" role="group" aria-label="考试类型筛选">
          <button type="button" className={kind === 'all' ? 'active' : ''} aria-pressed={kind === 'all'} onClick={() => setFilter('kind', 'all', 'all')}>全部</button>
          <button type="button" className={kind === 'comprehensive' ? 'active' : ''} aria-pressed={kind === 'comprehensive'} onClick={() => setFilter('kind', 'comprehensive', 'all')}>综合考试</button>
          <button type="button" className={kind === 'single_subject' ? 'active' : ''} aria-pressed={kind === 'single_subject'} onClick={() => setFilter('kind', 'single_subject', 'all')}>单科测验</button>
        </div>
        <label className="select-field exam-filters__year">
          <span>学年</span>
          <select value={year} onChange={(event) => setFilter('year', event.target.value, 'all')}>
            <option value="all">全部学年</option>
            {availableYears.map((item) => <option key={item} value={item}>{item}</option>)}
            {hasUnassignedYear ? <option value="unassigned">学年未填写</option> : null}
          </select>
        </label>
      </section>

      <div className="exam-results-summary" role="status">
        <span>{selectedProfile?.display_name ?? '成员'}的考试记录</span>
        <strong>{filtered.length} 场</strong>
      </div>

      {groups.length ? (
        <div className="exam-groups">
          {groups.map((group, groupIndex) => {
            const groupId = `exam-group-${groupIndex}`
            return (
              <section className="exam-group" key={group.key} aria-labelledby={groupId}>
                <header className="exam-group__heading">
                  <div><p className="eyebrow">{group.academicYear}</p><h2 id={groupId}>{group.term}</h2></div>
                  <span>{group.exams.length} 场记录</span>
                </header>
                <div className="exam-table-wrap">
                  <table className="exam-table">
                    <caption className="sr-only">{group.academicYear}{group.term}考试记录</caption>
                    <thead>
                      <tr>
                        <th scope="col">日期</th>
                        <th scope="col">考试</th>
                        <th scope="col">类型</th>
                        <th scope="col">得分率</th>
                        <th scope="col">可比变化</th>
                        <th scope="col">排名</th>
                        <th scope="col">可见性</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.exams.map((exam) => {
                        const insight = insights.get(exam.id)
                        const scoreTone = changeTone(insight?.scoreRateDelta)
                        return (
                          <tr key={exam.id}>
                            <td data-label="日期"><time dateTime={exam.exam_date}>{formatDate(exam.exam_date)}</time></td>
                            <th scope="row" data-label="考试">
                              <Link className="exam-table__title" to={`/exams/${exam.id}`}>
                                <strong>{exam.title}</strong>
                                <small>{exam.category || '未设置分类'}</small>
                              </Link>
                            </th>
                            <td data-label="类型">
                              <span className="exam-kind">
                                {exam.kind === 'comprehensive' ? <Layers3 aria-hidden="true" /> : <BookOpenCheck aria-hidden="true" />}
                                {exam.kind === 'comprehensive' ? '综合考试' : `${exam.primary_subject ? SUBJECT_LABELS[exam.primary_subject] : '单科'}测验`}
                              </span>
                            </td>
                            <td data-label="得分率" className="exam-table__number">
                              {insight?.scoreRate === null || insight?.scoreRate === undefined ? '—' : `${insight.scoreRate.toFixed(1)}%`}
                            </td>
                            <td data-label="可比变化">
                              <span className={`change-cue change-cue--${scoreTone}`}>
                                <ChangeCue delta={insight?.scoreRateDelta} />
                                {scoreChangeText(insight)}
                              </span>
                            </td>
                            <td data-label="排名" className="exam-table__rank">
                              <strong>{exam.rank_value === null ? '—' : `第 ${exam.rank_value} 名`}</strong>
                              <small>{rankChangeText(insight, exam)}</small>
                            </td>
                            <td data-label="可见性">
                              <span className="visibility-cue">
                                {exam.visibility === 'private' ? <LockKeyhole aria-hidden="true" /> : <UsersRound aria-hidden="true" />}
                                {exam.visibility === 'private' ? '仅自己可见' : '双方可见'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <section className="empty-state">
          <BookOpenText size={34} />
          <h2>{data.exams.length ? '没有符合筛选的考试' : '考试档案还空着'}</h2>
          <p>{data.exams.length ? '试试清空筛选，或换一个关键词。' : '添加第一场考试，开始记录两个人的成长。'}</p>
          {data.exams.length
            ? <button className="button button--secondary" type="button" onClick={clearFilters}>清空筛选</button>
            : <Link className="button button--primary" to="/exams/new">添加第一场</Link>}
        </section>
      )}
    </div>
  )
}
