import { describe, expect, it } from "vitest";

import {
  calculateRankPercentile,
  calculateScoreRate,
  defaultScoreDisplayMode,
  deriveTrendPoints,
  sumSubjectScores,
  type ExamTrendRecord,
} from "./score";

const exams: ExamTrendRecord[] = [
  {
    id: "exam-2",
    name: "期中考试",
    examDate: "2026-04-20",
    kind: "comprehensive",
    score: 540,
    maxScore: 600,
    rank: 12,
    participantCount: 200,
    subjectScores: [
      { subject: "math", score: 92, maxScore: 100, rank: 8, participantCount: 200 },
    ],
  },
  {
    id: "exam-1",
    name: "月考",
    examDate: "2026-03-10",
    kind: "comprehensive",
    score: 510,
    maxScore: 600,
    rank: 20,
    participantCount: 200,
    subjectScores: [
      { subject: "math", score: 80, maxScore: 100, rank: 21, participantCount: 200 },
    ],
  },
  {
    id: "exam-3",
    name: "数学小测",
    examDate: "2026-05-01",
    kind: "single_subject",
    subjectScores: [{ subject: "math", score: null, maxScore: 120, rank: null }],
  },
];

describe("score calculations", () => {
  it("calculates rates and a higher-is-better rank percentile", () => {
    expect(calculateScoreRate(45, 60)).toBe(75);
    expect(calculateScoreRate(45, 0)).toBeNull();
    expect(calculateRankPercentile(1, 200)).toBe(100);
    expect(calculateRankPercentile(200, 200)).toBe(0.5);
    expect(calculateRankPercentile(201, 200)).toBeNull();
  });

  it("derives total trend in date order and excludes single-subject tests", () => {
    const points = deriveTrendPoints(exams, "total");

    expect(points.map((point) => point.examId)).toEqual(["exam-1", "exam-2"]);
    expect(points[0].scoreChange).toBeNull();
    expect(points[1]).toMatchObject({
      scoreChange: 30,
      scoreRateChange: 5,
      rankChange: 8,
    });
  });

  it("keeps missing values as chart gaps and includes subject tests", () => {
    const points = deriveTrendPoints(exams, "math");

    expect(points).toHaveLength(3);
    expect(points[2]).toMatchObject({
      examId: "exam-3",
      score: null,
      maxScore: 120,
      scoreRate: null,
      scoreChange: null,
    });
    expect(defaultScoreDisplayMode(points)).toBe("percentage");
  });

  it("keeps a comprehensive exam without the selected subject as a gap", () => {
    const points = deriveTrendPoints([
      ...exams,
      { id: "exam-4", name: "期末考试", examDate: "2026-06-20", kind: "comprehensive" },
    ], "math");

    expect(points.at(-1)).toMatchObject({ examId: "exam-4", score: null, rank: null });
  });

  it("does not compare raw ranks when both participant ranges are known and differ", () => {
    const points = deriveTrendPoints([
      { id: "a", name: "第一次", examDate: "2026-01-01", kind: "comprehensive", rank: 20, participantCount: 100 },
      { id: "b", name: "第二次", examDate: "2026-02-01", kind: "comprehensive", rank: 30, participantCount: 200 },
    ], "total");

    expect(points[1].rankChange).toBeNull();
    expect(points[1].rankPercentileChange).toBeGreaterThan(0);
  });

  it("sums only provided subject values for total-score prefilling", () => {
    expect(
      sumSubjectScores([
        { subject: "chinese", score: 90, maxScore: 120 },
        { subject: "math", score: 100, maxScore: 120 },
        { subject: "english", score: null, maxScore: null },
      ]),
    ).toEqual({
      score: 190,
      maxScore: 240,
      scoredSubjectCount: 2,
      maxScoreSubjectCount: 2,
    });
  });
});
