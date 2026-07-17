import type { Exam, SubjectScore } from '../types/domain'
import { SUBJECT_LABELS } from './constants'
import { calculateRankPercentile, calculateScoreRate, type RankScope, type SubjectCode } from './score'

export type InsightTone = 'up' | 'down' | 'steady' | 'neutral'

export interface ComparableExamInsight {
  scoreRate: number | null
  scoreRateDelta: number | null
  rankPercentile: number | null
  rankPercentileDelta: number | null
  rankChange: number | null
  comparisonLabel: string
  tone: InsightTone
}

interface ComparableRecord {
  scoreRate: number | null
  rank: number | null
  participantCount: number | null
  rankPercentile: number | null
  rankScope: RankScope
}

const FIRST_COMPARISON_LABEL = '首次可比记录'
const CHANGE_EPSILON = 1e-9

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function createRecord({
  score,
  fullScore,
  rank,
  participantCount,
  rankScope,
}: {
  score: number | null | undefined
  fullScore: number | null | undefined
  rank: number | null | undefined
  participantCount: number | null | undefined
  rankScope: RankScope
}): ComparableRecord {
  const safeRank = finiteOrNull(rank)
  const safeParticipantCount = finiteOrNull(participantCount)
  return {
    scoreRate: calculateScoreRate(score, fullScore),
    rank: safeRank,
    participantCount: safeParticipantCount,
    rankPercentile: calculateRankPercentile(safeRank, safeParticipantCount),
    rankScope,
  }
}

function totalRecord(exam: Exam): ComparableRecord {
  return createRecord({
    score: exam.total_score,
    fullScore: exam.total_full_score,
    rank: exam.rank_value,
    participantCount: exam.participant_count,
    rankScope: exam.rank_scope ?? 'overall',
  })
}

function subjectRecord(
  exam: Exam,
  score: SubjectScore | undefined,
  fallbackToExamTotal: boolean,
): ComparableRecord {
  return createRecord({
    score: score?.score ?? (fallbackToExamTotal ? exam.total_score : null),
    fullScore: score?.full_score ?? (fallbackToExamTotal ? exam.total_full_score : null),
    rank: score?.rank_value ?? (fallbackToExamTotal ? exam.rank_value : null),
    participantCount: score?.participant_count
      ?? (fallbackToExamTotal ? exam.participant_count : null),
    rankScope: 'subject',
  })
}

function lastMatching(
  history: readonly ComparableRecord[],
  predicate: (record: ComparableRecord) => boolean,
): ComparableRecord | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (predicate(history[index])) return history[index]
  }
  return undefined
}

function canCompareRawRank(current: ComparableRecord, previous: ComparableRecord): boolean {
  if (current.rank === null || previous.rank === null || current.rankScope !== previous.rankScope) return false
  if (current.participantCount === null || previous.participantCount === null) return true
  return current.participantCount === previous.participantCount
}

function toneForChanges(
  scoreRateDelta: number | null,
  rankPercentileDelta: number | null,
  rankChange: number | null,
): InsightTone {
  const changes = [scoreRateDelta, rankPercentileDelta ?? rankChange]
    .filter((change): change is number => change !== null)
  if (changes.length === 0) return 'neutral'

  const directionalChange = changes.find((change) => Math.abs(change) > CHANGE_EPSILON)
  if (directionalChange === undefined) return 'steady'
  return directionalChange > 0 ? 'up' : 'down'
}

function deriveInsight(
  current: ComparableRecord,
  history: readonly ComparableRecord[],
  comparisonLabel: string,
): ComparableExamInsight {
  const previousScore = current.scoreRate === null
    ? undefined
    : lastMatching(history, (record) => record.scoreRate !== null)
  const previousPercentile = current.rankPercentile === null
    ? undefined
    : lastMatching(history, (record) => record.rankPercentile !== null)
  const previousRawRank = current.rank === null
    ? undefined
    : lastMatching(history, (record) => canCompareRawRank(current, record))

  const scoreRateDelta = current.scoreRate === null || previousScore?.scoreRate === null || previousScore === undefined
    ? null
    : current.scoreRate - previousScore.scoreRate
  const rankPercentileDelta = current.rankPercentile === null
    || previousPercentile?.rankPercentile === null
    || previousPercentile === undefined
    ? null
    : current.rankPercentile - previousPercentile.rankPercentile
  const rankChange = current.rank === null || previousRawRank?.rank === null || previousRawRank === undefined
    ? null
    : previousRawRank.rank - current.rank
  const hasComparison = scoreRateDelta !== null || rankPercentileDelta !== null || rankChange !== null

  return {
    scoreRate: current.scoreRate,
    scoreRateDelta,
    rankPercentile: current.rankPercentile,
    rankPercentileDelta,
    rankChange,
    comparisonLabel: hasComparison ? comparisonLabel : FIRST_COMPARISON_LABEL,
    tone: hasComparison ? toneForChanges(scoreRateDelta, rankPercentileDelta, rankChange) : 'neutral',
  }
}

function neutralInsight(current: ComparableRecord): ComparableExamInsight {
  return {
    scoreRate: current.scoreRate,
    scoreRateDelta: null,
    rankPercentile: current.rankPercentile,
    rankPercentileDelta: null,
    rankChange: null,
    comparisonLabel: FIRST_COMPARISON_LABEL,
    tone: 'neutral',
  }
}

function addToHistory(
  histories: Map<string, ComparableRecord[]>,
  key: string,
  record: ComparableRecord,
) {
  const history = histories.get(key)
  if (history) history.push(record)
  else histories.set(key, [record])
}

/**
 * Derives UI-ready comparisons without mixing students or incompatible exam
 * scales. Comprehensive results use comprehensive totals; a single-subject
 * result uses the same subject from earlier single or comprehensive exams.
 */
export function deriveComparableExamInsights(
  exams: readonly Exam[],
  subjectScores: readonly SubjectScore[],
): Map<string, ComparableExamInsight> {
  const scoresByExam = new Map<string, SubjectScore[]>()
  for (const score of subjectScores) {
    const scores = scoresByExam.get(score.exam_id)
    if (scores) scores.push(score)
    else scoresByExam.set(score.exam_id, [score])
  }

  const orderedExams = [...exams].sort((left, right) => (
    left.exam_date.localeCompare(right.exam_date)
    || left.created_at.localeCompare(right.created_at)
    || left.id.localeCompare(right.id)
  ))
  const histories = new Map<string, ComparableRecord[]>()
  const insights = new Map<string, ComparableExamInsight>()

  for (const exam of orderedExams) {
    const examScores = scoresByExam.get(exam.id) ?? []
    const isDeleted = exam.deleted_at !== null

    if (exam.kind === 'comprehensive') {
      const current = totalRecord(exam)
      const totalKey = `${exam.student_id}:total`
      const totalHistory = histories.get(totalKey) ?? []
      insights.set(exam.id, isDeleted
        ? neutralInsight(current)
        : deriveInsight(current, totalHistory.slice(-1), '较上次综合考试'))

      if (!isDeleted) {
        addToHistory(histories, totalKey, current)
        for (const score of examScores) {
          addToHistory(
            histories,
            `${exam.student_id}:subject:${score.subject}`,
            subjectRecord(exam, score, false),
          )
        }
      }
      continue
    }

    const primarySubject = exam.primary_subject
    const primaryScore = primarySubject
      ? examScores.find((score) => score.subject === primarySubject)
      : undefined
    const current = subjectRecord(exam, primaryScore, true)
    if (!primarySubject || isDeleted) {
      insights.set(exam.id, neutralInsight(current))
      continue
    }

    const subjectKey = `${exam.student_id}:subject:${primarySubject}`
    insights.set(
      exam.id,
      deriveInsight(
        current,
        histories.get(subjectKey) ?? [],
        `较上次${SUBJECT_LABELS[primarySubject as SubjectCode]}记录`,
      ),
    )
    addToHistory(histories, subjectKey, current)
  }

  return insights
}
