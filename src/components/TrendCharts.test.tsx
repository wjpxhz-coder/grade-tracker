import { render, screen } from '@testing-library/react'
import type { EChartsOption } from 'echarts'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
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
  it('renders empty state when there are no points', () => {
    render(
      <MemoryRouter>
        <TrendCharts exams={[]} subjectScores={[]} metric="total" />
      </MemoryRouter>
    )
    expect(screen.getByText(`还没有${METRIC_LABELS.total}数据`)).toBeInTheDocument()
  })

  it('configures tooltip to trigger on item (point) only with confine enabled', () => {
    capturedOption = null
    render(
      <MemoryRouter>
        <TrendCharts exams={[mockExam]} subjectScores={mockScores} metric="total" />
      </MemoryRouter>
    )

    expect(screen.getByTestId('echarts-mock')).toBeInTheDocument()
    expect(capturedOption).not.toBeNull()

    const tooltip = capturedOption?.tooltip as { trigger?: string; confine?: boolean; formatter?: (raw: unknown) => string }
    expect(tooltip?.trigger).toBe('item')
    expect(tooltip?.confine).toBe(true)

    // Verify formatter generates full details for point hover
    const formatted = tooltip?.formatter?.({ dataIndex: 0 })
    expect(formatted).toContain('高二期末考试')
    expect(formatted).toContain('2026-06-27')
    expect(formatted).toContain('560')
    expect(formatted).toContain('49')
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
})
