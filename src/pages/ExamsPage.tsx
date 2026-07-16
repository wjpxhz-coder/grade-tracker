import { BookOpenText, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExamCard } from '../components/ExamCard'
import { ErrorState } from '../components/ErrorState'
import { LoadingScreen } from '../components/LoadingScreen'
import { PageHeader } from '../components/PageHeader'
import { PersonSwitch } from '../components/PersonSwitch'
import { useAuth } from '../contexts/AuthContext'
import { useExamData } from '../hooks/useExamData'

export function ExamsPage() {
  const { profile, profiles } = useAuth()
  const [studentId, setStudentId] = useState(profile?.id ?? '')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | 'comprehensive' | 'single_subject'>('all')
  useEffect(() => { if (!studentId && profile?.id) setStudentId(profile.id) }, [profile?.id, studentId])
  const data = useExamData(studentId)
  const selectedProfile = profiles.find((item) => item.id === studentId)
  const filtered = useMemo(() => data.exams.filter((exam) => {
    const matchesKind = kind === 'all' || exam.kind === kind
    const needle = query.trim().toLocaleLowerCase('zh-CN')
    const matchesQuery = !needle || `${exam.title} ${exam.category ?? ''} ${exam.term ?? ''}`.toLocaleLowerCase('zh-CN').includes(needle)
    return matchesKind && matchesQuery
  }), [data.exams, kind, query])

  if (data.isLoading) return <LoadingScreen />
  if (data.error) return <ErrorState error={data.error} onRetry={() => void data.refetch()} />

  return (
    <div className="page">
      <PageHeader eyebrow="考试时间轴" title="每一场，都算数" description="按时间回看成绩、试卷和那时写下的想法。" actions={<Link className="button button--primary" to="/exams/new"><Plus size={17} />添加考试</Link>} />
      <PersonSwitch profiles={profiles} value={studentId} onChange={setStudentId} />
      <section className="filter-bar">
        <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索考试名称、学期或类型" /></label>
        <div className="segmented" role="group" aria-label="考试类型筛选">
          <button type="button" className={kind === 'all' ? 'active' : ''} onClick={() => setKind('all')}>全部</button>
          <button type="button" className={kind === 'comprehensive' ? 'active' : ''} onClick={() => setKind('comprehensive')}>综合考试</button>
          <button type="button" className={kind === 'single_subject' ? 'active' : ''} onClick={() => setKind('single_subject')}>单科测验</button>
        </div>
      </section>
      {filtered.length ? (
        <div className="timeline">
          {filtered.map((exam) => <ExamCard key={exam.id} exam={exam} profile={selectedProfile} />)}
        </div>
      ) : (
        <section className="empty-state"><BookOpenText size={34} /><h2>{data.exams.length ? '没有符合筛选的考试' : '时间轴还空着'}</h2><p>{data.exams.length ? '换一个关键词或考试类型试试。' : '添加第一场考试，开始记录两个人的成长。'}</p>{!data.exams.length ? <Link className="button button--primary" to="/exams/new">添加第一场</Link> : null}</section>
      )}
    </div>
  )
}
