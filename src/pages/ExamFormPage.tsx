import { ArrowLeft, Calculator, Check, ImagePlus, Info, LoaderCircle, LockKeyhole, Save, Trash2, Upload, Users } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LoadingScreen } from '../components/LoadingScreen'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { getExamDetails, saveExam, uploadExamImage } from '../lib/api'
import { DEFAULT_SUBJECT_FULL_SCORES, SUBJECT_LABELS } from '../lib/constants'
import { validateImageFile } from '../lib/image'
import { SUBJECT_CODES, type ExamKind, type RankScope, type SubjectCode } from '../lib/score'
import type { ExamInput, Visibility } from '../types/domain'

export interface SubjectField {
  score: string
  fullScore: string
  rank: string
  participantCount: string
}

export interface FormState {
  studentId: string
  title: string
  examDate: string
  kind: ExamKind
  primarySubject: SubjectCode
  totalScore: string
  totalFullScore: string
  rankValue: string
  participantCount: string
  rankScope: RankScope
  visibility: Visibility
  academicYear: string
  term: string
  category: string
  subjects: Record<SubjectCode, SubjectField>
}

interface PendingAnswerSheet {
  id: string
  subject: SubjectCode
  file: File
}

export function emptySubjects(): Record<SubjectCode, SubjectField> {
  return Object.fromEntries(SUBJECT_CODES.map((subject) => [subject, {
    score: '',
    fullScore: String(DEFAULT_SUBJECT_FULL_SCORES[subject]),
    rank: '',
    participantCount: '',
  }])) as Record<SubjectCode, SubjectField>
}

function optionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const number = Number(trimmed)
  return Number.isFinite(number) ? number : null
}

function isInvalidNumber(value: string): boolean {
  return value.trim() !== '' && !Number.isFinite(Number(value))
}

function initialForm(studentId = ''): FormState {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  return {
    studentId,
    title: '',
    examDate: localDate,
    kind: 'comprehensive',
    primarySubject: 'math',
    totalScore: '',
    totalFullScore: String(Object.values(DEFAULT_SUBJECT_FULL_SCORES).reduce((sum, value) => sum + value, 0)),
    rankValue: '',
    participantCount: '',
    rankScope: 'overall',
    visibility: 'shared',
    academicYear: '',
    term: '',
    category: '',
    subjects: emptySubjects(),
  }
}

export function validateExamForm(form: FormState, userId?: string): string | null {
  if (!form.studentId || !form.title.trim() || !form.examDate) return '请填写成绩所属人、考试名称和日期。'
  if (form.visibility === 'private' && form.studentId !== userId) return '仅自己可见的记录只能创建给自己。'
  if (form.kind === 'single_subject' && !form.primarySubject) return '请选择单科测验的科目。'
  if ([form.totalScore, form.totalFullScore, form.rankValue, form.participantCount].some(isInvalidNumber)) return '分数、满分、排名和参考人数只能填写数字。'
  const totalScore = optionalNumber(form.totalScore)
  const totalFull = optionalNumber(form.totalFullScore)
  if (totalScore !== null && totalFull === null) return '填写总得分时也需要填写总满分。'
  if (totalFull !== null && totalFull <= 0) return '总满分必须大于 0。'
  if (totalScore !== null && (totalScore < 0 || totalScore > totalFull!)) return '总分需要在 0 到满分之间。'
  for (const subject of form.kind === 'comprehensive' ? SUBJECT_CODES : []) {
    const row = form.subjects[subject]
    if ([row.score, row.fullScore, row.rank, row.participantCount].some(isInvalidNumber)) return `${SUBJECT_LABELS[subject]}中只能填写数字。`
    const score = optionalNumber(row.score)
    const full = optionalNumber(row.fullScore)
    const subjectRank = optionalNumber(row.rank)
    const subjectCount = optionalNumber(row.participantCount)
    if (score !== null && full === null) return `填写${SUBJECT_LABELS[subject]}得分时也需要填写满分。`
    if (full !== null && full <= 0) return `${SUBJECT_LABELS[subject]}满分必须大于 0。`
    if (score !== null && (score < 0 || score > full!)) return `${SUBJECT_LABELS[subject]}得分需要在 0 到满分之间。`
    if (subjectRank !== null && (!Number.isInteger(subjectRank) || subjectRank < 1)) return `${SUBJECT_LABELS[subject]}排名必须是大于等于 1 的整数。`
    if (subjectCount !== null && (!Number.isInteger(subjectCount) || subjectCount < 1)) return `${SUBJECT_LABELS[subject]}参考人数必须是大于等于 1 的整数。`
    if (subjectRank !== null && subjectCount !== null && subjectRank > subjectCount) return `${SUBJECT_LABELS[subject]}排名不能大于参考人数。`
  }
  const rank = optionalNumber(form.rankValue)
  const count = optionalNumber(form.participantCount)
  if (rank !== null && (!Number.isInteger(rank) || rank < 1)) return '排名必须是大于等于 1 的整数。'
  if (count !== null && (!Number.isInteger(count) || count < 1)) return '参考人数必须是大于等于 1 的整数。'
  if (rank !== null && count !== null && rank > count) return '排名不能大于参考人数。'
  return null
}

export function buildSubjectScoreInputs(form: FormState): ExamInput['subject_scores'] {
  const totalScore = optionalNumber(form.totalScore)
  const totalFullScore = optionalNumber(form.totalFullScore)
  const rankValue = optionalNumber(form.rankValue)
  const participantCount = optionalNumber(form.participantCount)
  if (form.kind === 'single_subject') {
    return [{ subject: form.primarySubject, score: totalScore, full_score: totalFullScore, rank_value: rankValue, participant_count: participantCount }]
  }
  return SUBJECT_CODES.flatMap((subject) => {
    const row = form.subjects[subject]
    const score = optionalNumber(row.score)
    const fullScore = optionalNumber(row.fullScore)
    const subjectRank = optionalNumber(row.rank)
    const subjectCount = optionalNumber(row.participantCount)
    if (score === null && fullScore === null && subjectRank === null && subjectCount === null) return []
    return [{ subject, score, full_score: fullScore, rank_value: subjectRank, participant_count: subjectCount }]
  })
}

export function ExamFormPage() {
  const { examId } = useParams()
  const isEditing = Boolean(examId)
  const { user, profile, profiles, membership } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() => initialForm(profile?.id))
  const [autoTotal, setAutoTotal] = useState(true)
  const [pendingSubject, setPendingSubject] = useState<SubjectCode>('math')
  const [pendingAnswerSheets, setPendingAnswerSheets] = useState<PendingAnswerSheet[]>([])
  const [uploadStatus, setUploadStatus] = useState('')
  const answerSheetInput = useRef<HTMLInputElement>(null)
  const detailQuery = useQuery({ queryKey: ['exam', examId], queryFn: () => getExamDetails(examId!), enabled: isEditing })

  useEffect(() => {
    if (!isEditing && profile?.id && !form.studentId) setForm((current) => ({ ...current, studentId: profile.id }))
  }, [form.studentId, isEditing, profile?.id])

  useEffect(() => {
    const exam = detailQuery.data
    if (!exam) return
    const subjects = emptySubjects()
    for (const item of exam.subject_scores) {
      subjects[item.subject] = {
        score: item.score?.toString() ?? '',
        fullScore: item.full_score?.toString() ?? '',
        rank: item.rank_value?.toString() ?? '',
        participantCount: item.participant_count?.toString() ?? '',
      }
    }
    const primaryScore = exam.primary_subject
      ? exam.subject_scores.find((item) => item.subject === exam.primary_subject)
      : undefined
    setForm({
      studentId: exam.student_id,
      title: exam.title,
      examDate: exam.exam_date,
      kind: exam.kind,
      primarySubject: exam.primary_subject ?? 'math',
      totalScore: (exam.total_score ?? primaryScore?.score)?.toString() ?? '',
      totalFullScore: (exam.total_full_score ?? primaryScore?.full_score)?.toString() ?? '',
      rankValue: (exam.rank_value ?? primaryScore?.rank_value)?.toString() ?? '',
      participantCount: (exam.participant_count ?? primaryScore?.participant_count)?.toString() ?? '',
      rankScope: exam.rank_scope ?? (exam.kind === 'single_subject' ? 'subject' : 'overall'),
      visibility: exam.visibility,
      academicYear: exam.academic_year ?? '',
      term: exam.term ?? '',
      category: exam.category ?? '',
      subjects,
    })
    setAutoTotal(false)
  }, [detailQuery.data])

  const subjectSum = useMemo(() => SUBJECT_CODES.reduce((sum, subject) => sum + (optionalNumber(form.subjects[subject].score) ?? 0), 0), [form.subjects])
  const subjectFullSum = useMemo(() => SUBJECT_CODES.reduce((sum, subject) => sum + (optionalNumber(form.subjects[subject].fullScore) ?? 0), 0), [form.subjects])
  const scoredSubjectCount = useMemo(() => SUBJECT_CODES.filter((subject) => optionalNumber(form.subjects[subject].score) !== null).length, [form.subjects])
  const fullScoreSubjectCount = useMemo(() => SUBJECT_CODES.filter((subject) => optionalNumber(form.subjects[subject].fullScore) !== null).length, [form.subjects])
  const unpairedSubjectCount = useMemo(() => SUBJECT_CODES.filter((subject) => optionalNumber(form.subjects[subject].score) !== null && optionalNumber(form.subjects[subject].fullScore) === null).length, [form.subjects])
  const subjectSummaryComplete = scoredSubjectCount > 0 && unpairedSubjectCount === 0

  function applySubjectSum() {
    setForm((current) => ({ ...current, totalScore: subjectSummaryComplete ? String(subjectSum) : '', totalFullScore: fullScoreSubjectCount ? String(subjectFullSum) : '' }))
    setAutoTotal(true)
  }

  function updateSubject(subject: SubjectCode, field: keyof SubjectField, value: string) {
    setForm((current) => {
      const subjects = { ...current.subjects, [subject]: { ...current.subjects[subject], [field]: value } }
      if (!autoTotal || (field !== 'score' && field !== 'fullScore')) return { ...current, subjects }
      const scoreCount = SUBJECT_CODES.filter((code) => optionalNumber(subjects[code].score) !== null).length
      const fullCount = SUBJECT_CODES.filter((code) => optionalNumber(subjects[code].fullScore) !== null).length
      const summaryComplete = scoreCount > 0 && SUBJECT_CODES.every((code) => optionalNumber(subjects[code].score) === null || optionalNumber(subjects[code].fullScore) !== null)
      const score = SUBJECT_CODES.reduce((sum, code) => sum + (optionalNumber(subjects[code].score) ?? 0), 0)
      const full = SUBJECT_CODES.reduce((sum, code) => sum + (optionalNumber(subjects[code].fullScore) ?? 0), 0)
      return { ...current, subjects, totalScore: summaryComplete ? String(score) : '', totalFullScore: fullCount ? String(full) : '' }
    })
  }

  function changeExamKind(kind: ExamKind) {
    const defaultFullScore = kind === 'single_subject'
      ? DEFAULT_SUBJECT_FULL_SCORES[form.primarySubject]
      : Object.values(DEFAULT_SUBJECT_FULL_SCORES).reduce((sum, value) => sum + value, 0)
    setForm((current) => ({ ...current, kind, rankScope: kind === 'single_subject' ? 'subject' : 'overall', totalFullScore: String(defaultFullScore) }))
    if (kind === 'single_subject') {
      setPendingSubject(form.primarySubject)
      setPendingAnswerSheets((current) => current.map((item) => ({ ...item, subject: form.primarySubject })))
    }
    setAutoTotal(true)
  }

  function changePrimarySubject(subject: SubjectCode) {
    setForm((current) => ({ ...current, primarySubject: subject, totalFullScore: String(DEFAULT_SUBJECT_FULL_SCORES[subject]) }))
    setPendingSubject(subject)
    setPendingAnswerSheets((current) => current.map((item) => ({ ...item, subject })))
    setAutoTotal(true)
  }

  function queueAnswerSheets(files: FileList | null) {
    if (!files?.length) return
    const valid: PendingAnswerSheet[] = []
    for (const file of [...files]) {
      try {
        validateImageFile(file)
        valid.push({ id: crypto.randomUUID(), subject: form.kind === 'single_subject' ? form.primarySubject : pendingSubject, file })
      } catch (error) {
        showToast(error instanceof Error ? error.message : `${file.name} 不是可用图片`, 'error')
      }
    }
    if (valid.length) setPendingAnswerSheets((current) => [...current, ...valid])
    if (answerSheetInput.current) answerSheetInput.current.value = ''
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validation = validateExamForm(form, user?.id)
      if (validation) throw new Error(validation)
      const totalScore = optionalNumber(form.totalScore)
      const totalFullScore = optionalNumber(form.totalFullScore)
      const rankValue = optionalNumber(form.rankValue)
      const participantCount = optionalNumber(form.participantCount)
      const subjectScores = buildSubjectScoreInputs(form)
      const payload: ExamInput = {
        id: examId,
        space_id: membership!.space_id,
        student_id: form.studentId,
        title: form.title.trim(),
        exam_date: form.examDate,
        kind: form.kind,
        primary_subject: form.kind === 'single_subject' ? form.primarySubject : null,
        total_score: totalScore,
        total_full_score: totalFullScore,
        rank_value: rankValue,
        participant_count: participantCount,
        rank_scope: form.rankValue ? (form.kind === 'single_subject' ? 'subject' : form.rankScope) : null,
        visibility: form.visibility,
        academic_year: form.academicYear.trim() || null,
        term: form.term.trim() || null,
        category: form.category.trim() || null,
        subject_scores: subjectScores,
      }
      const saved = await saveExam(payload, detailQuery.data?.version)
      let uploadedCount = 0
      let uploadError: string | null = null
      for (let index = 0; index < pendingAnswerSheets.length; index += 1) {
        setUploadStatus(`正在上传答题卡 ${index + 1} / ${pendingAnswerSheets.length}`)
        try {
          await uploadExamImage({
            file: pendingAnswerSheets[index].file,
            exam: saved,
            uploaderId: user!.id,
            category: 'answer_sheet',
            subject: pendingAnswerSheets[index].subject,
            pageOrder: (detailQuery.data?.attachments.length ?? 0) + index,
          })
          uploadedCount += 1
        } catch (error) {
          uploadError = error instanceof Error ? error.message : '图片上传失败'
          break
        }
      }
      setUploadStatus('')
      return { saved, uploadedCount, uploadError }
    },
    onSuccess: async ({ saved, uploadedCount, uploadError }) => {
      await queryClient.invalidateQueries({ queryKey: ['exams'] })
      if (uploadError) {
        showToast(`考试已保存，已上传 ${uploadedCount} 张答题卡；其余图片失败：${uploadError}`, 'error')
      } else {
        showToast(pendingAnswerSheets.length ? `考试已保存，${uploadedCount} 张答题卡已上传` : (isEditing ? '考试记录已更新' : '考试记录已添加'), 'success')
      }
      void navigate(`/exams/${saved.id}`, { replace: true })
    },
    onError: (error) => { setUploadStatus(''); showToast(error.message, 'error') },
  })

  if (detailQuery.isLoading) return <LoadingScreen label="正在准备考试记录…" />
  if (detailQuery.error) return <div className="page"><p className="form-error">{detailQuery.error.message}</p></div>

  const totalDiff = subjectSummaryComplete && optionalNumber(form.totalScore) !== null && Math.abs((optionalNumber(form.totalScore) ?? 0) - subjectSum) > 0.001

  return (
    <div className="page form-page">
      <header className="form-page__header"><Link to={examId ? `/exams/${examId}` : '/exams'} className="icon-button" aria-label="返回"><ArrowLeft /></Link><div><p className="eyebrow">{isEditing ? '共同编辑' : '新的记录'}</p><h1>{isEditing ? '编辑考试' : '添加一场考试'}</h1></div><button className="button button--primary" type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}{uploadStatus || (saveMutation.isPending ? '保存中…' : '保存')}</button></header>

      <div className="form-layout">
        <section className="panel form-section">
          <div className="form-section__heading"><span>1</span><div><h2>这是一场什么考试？</h2><p>先写下基本信息，成绩可以之后再补。</p></div></div>
          <div className="form-grid">
            <label className="field field--span-2"><span>考试名称 *</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：高二上学期期中考试" maxLength={80} /></label>
            <label className="field"><span>成绩属于 *</span><select value={form.studentId} disabled={isEditing} onChange={(event) => setForm({ ...form, studentId: event.target.value })}>{profiles.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select>{isEditing ? <small>创建后不能更改成绩所属人。</small> : null}</label>
            <label className="field"><span>考试日期 *</span><input type="date" value={form.examDate} onChange={(event) => setForm({ ...form, examDate: event.target.value })} /></label>
            <label className="field"><span>考试类型</span><select value={form.kind} onChange={(event) => changeExamKind(event.target.value as ExamKind)}><option value="comprehensive">综合考试</option><option value="single_subject">单科测验</option></select></label>
            {form.kind === 'single_subject' ? <label className="field"><span>测验科目</span><select value={form.primarySubject} onChange={(event) => changePrimarySubject(event.target.value as SubjectCode)}>{SUBJECT_CODES.map((subject) => <option key={subject} value={subject}>{SUBJECT_LABELS[subject]}</option>)}</select></label> : null}
            <label className="field"><span>学年（可选）</span><input value={form.academicYear} onChange={(event) => setForm({ ...form, academicYear: event.target.value })} placeholder="2026-2027" /></label>
            <label className="field"><span>学期（可选）</span><input value={form.term} onChange={(event) => setForm({ ...form, term: event.target.value })} placeholder="高二上学期" /></label>
            <label className="field"><span>分类（可选）</span><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="月考、期中、模拟考…" /></label>
          </div>
        </section>

        <section className="panel form-section">
          <div className="form-section__heading"><span>2</span><div><h2>{form.kind === 'single_subject' ? `${SUBJECT_LABELS[form.primarySubject]}成绩与排名` : '总成绩与排名'}</h2><p>不知道的项目可以留空，不会按 0 处理。</p></div></div>
          <div className="form-grid">
            <label className="field"><span>{form.kind === 'single_subject' ? '得分' : '总得分'}</span><input inputMode="decimal" value={form.totalScore} onChange={(event) => { setAutoTotal(false); setForm({ ...form, totalScore: event.target.value }) }} placeholder="例如 612" /></label>
            <label className="field"><span>{form.kind === 'single_subject' ? '满分' : '总满分'}</span><input inputMode="decimal" value={form.totalFullScore} onChange={(event) => { setAutoTotal(false); setForm({ ...form, totalFullScore: event.target.value }) }} placeholder="例如 750" /></label>
            <label className="field"><span>年级排名</span><input inputMode="numeric" value={form.rankValue} onChange={(event) => setForm({ ...form, rankValue: event.target.value })} placeholder="例如 38" /></label>
            <label className="field"><span>参考人数</span><input inputMode="numeric" value={form.participantCount} onChange={(event) => setForm({ ...form, participantCount: event.target.value })} placeholder="例如 860" /></label>
            <label className="field"><span>排名范围</span><select value={form.kind === 'single_subject' ? 'subject' : form.rankScope} disabled={form.kind === 'single_subject'} onChange={(event) => setForm({ ...form, rankScope: event.target.value as RankScope })}><option value="overall">综合年级排名</option><option value="subject">单科年级排名</option></select></label>
          </div>
        </section>

        {form.kind === 'comprehensive' ? <section className="panel form-section form-section--wide">
          <div className="form-section__heading"><span>3</span><div><h2>可选分科成绩</h2><p>填写任意科目后，系统会自动汇总总分；你仍可手动调整。</p></div></div>
          <div className="subject-table" role="table" aria-label="分科成绩">
            <div className="subject-table__head" role="row"><span>科目</span><span>得分</span><span>满分</span><span>单科排名</span><span>参考人数</span></div>
            {SUBJECT_CODES.map((subject) => <div className="subject-table__row" role="row" key={subject}><strong>{SUBJECT_LABELS[subject]}</strong><label className="subject-table__cell"><span>得分</span><input aria-label={`${SUBJECT_LABELS[subject]}得分`} inputMode="decimal" value={form.subjects[subject].score} onChange={(event) => updateSubject(subject, 'score', event.target.value)} placeholder="—" /></label><label className="subject-table__cell"><span>满分</span><input aria-label={`${SUBJECT_LABELS[subject]}满分`} inputMode="decimal" value={form.subjects[subject].fullScore} onChange={(event) => updateSubject(subject, 'fullScore', event.target.value)} placeholder="—" /></label><label className="subject-table__cell"><span>单科排名</span><input aria-label={`${SUBJECT_LABELS[subject]}排名`} inputMode="numeric" value={form.subjects[subject].rank} onChange={(event) => updateSubject(subject, 'rank', event.target.value)} placeholder="—" /></label><label className="subject-table__cell"><span>参考人数</span><input aria-label={`${SUBJECT_LABELS[subject]}参考人数`} inputMode="numeric" value={form.subjects[subject].participantCount} onChange={(event) => updateSubject(subject, 'participantCount', event.target.value)} placeholder="—" /></label></div>)}
          </div>
          {scoredSubjectCount ? <div className={`sum-hint${totalDiff || !subjectSummaryComplete ? ' sum-hint--warning' : ''}`}><Calculator size={18} /><span>{subjectSummaryComplete ? `分科合计：${subjectSum} / ${subjectFullSum}${totalDiff ? '，与手动总分不同' : '，已同步到总分'}` : `有 ${unpairedSubjectCount} 科填写得分后缺少满分，未自动汇总得分`}</span>{subjectSummaryComplete && (totalDiff || !autoTotal) ? <button type="button" onClick={applySubjectSum}>使用分科合计</button> : subjectSummaryComplete ? <Check size={17} /> : <Info size={17} />}</div> : null}
        </section> : null}

        <section className="panel form-section form-section--wide">
          <div className="form-section__heading"><span>4</span><div><h2>单科答题卡（可选）</h2><p>现在选择图片，保存考试后会自动压缩并上传。</p></div></div>
          <div className="answer-sheet-picker">
            {form.kind === 'comprehensive' ? <label className="field"><span>所属科目</span><select value={pendingSubject} onChange={(event) => setPendingSubject(event.target.value as SubjectCode)}>{SUBJECT_CODES.map((subject) => <option key={subject} value={subject}>{SUBJECT_LABELS[subject]}</option>)}</select></label> : <div className="answer-sheet-picker__subject"><span>所属科目</span><strong>{SUBJECT_LABELS[form.primarySubject]}</strong></div>}
            <button className="button button--secondary" type="button" onClick={() => answerSheetInput.current?.click()}><Upload size={16} />选择答题卡图片</button>
            <input ref={answerSheetInput} hidden type="file" accept="image/jpeg,image/png,image/webp,.heic,.heif" multiple onChange={(event) => queueAnswerSheets(event.target.files)} />
          </div>
          {pendingAnswerSheets.length ? <div className="pending-answer-sheets">{pendingAnswerSheets.map((item) => <div key={item.id}><ImagePlus size={18} /><span><strong>{SUBJECT_LABELS[item.subject]}答题卡</strong><small>{item.file.name}</small></span><button type="button" aria-label={`移除${item.file.name}`} onClick={() => setPendingAnswerSheets((current) => current.filter((candidate) => candidate.id !== item.id))}><Trash2 size={16} /></button></div>)}</div> : <p className="muted-copy answer-sheet-empty">还没有选择图片；支持 JPG、PNG、WebP、HEIC/HEIF，可一次选择多张。</p>}
        </section>

        <section className="panel form-section form-section--wide">
          <div className="form-section__heading"><span>5</span><div><h2>谁可以看到？</h2><p>默认双方共享；私密记录只能创建给自己。</p></div></div>
          <div className="visibility-options">
            <button type="button" className={form.visibility === 'shared' ? 'visibility-option visibility-option--active' : 'visibility-option'} onClick={() => setForm({ ...form, visibility: 'shared' })}><Users /><span><strong>双方可见</strong><small>两个人都能查看和共同编辑</small></span>{form.visibility === 'shared' ? <Check /> : null}</button>
            <button type="button" disabled={isEditing && form.studentId !== user?.id} className={form.visibility === 'private' ? 'visibility-option visibility-option--active' : 'visibility-option'} onClick={() => setForm({ ...form, visibility: 'private', studentId: isEditing ? form.studentId : (user?.id ?? form.studentId) })}><LockKeyhole /><span><strong>仅自己可见</strong><small>{isEditing && form.studentId !== user?.id ? '只有成绩所属人可以转为私密' : '只有当前账号可以查看和维护'}</small></span>{form.visibility === 'private' ? <Check /> : null}</button>
          </div>
          <div className="privacy-hint"><Info size={16} />共享后，对方仍可能截图或下载已看到的内容。</div>
        </section>
      </div>
      <div className="form-actions"><Link className="button button--ghost" to={examId ? `/exams/${examId}` : '/exams'}>取消</Link><button className="button button--primary" type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}{uploadStatus || (saveMutation.isPending ? '保存中…' : '保存考试')}</button></div>
    </div>
  )
}
