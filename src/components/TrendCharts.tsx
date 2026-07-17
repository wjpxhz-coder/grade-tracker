import type { EChartsOption } from 'echarts'
import { LineChart } from 'echarts/charts'
import { AriaComponent, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import ReactEChartsCoreImport from 'echarts-for-react/lib/core'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { unwrapDefaultExport } from '../lib/module'
import { defaultScoreDisplayMode, deriveTrendPoints, type ExamTrendRecord, type ScoreDisplayMode, type TrendMetric } from '../lib/score'
import type { Exam, SubjectScore } from '../types/domain'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, AriaComponent, CanvasRenderer])

const ReactEChartsCore = unwrapDefaultExport<typeof ReactEChartsCoreImport>(ReactEChartsCoreImport)

export const METRIC_LABELS: Record<TrendMetric, string> = {
  total: '总成绩', chinese: '语文', math: '数学', english: '英语', biology: '生物', chemistry: '化学', physics: '物理',
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false
  ))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])

  return matches
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
    subjectScores: (byExam.get(exam.id) ?? []).map((item) => ({
      subject: item.subject,
      score: item.score,
      maxScore: item.full_score,
      rank: item.rank_value,
      participantCount: item.participant_count,
    })),
  }))
}

export interface TrendChartsProps {
  exams: Exam[]
  subjectScores: SubjectScore[]
  metric: TrendMetric
  accent?: string
  accentKey?: 'sage' | 'peach'
  activeExamId?: string
  onActiveExamChange?: (examId: string | undefined) => void
  variant?: 'workspace' | 'compact'
}

export function TrendCharts({
  exams,
  subjectScores,
  metric,
  accent = '#3f6e5a',
  accentKey,
  activeExamId,
  onActiveExamChange,
  variant = 'workspace',
}: TrendChartsProps) {
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const isCompactViewport = useMediaQuery('(max-width: 720px)')
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const chartTheme = resolvedTheme === 'dark'
    ? { muted: '#aeb9b1', line: '#465149', split: '#29332d', tooltip: 'rgba(23,30,26,.98)', ink: '#eef3ef' }
    : { muted: '#58655d', line: '#cbd3cc', split: '#e9ece7', tooltip: 'rgba(255,254,251,.98)', ink: '#17231d' }
  const resolvedAccent = accentKey
    ? accentKey === 'peach'
      ? (resolvedTheme === 'dark' ? '#e19b7d' : '#a65f46')
      : (resolvedTheme === 'dark' ? '#82af97' : '#3f6e5a')
    : accent
  const points = useMemo(() => deriveTrendPoints(toTrendRecords(exams, subjectScores), metric), [exams, subjectScores, metric])
  const suggestedMode = useMemo(() => defaultScoreDisplayMode(points), [points])
  const [displayMode, setDisplayMode] = useState<ScoreDisplayMode>(suggestedMode)
  useEffect(() => setDisplayMode(suggestedMode), [suggestedMode, metric])

  if (points.length === 0) {
    return <div className="chart-empty"><span>还没有{METRIC_LABELS[metric]}数据</span><p>添加一次考试后，成长曲线会从这里开始。</p></div>
  }

  const labels = points.map((point) => point.examDate.slice(5).replace('-', '/'))
  const scoreValues = points.map((point) => displayMode === 'percentage' ? point.scoreRate : point.score)
  const option: EChartsOption = {
    animation: !prefersReducedMotion,
    animationDuration: prefersReducedMotion ? 0 : 240,
    animationDurationUpdate: prefersReducedMotion ? 0 : 180,
    aria: {
      enabled: true,
      decal: { show: true },
      description: `${METRIC_LABELS[metric]}趋势图，共 ${points.length} 条可显示记录。上方曲线显示${displayMode === 'percentage' ? '得分率' : '原始分'}，下方曲线显示年级排名。`,
    },
    color: [resolvedAccent, resolvedTheme === 'dark' ? '#e19b7d' : '#a65f46'],
    grid: [
      { left: 50, right: 26, top: 38, height: '29%' },
      { left: 50, right: 26, top: '59%', height: '27%' },
    ],
    legend: { top: 2, data: [displayMode === 'percentage' ? '得分率' : '原始分', '年级排名'], textStyle: { color: chartTheme.muted } },
    tooltip: {
      trigger: 'axis',
      renderMode: 'richText',
      backgroundColor: chartTheme.tooltip,
      borderColor: chartTheme.line,
      textStyle: { color: chartTheme.ink },
      formatter: (raw) => {
        const params = Array.isArray(raw) ? raw : [raw]
        const index = Number((params[0] as { dataIndex?: number })?.dataIndex ?? 0)
        const point = points[index]
        const scoreText = point.score === null ? '未录入' : `${point.score}${point.maxScore === null ? '' : ` / ${point.maxScore}`}`
        const rateText = point.scoreRate === null ? '—' : `${point.scoreRate.toFixed(1)}%`
        const scoreDelta = displayMode === 'percentage' ? point.scoreRateChange : point.scoreChange
        const scoreDeltaText = scoreDelta === null ? '首次或无可比数据' : `${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)}${displayMode === 'percentage' ? ' 个百分点' : ' 分'}`
        const percentileText = point.rankPercentile === null ? '' : ` · 百分位 ${point.rankPercentile.toFixed(1)}%`
        const rankText = point.rank === null ? '未录入' : `第 ${point.rank} 名${point.participantCount ? ` / ${point.participantCount} 人` : ''}${percentileText}`
        const rankDeltaText = point.rankPercentileChange !== null
          ? point.rankPercentileChange === 0
            ? '排名百分位与上次持平'
            : `排名百分位较上次${point.rankPercentileChange > 0 ? '提升' : '下降'} ${Math.abs(point.rankPercentileChange).toFixed(1)} 个点`
          : point.rankChange === null
            ? '首次或无可比数据'
            : point.rankChange === 0
              ? '与上次持平'
              : point.rankChange > 0
                ? `较上次提升 ${point.rankChange} 名`
                : `较上次下降 ${Math.abs(point.rankChange)} 名`
        return `${point.examName}\n${point.examDate}\n分数：${scoreText}（${rateText}）\n变化：${scoreDeltaText}\n排名：${rankText}\n排名变化：${rankDeltaText}`
      },
    },
    xAxis: [
      { type: 'category', gridIndex: 0, data: labels, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { lineStyle: { color: chartTheme.line } } },
      { type: 'category', gridIndex: 1, data: labels, axisLabel: { color: chartTheme.muted }, axisTick: { show: false }, axisLine: { lineStyle: { color: chartTheme.line } } },
    ],
    yAxis: [
      { type: 'value', gridIndex: 0, name: displayMode === 'percentage' ? '得分率 %' : '分数', min: displayMode === 'percentage' ? 0 : undefined, max: displayMode === 'percentage' ? 100 : undefined, nameTextStyle: { color: chartTheme.muted }, axisLabel: { color: chartTheme.muted }, splitLine: { lineStyle: { color: chartTheme.split } } },
      { type: 'value', gridIndex: 1, name: '年级排名', inverse: true, min: 1, minInterval: 1, nameTextStyle: { color: chartTheme.muted }, axisLabel: { color: chartTheme.muted }, splitLine: { lineStyle: { color: chartTheme.split } } },
    ],
    dataZoom: [{ type: 'inside', xAxisIndex: [0, 1], filterMode: 'none' }],
    series: [
      {
        name: displayMode === 'percentage' ? '得分率' : '原始分',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        smooth: 0.25,
        connectNulls: false,
        symbolSize: 9,
        lineStyle: { width: 3 },
        areaStyle: { opacity: 0.07 },
        emphasis: { focus: 'series' },
        data: scoreValues.map((value, index) => {
          const isActive = points[index].examId === activeExamId
          return {
            value,
            examId: points[index].examId,
            symbolSize: isActive ? 15 : 9,
            itemStyle: isActive ? { borderColor: chartTheme.tooltip, borderWidth: 4 } : undefined,
          }
        }),
      },
      {
        name: '年级排名',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        smooth: 0.25,
        connectNulls: false,
        symbol: 'diamond',
        symbolSize: 9,
        lineStyle: { width: 2.5 },
        emphasis: { focus: 'series' },
        data: points.map((point) => {
          const isActive = point.examId === activeExamId
          return {
            value: point.rank,
            examId: point.examId,
            symbolSize: isActive ? 15 : 9,
            itemStyle: isActive ? { borderColor: chartTheme.tooltip, borderWidth: 4 } : undefined,
          }
        }),
      },
    ],
  }

  return (
    <div className={`trend-chart trend-chart--${variant}`} data-active-exam-id={activeExamId}>
      <div className="trend-chart__toolbar">
        <span>双指或滚轮可缩放时间范围</span>
        <div className="segmented segmented--small" role="group" aria-label="分数显示方式">
          <button type="button" aria-pressed={displayMode === 'raw'} className={displayMode === 'raw' ? 'active' : ''} onClick={() => setDisplayMode('raw')}>原始分</button>
          <button type="button" aria-pressed={displayMode === 'percentage'} className={displayMode === 'percentage' ? 'active' : ''} onClick={() => setDisplayMode('percentage')}>得分率</button>
        </div>
      </div>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        className="trend-chart__canvas"
        style={{ height: variant === 'workspace' && !isCompactViewport ? 360 : 280 }}
        notMerge
        onEvents={{
          click: (params: { data?: { examId?: string } }) => {
            if (params.data?.examId) void navigate(`/exams/${params.data.examId}`)
          },
          mouseover: (params: { data?: { examId?: string } }) => {
            if (params.data?.examId) onActiveExamChange?.(params.data.examId)
          },
          mouseout: () => onActiveExamChange?.(undefined),
        }}
      />
    </div>
  )
}
