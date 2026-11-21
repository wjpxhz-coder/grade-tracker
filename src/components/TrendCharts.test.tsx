import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { EChartsOption } from 'echarts'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { METRIC_LABELS, TrendCharts } from './TrendCharts'
import type { Exam, SubjectScore } from '../types/domain'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedOption: any = null

vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ resolvedTheme: 'light', theme: 'light', setTheme: vi.fn() }),
}))

vi.mock('echarts-for-react/lib/core', () => ({
  default: (props: { option: EChartsOption }) => {
    capturedOption = props.option
    return <div data-testid="echarts-mock" />
  },
}))

const mockExam: Exam = {
  id: 'exam-1',
  space_id: 'space-1',
  student_id: 'student-1',
  title: '高二期末考试',
  exam_date: '2026-06-27',
  kind: 'comprehensive',
  primary_subject: null,
  total_score: 560,
  total_full_score: 750,
  rank_value: 49,
  participant_count: 1400,
  rank_scope: 'overall',
  visibility: 'shared',
  academic_year: '2025-2026',
  term: '高二下学期',
  category: '期末',
  created_by: 'student-1',
  updated_by: 'student-1',
  version: 1,
  created_at: '2026-06-27T08:00:00Z',
  updated_at: '2026-06-27T08:00:00Z',
  deleted_at: null,
  deleted_by: null,
}

const mockScores: SubjectScore[] = []

describe('TrendCharts', () => {
  afterEach(cleanup)

  it('renders empty state when there are no points', () => {
    render(
      <MemoryRouter>
        <TrendCharts exams={[]} subjectScores={[]} metric="total" />
      </MemoryRouter>
    )
    expect(screen.getByText(`还没有${METRIC_LABELS.total}数据`)).toBeInTheDocument()
  })

  it('configures tooltip to trigger on axis for comfortable hover range with confine enabled', () => {
    capturedOption = null
    render(
      <MemoryRouter>
        <TrendCharts exams={[mockExam]} subjectScores={mockScores} metric="total" />
      </MemoryRouter>
    )

    expect(screen.getByTestId('echarts-mock')).toBeInTheDocument()
    expect(capturedOption).not.toBeNull()

    const tooltip = capturedOption?.tooltip as {
      trigger?: string
      confine?: boolean
      formatter?: (raw: unknown) => string
      axisPointer?: { snap?: boolean; type?: string }
    }
    expect(tooltip?.trigger).toBe('axis')
    expect(tooltip?.confine).toBe(true)
    expect(tooltip?.axisPointer?.type).toBe('line')
    expect(tooltip?.axisPointer?.snap).toBe(true)

    const axisPointer = capturedOption?.axisPointer as { link?: Array<{ xAxisIndex?: string }> }
    expect(axisPointer?.link).toEqual([{ xAxisIndex: 'all' }])

    // Verify formatter generates full details for hover with both single object and array format
    const formattedFromObj = tooltip?.formatter?.({ dataIndex: 0 })
    expect(formattedFromObj).toContain('高二期末考试')
    expect(formattedFromObj).toContain('2026-06-27')
    expect(formattedFromObj).toContain('560')
    expect(formattedFromObj).toContain('49')

    const formattedFromArr = tooltip?.formatter?.([{ dataIndex: 0 }])
    expect(formattedFromArr).toContain('高二期末考试')
    expect(formattedFromArr).toContain('2026-06-27')
    expect(formattedFromArr).toContain('560')
    expect(formattedFromArr).toContain('49')
  })

  it('sets comfortable symbolSize and pointer cursor for line nodes', () => {
    capturedOption = null
    render(
      <MemoryRouter>
        <TrendCharts exams={[mockExam]} subjectScores={mockScores} metric="total" activeExamId="exam-1" />
      </MemoryRouter>
    )

    const series = capturedOption?.series as Array<{
      symbolSize?: number
      cursor?: string
      data?: Array<{ symbolSize?: number }>
    }>

    expect(series).toHaveLength(2)
    // Both score and rank series use pointer cursor
    expect(series[0].cursor).toBe('pointer')
    expect(series[1].cursor).toBe('pointer')

    // Active exam symbolSize expands to 16 for easy target recognition
    expect(series[0].data?.[0].symbolSize).toBe(16)
    expect(series[1].data?.[0].symbolSize).toBe(16)
  })

  it('displays score and rank labels on line nodes', () => {
    capturedOption = null
    render(
      <MemoryRouter>
        <TrendCharts exams={[mockExam]} subjectScores={mockScores} metric="total" />
      </MemoryRouter>
    )

    const series = capturedOption?.series as Array<{
      label?: {
        show?: boolean
        formatter?: (params: { dataIndex?: number }) => string
      }
      labelLayout?: { hideOverlap?: boolean }
    }>

    expect(series).toHaveLength(2)

    // Score series label
    expect(series[0].label?.show).toBe(true)
    expect(series[0].labelLayout?.hideOverlap).toBe(true)
    const scoreText = series[0].label?.formatter?.({ dataIndex: 0 })
    expect(scoreText).toBe('560分')

    // Rank series label
    expect(series[1].label?.show).toBe(true)
    expect(series[1].labelLayout?.hideOverlap).toBe(true)
    const rankText = series[1].label?.formatter?.({ dataIndex: 0 })
    expect(rankText).toBe('49名')
  })

  it('dynamically scales score and rank Y-axes so growth trends stand out', () => {
    capturedOption = null
    const seriesExams: Exam[] = [
      { ...mockExam, id: 'e1', exam_date: '2026-06-27', total_score: 523.5, rank_value: 101 },
      { ...mockExam, id: 'e2', exam_date: '2026-07-07', total_score: 560.5, rank_value: 49 },
      { ...mockExam, id: 'e3', exam_date: '2026-09-08', total_score: 533, rank_value: 89 },
      { ...mockExam, id: 'e4', exam_date: '2026-10-08', total_score: 560.5, rank_value: 58 },
      { ...mockExam, id: 'e5', exam_date: '2026-11-21', total_score: 592, rank_value: 62 },
    ]

    render(
      <MemoryRouter>
        <TrendCharts exams={seriesExams} subjectScores={mockScores} metric="total" />
      </MemoryRouter>
    )

    const yAxis = capturedOption?.yAxis as Array<{ min?: number; max?: number; interval?: number }>
    expect(yAxis).toHaveLength(2)
    // Score axis should focus tightly around 523.5..592 instead of starting at 0
    expect(yAxis[0].min).toBeGreaterThanOrEqual(480)
    expect(yAxis[0].min).toBeLessThan(523.5)
    expect(yAxis[0].max).toBeGreaterThan(592)
    expect(yAxis[0].max).toBeLessThanOrEqual(650)

    // Rank axis should focus around 49..101 with top headroom
    expect(yAxis[1].min).toBeGreaterThanOrEqual(1)
    expect(yAxis[1].min).toBeLessThan(49)
    expect(yAxis[1].max).toBeGreaterThan(101)

    // Score area fill must anchor to axis start when min > 0
    const scoreSeries = (capturedOption?.series as Array<{ areaStyle?: { origin?: string } }>)[0]
    expect(scoreSeries.areaStyle?.origin).toBe('start')

    // Switching to percentage mode should also use dynamic bounds instead of 0..100
    fireEvent.click(screen.getByRole('button', { name: '得分率' }))
    const rateYAxis = (capturedOption?.yAxis as Array<{ min?: number; max?: number }>)[0]
    expect(rateYAxis.min).toBeGreaterThan(50)
    expect(rateYAxis.max).toBeLessThan(95)
  })
})
