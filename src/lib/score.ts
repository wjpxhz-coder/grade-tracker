export const SUBJECT_CODES = [
  "chinese",
  "math",
  "english",
  "biology",
  "chemistry",
  "physics",
] as const;

export type SubjectCode = (typeof SUBJECT_CODES)[number];
export type ExamKind = "comprehensive" | "single_subject";
export type RankScope = "overall" | "subject";
export type TrendMetric = "total" | SubjectCode;
export type ScoreDisplayMode = "raw" | "percentage";

export interface ScoreValue {
  score?: number | null;
  maxScore?: number | null;
  rank?: number | null;
  participantCount?: number | null;
}

export interface SubjectScoreValue extends ScoreValue {
  subject: SubjectCode;
}

/**
 * Small, storage-agnostic shape consumed by the chart layer. Database rows can
 * be mapped to this type without pulling Supabase types into the utility.
 */
export interface ExamTrendRecord extends ScoreValue {
  id: string;
  name: string;
  examDate: string;
  kind: ExamKind;
  primarySubject?: SubjectCode | null;
  subjectScores?: readonly SubjectScoreValue[] | null;
}

export interface TrendPoint {
  examId: string;
  examName: string;
  examDate: string;
  score: number | null;
  maxScore: number | null;
  scoreRate: number | null;
  rank: number | null;
  participantCount: number | null;
  rankPercentile: number | null;
  /** Positive means the score improved from the previous available score. */
  scoreChange: number | null;
  /** Percentage-point change; positive means improvement. */
  scoreRateChange: number | null;
  /** Positive means the ranking improved (for example, 20 -> 12 is +8). */
  rankChange: number | null;
  /** Percentage-point change; positive means improvement. */
  rankPercentileChange: number | null;
}

export interface SubjectScoreSum {
  score: number | null;
  maxScore: number | null;
  scoredSubjectCount: number;
  maxScoreSubjectCount: number;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function calculateScoreRate(
  score: number | null | undefined,
  maxScore: number | null | undefined,
): number | null {
  const safeScore = finiteOrNull(score);
  const safeMaxScore = finiteOrNull(maxScore);
  if (safeScore === null || safeMaxScore === null || safeMaxScore <= 0) {
    return null;
  }

  return (safeScore / safeMaxScore) * 100;
}

/**
 * Returns a 0-100 value in which a larger number is better. Rank 1 is 100 and
 * the last rank is 100 / participantCount.
 */
export function calculateRankPercentile(
  rank: number | null | undefined,
  participantCount: number | null | undefined,
): number | null {
  const safeRank = finiteOrNull(rank);
  const safeCount = finiteOrNull(participantCount);
  if (
    safeRank === null ||
    safeCount === null ||
    safeRank < 1 ||
    safeCount < 1 ||
    safeRank > safeCount
  ) {
    return null;
  }

  return ((safeCount - safeRank + 1) / safeCount) * 100;
}

export function sumSubjectScores(
  subjectScores: readonly SubjectScoreValue[] | null | undefined,
): SubjectScoreSum {
  let score = 0;
  let maxScore = 0;
  let scoredSubjectCount = 0;
  let maxScoreSubjectCount = 0;

  for (const item of subjectScores ?? []) {
    const safeScore = finiteOrNull(item.score);
    const safeMaxScore = finiteOrNull(item.maxScore);
    if (safeScore !== null) {
      score += safeScore;
      scoredSubjectCount += 1;
    }
    if (safeMaxScore !== null) {
      maxScore += safeMaxScore;
      maxScoreSubjectCount += 1;
    }
  }

  return {
    score: scoredSubjectCount > 0 ? score : null,
    maxScore: maxScoreSubjectCount > 0 ? maxScore : null,
    scoredSubjectCount,
    maxScoreSubjectCount,
  };
}

function valuesForMetric(
  exam: ExamTrendRecord,
  metric: TrendMetric,
): ScoreValue | null {
  if (metric === "total") {
    return exam.kind === "comprehensive" ? exam : null;
  }

  const subjectValue = exam.subjectScores?.find((item) => item.subject === metric);
  if (subjectValue) return subjectValue;

  // A relevant exam with an unfilled score must remain on the shared date axis
  // as a genuine gap instead of disappearing or being coerced to zero.
  if (exam.primarySubject === metric) return exam;
  if (exam.kind === "comprehensive") return {};
  return null;
}

function nullableDifference(
  current: number | null,
  previous: number | null,
): number | null {
  return current === null || previous === null ? null : current - previous;
}

/**
 * Produces date-ordered chart points. Nulls remain null (never coerced to zero),
 * so chart libraries can render genuine gaps. Changes compare with the previous
 * available value for that metric, rather than with a missing intermediate row.
 */
export function deriveTrendPoints(
  exams: readonly ExamTrendRecord[],
  metric: TrendMetric,
): TrendPoint[] {
  const ordered = exams
    .map((exam) => ({ exam, value: valuesForMetric(exam, metric) }))
    .filter(
      (entry): entry is { exam: ExamTrendRecord; value: ScoreValue } =>
        entry.value !== null,
    )
    .sort(
      (left, right) =>
        left.exam.examDate.localeCompare(right.exam.examDate) ||
        left.exam.name.localeCompare(right.exam.name, "zh-CN") ||
        left.exam.id.localeCompare(right.exam.id),
    );

  let previousScore: number | null = null;
  let previousRate: number | null = null;
  let previousRank: number | null = null;
  let previousRankParticipantCount: number | null = null;
  let previousPercentile: number | null = null;

  return ordered.map(({ exam, value }) => {
    const score = finiteOrNull(value.score);
    const maxScore = finiteOrNull(value.maxScore);
    const rank = finiteOrNull(value.rank);
    const participantCount = finiteOrNull(value.participantCount);
    const scoreRate = calculateScoreRate(score, maxScore);
    const rankPercentile = calculateRankPercentile(rank, participantCount);

    const point: TrendPoint = {
      examId: exam.id,
      examName: exam.name,
      examDate: exam.examDate,
      score,
      maxScore,
      scoreRate,
      rank,
      participantCount,
      rankPercentile,
      scoreChange: nullableDifference(score, previousScore),
      scoreRateChange: nullableDifference(scoreRate, previousRate),
      rankChange:
        rank === null || previousRank === null || (
          participantCount !== null &&
          previousRankParticipantCount !== null &&
          participantCount !== previousRankParticipantCount
        )
          ? null
          : previousRank - rank,
      rankPercentileChange: nullableDifference(
        rankPercentile,
        previousPercentile,
      ),
    };

    if (score !== null) previousScore = score;
    if (scoreRate !== null) previousRate = scoreRate;
    if (rank !== null) {
      previousRank = rank;
      previousRankParticipantCount = participantCount;
    }
    if (rankPercentile !== null) previousPercentile = rankPercentile;

    return point;
  });
}

/** Use percentages automatically when the plotted exams do not share a scale. */
export function defaultScoreDisplayMode(
  points: readonly Pick<TrendPoint, "maxScore">[],
): ScoreDisplayMode {
  const distinctMaxScores = new Set(
    points
      .map((point) => point.maxScore)
      .filter((value): value is number => value !== null),
  );
  return distinctMaxScores.size > 1 ? "percentage" : "raw";
}
