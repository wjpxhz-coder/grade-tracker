import type { EChartsOption } from 'echarts'
import { LineChart } from 'echarts/charts'
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import ReactEChartsCoreImport from 'echarts-for-react/lib/core'
import {
  Award,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sparkles,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { formatDate, formatScore } from '../lib/format'
import { unwrapDefaultExport } from '../lib/module'
import {
  defaultScoreDisplayMode,
  deriveTrendPoints,
  SUBJECT_CODES,
  type ExamTrendRecord,
  type ScoreDisplayMode,
  type SubjectCode,
  type TrendMetric,
  type TrendPoint,
} from '../lib/score'
import type { Exam, Profile, SubjectScore } from '../types/domain'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, AriaComponent, CanvasRenderer])

const ReactEChartsCore = unwrapDefaultExport<typeof ReactEChartsCoreImport>(ReactEChartsCoreImport)

export const REPLAY_METRIC_LABELS: Record<TrendMetric, string> = {
  total: '总成绩',
  chinese: '语文',
  math: '数学',
  english: '英语',
  biology: '生物',
  chemistry: '化学',
  physics: '物理',
}

function signed(value: number, suffix: string): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`
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

export interface ScoreCurveReplayModalProps {
  isOpen: boolean
  onClose: () => void
  exams: Exam[]
  subjectScores: SubjectScore[]
  initialMetric?: TrendMetric
  selectedProfile?: Profile | null
  accentKey?: 'sage' | 'peach'
}

export function ScoreCurveReplayModal({
  isOpen,
  onClose,
  exams,
  subjectScores,
  initialMetric = 'total',
  selectedProfile,
  accentKey,
}: ScoreCurveReplayModalProps) {
  const modalContainerRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()
  const [metric, setMetric] = useState<TrendMetric>(initialMetric)
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(true)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1)
  const [isLoop, setIsLoop] = useState<boolean>(false)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)
  const [showSummary, setShowSummary] = useState<boolean>(false)

  const chartTheme = resolvedTheme === 'dark'
    ? { muted: '#aeb9b1', line: '#465149', split: '#29332d', tooltip: 'rgba(23,30,26,.98)', ink: '#eef3ef' }
    : { muted: '#58655d', line: '#cbd3cc', split: '#e9ece7', tooltip: 'rgba(255,254,251,.98)', ink: '#17231d' }

  const resolvedAccent = accentKey === 'peach'
    ? (resolvedTheme === 'dark' ? '#e19b7d' : '#a65f46')
    : (resolvedTheme === 'dark' ? '#82af97' : '#3f6e5a')

  const points = useMemo(
    () => deriveTrendPoints(toTrendRecords(exams, subjectScores), metric),
    [exams, subjectScores, metric],
  )

  const suggestedMode = useMemo(() => defaultScoreDisplayMode(points), [points])
  const [displayMode, setDisplayMode] = useState<ScoreDisplayMode>(suggestedMode)

  useEffect(() => {
    setDisplayMode(suggestedMode)
  }, [suggestedMode, metric])

  useEffect(() => {
    if (isOpen) {
      setMetric(initialMetric)
      setCurrentIndex(0)
      setIsPlaying(true)
      setShowSummary(false)
    }
  }, [isOpen, initialMetric])

  // Track Fullscreen status
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleNativeFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        if (modalContainerRef.current?.requestFullscreen) {
          await modalContainerRef.current.requestFullscreen()
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        }
      }
    } catch {
      // Graceful fallback
    }
  }, [])

  // Timer for automatic replay
  useEffect(() => {
    if (!isOpen || !isPlaying || points.length <= 1) return

    const intervalTime = Math.max(700, Math.round(1800 / playbackSpeed))
    const timer = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev < points.length - 1) {
          return prev + 1
        }
        if (isLoop) {
          return 0
        }
        setIsPlaying(false)
        setShowSummary(true)
        return prev
      })
    }, intervalTime)

    return () => clearInterval(timer)
  }, [isOpen, isPlaying, playbackSpeed, isLoop, points.length])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.code === 'Space') {
        e.preventDefault()
        setIsPlaying((prev) => !prev)
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        setIsPlaying(false)
        setCurrentIndex((prev) => Math.max(0, prev - 1))
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        setIsPlaying(false)
        setCurrentIndex((prev) => Math.min(points.length - 1, prev + 1))
      } else if (e.code === 'Home') {
        e.preventDefault()
        setIsPlaying(false)
        setCurrentIndex(0)
      } else if (e.code === 'End') {
        e.preventDefault()
        setIsPlaying(false)
        setCurrentIndex(Math.max(0, points.length - 1))
      } else if (e.code === 'KeyF') {
        e.preventDefault()
        void toggleNativeFullscreen()
      } else if (e.key === 'Escape') {
        if (!document.fullscreenElement) {
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, points.length, onClose, toggleNativeFullscreen])

  const safeIndex = Math.min(Math.max(0, currentIndex), Math.max(0, points.length - 1))
  const currentPoint = points[safeIndex] as TrendPoint | undefined
  const currentExam = useMemo(
    () => (currentPoint ? exams.find((e) => e.id === currentPoint.examId) : undefined),
    [exams, currentPoint],
  )
  const currentSubjectScores = useMemo(
    () => (currentPoint ? subjectScores.filter((s) => s.exam_id === currentPoint.examId) : []),
    [subjectScores, currentPoint],
  )

  // Milestones and Insights for current spotlight
  const milestoneTag = useMemo(() => {
    if (!currentPoint || points.length === 0) return null
    const historyPoints = points.slice(0, safeIndex + 1)
    if (safeIndex === 0) return '🏁 成长轨迹起点'

    const validScores = historyPoints.map((p) => p.score).filter((v): v is number => v !== null)
    if (currentPoint.score !== null && validScores.length > 0 && currentPoint.score === Math.max(...validScores)) {
      return '🌟 创阶段历史最高分'
    }

    const validRanks = historyPoints.map((p) => p.rank).filter((v): v is number => v !== null)
    if (currentPoint.rank !== null && validRanks.length > 0 && currentPoint.rank === Math.min(...validRanks)) {
      return '🏆 创阶段最佳名次'
    }

    if (currentPoint.scoreChange !== null && currentPoint.scoreChange >= 15) {
      return `🚀 分数大幅飞跃 (+${currentPoint.scoreChange.toFixed(1)}分)`
    }
    if (currentPoint.rankChange !== null && currentPoint.rankChange >= 10) {
      return `📈 排名显著提升 (+${currentPoint.rankChange}名)`
    }
    if (currentPoint.scoreChange !== null && currentPoint.scoreChange > 0) {
      return '✨ 稳步上升'
    }
    return null
  }, [currentPoint, points, safeIndex])

  // Summary statistics calculation
  const summaryStats = useMemo(() => {
    if (points.length <= 1) return null
    const firstPoint = points[0]
    const lastPoint = points[points.length - 1]
    const validScores = points.map((p) => p.score).filter((v): v is number => v !== null)
    const maxScore = validScores.length > 0 ? Math.max(...validScores) : null
    const bestScorePoint = points.find((p) => p.score === maxScore)
    const validRanks = points.map((p) => p.rank).filter((v): v is number => v !== null)
    const bestRank = validRanks.length > 0 ? Math.min(...validRanks) : null
    const bestRankPoint = points.find((p) => p.rank === bestRank)

    const scoreNetChange = (lastPoint?.score !== null && firstPoint?.score !== null)
      ? (lastPoint.score - firstPoint.score)
      : null
    const rateNetChange = (lastPoint?.scoreRate !== null && firstPoint?.scoreRate !== null)
      ? (lastPoint.scoreRate - firstPoint.scoreRate)
      : null

    return {
      count: points.length,
      scoreNetChange,
      rateNetChange,
      maxScore,
      bestScoreExamName: bestScorePoint?.examName,
      bestRank,
      bestRankExamName: bestRankPoint?.examName,
    }
  }, [points])

  if (!isOpen) return null

  const metrics: TrendMetric[] = ['total', ...SUBJECT_CODES]
  const labels = points.map((point) => point.examDate.slice(5).replace('-', '/'))
  const rawScoreValues = points.map((point, index) => {
    if (index > safeIndex) return null
    return displayMode === 'percentage' ? point.scoreRate : point.score
  })
  const rankValues = points.map((point, index) => {
    if (index > safeIndex) return null
    return point.rank
  })

  const option: EChartsOption = {
    animation: true,
    animationDuration: 350,
    animationDurationUpdate: 300,
    aria: { enabled: true },
    color: [resolvedAccent, resolvedTheme === 'dark' ? '#e19b7d' : '#a65f46'],
    grid: [
      { left: 55, right: 35, top: 40, height: '38%' },
      { left: 55, right: 35, top: '56%', height: '36%' },
    ],
    legend: {
      top: 4,
      data: [displayMode === 'percentage' ? '得分率' : '原始分', '年级排名'],
      textStyle: { color: chartTheme.muted, fontSize: 12 },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: chartTheme.tooltip,
      borderColor: chartTheme.line,
      textStyle: { color: chartTheme.ink },
      formatter: (raw) => {
        const params = Array.isArray(raw) ? raw : [raw]
        const index = Number((params[0] as { dataIndex?: number })?.dataIndex ?? 0)
        const point = points[index]
        if (!point || index > safeIndex) return ''
        const scoreText = point.score === null ? '未录入' : `${point.score}${point.maxScore === null ? '' : ` / ${point.maxScore}`}`
        const rateText = point.scoreRate === null ? '—' : `${point.scoreRate.toFixed(1)}%`
        const scoreDelta = displayMode === 'percentage' ? point.scoreRateChange : point.scoreChange
        const scoreDeltaText = scoreDelta === null ? '无可比数据' : `${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)}${displayMode === 'percentage' ? ' 个百分点' : ' 分'}`
        const rankText = point.rank === null ? '未录入' : `第 ${point.rank} 名${point.participantCount ? ` / ${point.participantCount} 人` : ''}`
        return `<div style="font-weight:600;margin-bottom:4px;">${point.examName}</div><div style="font-size:12px;opacity:0.8;margin-bottom:6px;">${point.examDate}</div><div>分数：${scoreText} (${rateText})</div><div>变化：${scoreDeltaText}</div><div>排名：${rankText}</div>`
      },
    },
    xAxis: [
      {
        type: 'category',
        gridIndex: 0,
        data: labels,
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: chartTheme.line } },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: labels,
        axisLabel: { color: chartTheme.muted, fontSize: 11 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: chartTheme.line } },
      },
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 0,
        name: displayMode === 'percentage' ? '得分率 %' : '分数',
        min: displayMode === 'percentage' ? 0 : undefined,
        max: displayMode === 'percentage' ? 100 : undefined,
        nameTextStyle: { color: chartTheme.muted, fontSize: 11 },
        axisLabel: { color: chartTheme.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: chartTheme.split } },
      },
      {
        type: 'value',
        gridIndex: 1,
        name: '年级排名',
        inverse: true,
        min: 1,
        minInterval: 1,
        nameTextStyle: { color: chartTheme.muted, fontSize: 11 },
        axisLabel: { color: chartTheme.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: chartTheme.split } },
      },
    ],
    series: [
      {
        name: displayMode === 'percentage' ? '得分率' : '原始分',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        smooth: 0.25,
        connectNulls: false,
        symbolSize: 8,
        lineStyle: { width: 3.5, color: resolvedAccent },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: resolvedAccent === '#3f6e5a' || resolvedAccent === '#82af97' ? 'rgba(79, 124, 106, 0.28)' : 'rgba(197, 124, 93, 0.28)' },
            { offset: 1, color: 'rgba(79, 124, 106, 0.01)' },
          ]),
        },
        data: rawScoreValues.map((value, idx) => {
          const isCurrent = idx === safeIndex
          return {
            value,
            symbolSize: isCurrent ? 14 : 7,
            itemStyle: isCurrent
              ? {
                  color: resolvedAccent,
                  borderColor: chartTheme.tooltip,
                  borderWidth: 4,
                  shadowBlur: 10,
                  shadowColor: resolvedAccent,
                }
              : { color: resolvedAccent },
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
        symbolSize: 8,
        lineStyle: { width: 2.5 },
        data: rankValues.map((value, idx) => {
          const isCurrent = idx === safeIndex
          return {
            value,
            symbolSize: isCurrent ? 14 : 7,
            itemStyle: isCurrent
              ? {
                  borderColor: chartTheme.tooltip,
                  borderWidth: 4,
                  shadowBlur: 8,
                  shadowColor: 'rgba(166, 95, 70, 0.5)',
                }
              : undefined,
          }
        }),
      },
    ],
  }

  const handleSeek = (index: number) => {
    setCurrentIndex(index)
    setIsPlaying(false)
    setShowSummary(false)
  }

  const handleRestart = () => {
    setCurrentIndex(0)
    setIsPlaying(true)
    setShowSummary(false)
  }

  return (
    <div className="replay-modal-backdrop" role="dialog" aria-modal="true" aria-label="全屏成绩轨迹播放">
      <div ref={modalContainerRef} className={`replay-player-stage ${isFullscreen ? 'replay-player-stage--fullscreen' : ''}`}>
        {/* Top Header Navigation Bar */}
        <header className="replay-header">
          <div className="replay-header__title-group">
            <span className="replay-header__badge">
              <Sparkles size={15} /> 全屏轨迹播放
            </span>
            <h1>
              {selectedProfile?.display_name ?? '成员'}的{REPLAY_METRIC_LABELS[metric]}成长轨迹
            </h1>
            <span className="replay-header__meta">
              {points.length > 0 ? (
                <>第 {safeIndex + 1} 场 / 共 {points.length} 场 · {points[0]?.examDate} ~ {points[points.length - 1]?.examDate}</>
              ) : '暂无数据'}
            </span>
          </div>

          <div className="replay-header__controls">
            {/* Metric Switcher */}
            <div className="replay-metric-tabs" role="tablist" aria-label="回放科目">
              {metrics.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={metric === item}
                  className={`replay-metric-tab ${metric === item ? 'replay-metric-tab--active' : ''}`}
                  onClick={() => {
                    setMetric(item)
                    setCurrentIndex(0)
                    setShowSummary(false)
                  }}
                >
                  {REPLAY_METRIC_LABELS[item]}
                </button>
              ))}
            </div>

            {/* Score Mode Switcher */}
            <div className="segmented segmented--small" role="group" aria-label="分数单位">
              <button
                type="button"
                className={displayMode === 'raw' ? 'active' : ''}
                onClick={() => setDisplayMode('raw')}
              >
                原始分
              </button>
              <button
                type="button"
                className={displayMode === 'percentage' ? 'active' : ''}
                onClick={() => setDisplayMode('percentage')}
              >
                得分率
              </button>
            </div>

            {/* Native Fullscreen Toggle */}
            <button
              type="button"
              className="icon-button"
              onClick={() => void toggleNativeFullscreen()}
              title={isFullscreen ? '退出全屏 (F)' : '全屏显示 (F)'}
              aria-label={isFullscreen ? '退出全屏' : '全屏显示'}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              title="退出播放 (Esc)"
              aria-label="关闭播放"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* Empty State if no points */}
        {points.length === 0 ? (
          <div className="replay-empty-state">
            <Award size={48} />
            <h2>暂无可播放的{REPLAY_METRIC_LABELS[metric]}数据</h2>
            <p>请选择其他科目，或先录入该科目的考试成绩。</p>
            <button type="button" className="button button--secondary" onClick={onClose}>
              返回主页
            </button>
          </div>
        ) : (
          <main className="replay-body">
            {/* Spotlight Card */}
            {currentPoint && (
              <section className="replay-spotlight" aria-live="polite">
                <div className="replay-spotlight__main">
                  <div className="replay-spotlight__heading">
                    <span className="replay-spotlight__date">{formatDate(currentPoint.examDate)}</span>
                    <span className="replay-spotlight__kind">
                      {currentExam?.kind === 'comprehensive' ? '综合考试' : '单科测验'}
                      {currentExam?.term ? ` · ${currentExam.term}` : ''}
                    </span>
                    {milestoneTag && (
                      <span className="replay-spotlight__milestone">
                        {milestoneTag}
                      </span>
                    )}
                  </div>
                  <h2 className="replay-spotlight__title">{currentPoint.examName}</h2>
                </div>

                <div className="replay-spotlight__metrics">
                  {/* Score */}
                  <div className="replay-metric-box">
                    <span className="replay-metric-box__label">
                      <TrendingUp size={14} /> 考试成绩
                    </span>
                    <strong className="replay-metric-box__value">
                      {currentPoint.score !== null
                        ? formatScore(currentPoint.score, currentPoint.maxScore)
                        : '未录入'}
                    </strong>
                    <span className="replay-metric-box__sub">
                      {currentPoint.scoreRate !== null ? `得分率 ${currentPoint.scoreRate.toFixed(1)}%` : '得分率未录入'}
                      {currentPoint.scoreRateChange !== null && (
                        <em className={`change-text change-text--${currentPoint.scoreRateChange > 0 ? 'up' : currentPoint.scoreRateChange < 0 ? 'down' : 'steady'}`}>
                          ({signed(currentPoint.scoreRateChange, ' 点')})
                        </em>
                      )}
                    </span>
                  </div>

                  {/* Rank */}
                  <div className="replay-metric-box">
                    <span className="replay-metric-box__label">
                      <Trophy size={14} /> 年级排名
                    </span>
                    <strong className="replay-metric-box__value">
                      {currentPoint.rank !== null ? `第 ${currentPoint.rank} 名` : '未录入'}
                    </strong>
                    <span className="replay-metric-box__sub">
                      {currentPoint.participantCount
                        ? `共 ${currentPoint.participantCount} 人`
                        : ''}
                      {currentPoint.rankPercentile !== null && ` · 前 ${(100 - currentPoint.rankPercentile).toFixed(1)}%`}
                      {currentPoint.rankChange !== null && (
                        <em className={`change-text change-text--${currentPoint.rankChange > 0 ? 'up' : currentPoint.rankChange < 0 ? 'down' : 'steady'}`}>
                          ({currentPoint.rankChange > 0 ? `提升 ${currentPoint.rankChange} 名` : currentPoint.rankChange < 0 ? `后退 ${Math.abs(currentPoint.rankChange)} 名` : '持平'})
                        </em>
                      )}
                    </span>
                  </div>
                </div>

                {/* Comprehensive subject breakdown if available */}
                {currentExam?.kind === 'comprehensive' && currentSubjectScores.length > 0 && (
                  <div className="replay-spotlight__subjects">
                    {currentSubjectScores.map((subj) => (
                      <span key={subj.id} className="replay-subject-pill">
                        <strong>{REPLAY_METRIC_LABELS[subj.subject as SubjectCode] ?? subj.subject}</strong>
                        <span>{subj.score ?? '—'}{subj.full_score ? `/${subj.full_score}` : ''}</span>
                        {subj.rank_value && <small>第 {subj.rank_value} 名</small>}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Dynamic Chart */}
            <section className="replay-chart-container">
              <ReactEChartsCore
                echarts={echarts}
                option={option}
                className="replay-chart-canvas"
                style={{ height: '100%', minHeight: 320 }}
                notMerge
                onEvents={{
                  click: (params: { dataIndex?: number }) => {
                    if (typeof params.dataIndex === 'number') {
                      handleSeek(params.dataIndex)
                    }
                  },
                }}
              />
            </section>
          </main>
        )}

        {/* Completion Summary Modal Overlay */}
        {showSummary && summaryStats && (
          <div className="replay-summary-overlay" onClick={() => setShowSummary(false)}>
            <div className="replay-summary-card" onClick={(e) => e.stopPropagation()}>
              <div className="replay-summary-card__sparkle">
                <Sparkles size={28} />
              </div>
              <h2>🎉 成长轨迹播放完毕！</h2>
              <p className="replay-summary-card__desc">
                已完整回顾 <strong>{selectedProfile?.display_name ?? '成员'}</strong> 的 <strong>{summaryStats.count}</strong> 场考试历程。
              </p>

              <div className="replay-summary-card__grid">
                <div className="replay-summary-card__item">
                  <span>总分净变化</span>
                  <strong>
                    {summaryStats.scoreNetChange !== null
                      ? signed(summaryStats.scoreNetChange, ' 分')
                      : '—'}
                  </strong>
                  <small>
                    {summaryStats.rateNetChange !== null
                      ? `得分率 ${signed(summaryStats.rateNetChange, ' 个百分点')}`
                      : '记录平稳'}
                  </small>
                </div>
                <div className="replay-summary-card__item">
                  <span>历史最高分</span>
                  <strong>{summaryStats.maxScore !== null ? `${summaryStats.maxScore} 分` : '—'}</strong>
                  <small>{summaryStats.bestScoreExamName ?? '表现卓越'}</small>
                </div>
                <div className="replay-summary-card__item">
                  <span>最好名次</span>
                  <strong>{summaryStats.bestRank !== null ? `第 ${summaryStats.bestRank} 名` : '—'}</strong>
                  <small>{summaryStats.bestRankExamName ?? '闪耀时刻'}</small>
                </div>
              </div>

              <div className="replay-summary-card__actions">
                <button type="button" className="button button--primary" onClick={handleRestart}>
                  <RotateCcw size={16} /> 重新播放
                </button>
                <button type="button" className="button button--secondary" onClick={() => setShowSummary(false)}>
                  继续查看图表
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Playback Control Dock */}
        {points.length > 0 && (
          <footer className="replay-footer">
            {/* Scrubber Timeline Bar */}
            <div className="replay-scrubber">
              <div className="replay-scrubber__track">
                <div
                  className="replay-scrubber__fill"
                  style={{
                    width: points.length > 1 ? `${(safeIndex / (points.length - 1)) * 100}%` : '100%',
                  }}
                />
                {points.map((point, index) => {
                  const isPassed = index <= safeIndex
                  const isCurrent = index === safeIndex
                  return (
                    <button
                      key={point.examId}
                      type="button"
                      className={`replay-scrubber__node ${isPassed ? 'replay-scrubber__node--passed' : ''} ${isCurrent ? 'replay-scrubber__node--current' : ''}`}
                      style={{
                        left: points.length > 1 ? `${(index / (points.length - 1)) * 100}%` : '50%',
                      }}
                      onClick={() => handleSeek(index)}
                      title={`${point.examName} (${point.examDate})`}
                      aria-label={`跳转到第 ${index + 1} 场：${point.examName}`}
                    >
                      <span className="replay-scrubber__tooltip">
                        {point.examDate.slice(5)} {point.examName}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Controls Bar */}
            <div className="replay-controls-row">
              {/* Speed & Loop */}
              <div className="replay-controls-group">
                <button
                  type="button"
                  className={`replay-btn-pill ${isLoop ? 'replay-btn-pill--active' : ''}`}
                  onClick={() => setIsLoop((prev) => !prev)}
                  title={isLoop ? '循环播放：开' : '循环播放：关'}
                  aria-pressed={isLoop}
                >
                  <Repeat size={14} /> {isLoop ? '循环中' : '单次'}
                </button>

                <div className="replay-speed-selector">
                  {[0.5, 1, 1.5, 2].map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      className={`replay-speed-btn ${playbackSpeed === speed ? 'replay-speed-btn--active' : ''}`}
                      onClick={() => setPlaybackSpeed(speed)}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Playback Buttons */}
              <div className="replay-controls-main">
                <button
                  type="button"
                  className="icon-button replay-icon-btn"
                  onClick={() => handleSeek(0)}
                  disabled={safeIndex === 0}
                  title="跳转至第一场 (Home)"
                  aria-label="跳转至第一场"
                >
                  <SkipBack size={17} />
                </button>
                <button
                  type="button"
                  className="icon-button replay-icon-btn"
                  onClick={() => handleSeek(Math.max(0, safeIndex - 1))}
                  disabled={safeIndex === 0}
                  title="上一场 (←)"
                  aria-label="上一场"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  className="button button--primary replay-play-btn"
                  onClick={() => {
                    if (safeIndex >= points.length - 1 && !isPlaying) {
                      setCurrentIndex(0)
                      setIsPlaying(true)
                      setShowSummary(false)
                    } else {
                      setIsPlaying((prev) => !prev)
                    }
                  }}
                  title={isPlaying ? '暂停 (空格)' : '播放 (空格)'}
                  aria-label={isPlaying ? '暂停' : '播放'}
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
                  <span>{isPlaying ? '暂停' : safeIndex >= points.length - 1 ? '重播' : '播放'}</span>
                </button>
                <button
                  type="button"
                  className="icon-button replay-icon-btn"
                  onClick={() => handleSeek(Math.min(points.length - 1, safeIndex + 1))}
                  disabled={safeIndex >= points.length - 1}
                  title="下一场 (→)"
                  aria-label="下一场"
                >
                  <ChevronRight size={20} />
                </button>
                <button
                  type="button"
                  className="icon-button replay-icon-btn"
                  onClick={() => handleSeek(points.length - 1)}
                  disabled={safeIndex >= points.length - 1}
                  title="跳转至最新一场 (End)"
                  aria-label="跳转至最新一场"
                >
                  <SkipForward size={17} />
                </button>
              </div>

              {/* Keyboard Hints */}
              <div className="replay-controls-hints">
                <span>空格 播放/暂停 · ← → 步进 · Esc 退出</span>
              </div>
            </div>
          </footer>
        )}
      </div>
    </div>
  )
}
