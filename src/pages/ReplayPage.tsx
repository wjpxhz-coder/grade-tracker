import type { EChartsOption } from 'echarts'
import { LineChart } from 'echarts/charts'
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import ReactEChartsCoreImport from 'echarts-for-react/lib/core'
import {
  ArrowLeft,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sparkles,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState'
import { LoadingScreen } from '../components/LoadingScreen'
import { METRIC_LABELS } from '../components/TrendCharts'
import { useStudentScope } from '../contexts/StudentScopeContext'
import { useTheme } from '../contexts/ThemeContext'
import { useExamData } from '../hooks/useExamData'
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
import type { Exam, SubjectScore } from '../types/domain'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, AriaComponent, CanvasRenderer])

const ReactEChartsCore = unwrapDefaultExport<typeof ReactEChartsCoreImport>(ReactEChartsCoreImport)

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

export function ReplayPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { studentId, selectedProfile } = useStudentScope()
  const { resolvedTheme } = useTheme()
  const { exams, subjectScores, isLoading, error, refetch } = useExamData(studentId)

  const initialMetric = (searchParams.get('metric') as TrendMetric) || 'total'
  const [metric, setMetric] = useState<TrendMetric>(initialMetric)
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(true)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1)
  const [isLoop, setIsLoop] = useState<boolean>(false)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)
  const [isLandscape, setIsLandscape] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(orientation: landscape)').matches
  })

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    document.addEventListener('webkitfullscreenchange', handleFsChange)

    let mql: MediaQueryList | null = null
    let handleOrientation: ((e: MediaQueryListEvent) => void) | null = null

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      mql = window.matchMedia('(orientation: landscape)')
      handleOrientation = (e: MediaQueryListEvent) => {
        setIsLandscape(e.matches)
      }
      if (mql.addEventListener) {
        mql.addEventListener('change', handleOrientation)
      } else if ('addListener' in mql) {
        (mql as unknown as { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(handleOrientation)
      }
    }

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange)
      document.removeEventListener('webkitfullscreenchange', handleFsChange)
      if (mql && handleOrientation) {
        if (mql.removeEventListener) {
          mql.removeEventListener('change', handleOrientation)
        } else if ('removeListener' in mql) {
          (mql as unknown as { removeListener: (cb: (e: MediaQueryListEvent) => void) => void }).removeListener(handleOrientation)
        }
      }
    }
  }, [])

  const toggleFullscreenLandscape = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        const docEl = document.documentElement as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>
        }
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen()
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen()
        }
        if ('orientation' in screen && 'lock' in screen.orientation) {
          try {
            await (screen.orientation as unknown as { lock: (orientation: string) => Promise<void> }).lock('landscape')
          } catch {
            // Orientation lock can fail on unsupported devices
          }
        }
      } else {
        const doc = document as Document & {
          webkitExitFullscreen?: () => Promise<void>
        }
        if (doc.exitFullscreen) {
          await doc.exitFullscreen()
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen()
        }
        if ('orientation' in screen && 'unlock' in screen.orientation) {
          try {
            screen.orientation.unlock()
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }, [])

  const metrics: TrendMetric[] = ['total', ...SUBJECT_CODES]

  const chartTheme = resolvedTheme === 'dark'
    ? { muted: '#aeb9b1', line: '#3d4942', split: '#232e27', tooltip: 'rgba(23,30,26,.98)', ink: '#eef3ef' }
    : { muted: '#58655d', line: '#cbd3cc', split: '#eef2ed', tooltip: 'rgba(255,254,251,.98)', ink: '#17231d' }

  const accentColor = selectedProfile?.color_key === 'peach'
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

  // Timer for progression
  useEffect(() => {
    if (!isPlaying || points.length <= 1) return

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
        return prev
      })
    }, intervalTime)

    return () => clearInterval(timer)
  }, [isPlaying, playbackSpeed, isLoop, points.length])

  // Keyboard navigation
  useEffect(() => {
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
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [points.length])

  if (isLoading) return <LoadingScreen />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />

  const safeIndex = Math.min(Math.max(0, currentIndex), Math.max(0, points.length - 1))
  const currentPoint = points[safeIndex] as TrendPoint | undefined
  const currentExam = currentPoint ? exams.find((e) => e.id === currentPoint.examId) : undefined
  const currentSubjectScores = currentPoint ? subjectScores.filter((s) => s.exam_id === currentPoint.examId) : []

  // Milestone Tag calculation
  const milestoneTag = (() => {
    if (!currentPoint || points.length === 0) return null
    const historyPoints = points.slice(0, safeIndex + 1)
    if (safeIndex === 0) return '🌱 成长起点'

    const validScores = historyPoints.map((p) => p.score).filter((v): v is number => v !== null)
    if (currentPoint.score !== null && validScores.length > 0 && currentPoint.score === Math.max(...validScores)) {
      return '🌟 创阶段最高分'
    }

    const validRanks = historyPoints.map((p) => p.rank).filter((v): v is number => v !== null)
    if (currentPoint.rank !== null && validRanks.length > 0 && currentPoint.rank === Math.min(...validRanks)) {
      return '🏆 创阶段最好名次'
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
  })()

  // Summary at the end of playback
  const isAtEnd = safeIndex >= points.length - 1 && points.length > 1
  const netScoreChange = (points.length > 1 && points[points.length - 1]?.score !== null && points[0]?.score !== null)
    ? (points[points.length - 1]!.score! - points[0]!.score!)
    : null

  const labels = points.map((p) => p.examDate.slice(5).replace('-', '/'))
  const rawScoreValues = points.map((p, idx) => (idx <= safeIndex ? (displayMode === 'percentage' ? p.scoreRate : p.score) : null))
  const rankValues = points.map((p, idx) => (idx <= safeIndex ? p.rank : null))

  const option: EChartsOption = {
    animation: true,
    animationDuration: 300,
    animationDurationUpdate: 250,
    aria: { enabled: true },
    color: [accentColor, resolvedTheme === 'dark' ? '#e19b7d' : '#a65f46'],
    grid: [
      { left: 52, right: 24, top: 34, height: '40%' },
      { left: 52, right: 24, top: '56%', height: '36%' },
    ],
    legend: {
      top: 2,
      data: [displayMode === 'percentage' ? '得分率' : '原始分', '年级排名'],
      textStyle: { color: chartTheme.muted, fontSize: 12 },
    },
    tooltip: {
      trigger: 'item',
      confine: true,
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
        return `<div style="font-weight:600;margin-bottom:3px;">${point.examName}</div><div style="font-size:11px;opacity:0.8;margin-bottom:5px;">${point.examDate}</div><div>分数：${scoreText} (${rateText})</div><div>变化：${scoreDeltaText}</div><div>排名：${rankText}</div>`
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
        cursor: 'pointer',
        lineStyle: { width: 3.5, color: accentColor },
        label: {
          show: true,
          position: 'top',
          distance: 6,
          fontSize: 11,
          fontWeight: 600,
          color: accentColor,
          formatter: (params) => {
            const index = Number(params.dataIndex ?? 0)
            if (index > safeIndex) return ''
            const point = points[index]
            if (!point) return ''
            if (displayMode === 'percentage') {
              return point.scoreRate === null ? '' : `${point.scoreRate.toFixed(1)}%`
            }
            return point.score === null ? '' : `${point.score}分`
          },
        },
        labelLayout: { hideOverlap: true },
        emphasis: {
          scale: 1.35,
          focus: 'series',
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(79, 124, 106, 0.26)' },
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
                  color: accentColor,
                  borderColor: chartTheme.tooltip,
                  borderWidth: 4,
                  shadowBlur: 10,
                  shadowColor: accentColor,
                }
              : { color: accentColor },
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
        cursor: 'pointer',
        lineStyle: { width: 2.5 },
        label: {
          show: true,
          position: 'top',
          distance: 6,
          fontSize: 11,
          fontWeight: 600,
          color: resolvedTheme === 'dark' ? '#e19b7d' : '#a65f46',
          formatter: (params) => {
            const index = Number(params.dataIndex ?? 0)
            if (index > safeIndex) return ''
            const point = points[index]
            if (!point || point.rank === null) return ''
            return `${point.rank}名`
          },
        },
        labelLayout: { hideOverlap: true },
        emphasis: {
          scale: 1.35,
          focus: 'series',
        },
        data: rankValues.map((value, idx) => {
          const isCurrent = idx === safeIndex
          return {
            value,
            symbolSize: isCurrent ? 14 : 7,
            itemStyle: isCurrent
              ? {
                  borderColor: chartTheme.tooltip,
                  borderWidth: 4,
                  shadowBlur: 10,
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
  }

  const handleMetricChange = (newMetric: TrendMetric) => {
    setMetric(newMetric)
    setSearchParams({ metric: newMetric })
    setCurrentIndex(0)
    setIsPlaying(true)
  }

  return (
    <div className={`replay-page ${isLandscape ? 'replay-page--landscape' : ''} ${isFullscreen ? 'replay-page--fullscreen' : ''}`}>
      {/* Full-bleed Top Navigation */}
      <header className="replay-page__topbar">
        <div className="replay-page__topbar-left">
          <Link to="/" className="replay-page__back-btn" aria-label="返回总览">
            <ArrowLeft size={17} />
            <span>返回总览</span>
          </Link>
          <div className="replay-page__heading">
            <h1>{selectedProfile?.display_name ?? '成员'}的{METRIC_LABELS[metric]}轨迹</h1>
            <span className="replay-page__sub">
              {points.length > 0 ? `第 ${safeIndex + 1} / ${points.length} 场 · ${points[0]?.examDate} ~ ${points[points.length - 1]?.examDate}` : '暂无数据'}
            </span>
          </div>
        </div>

        <div className="replay-page__topbar-right">
          {/* Metric Tabs */}
          <div className="replay-page__metric-tabs" role="tablist" aria-label="科目切换">
            {metrics.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={metric === item}
                className={`replay-page__metric-tab ${metric === item ? 'replay-page__metric-tab--active' : ''}`}
                onClick={() => handleMetricChange(item)}
              >
                {METRIC_LABELS[item]}
              </button>
            ))}
          </div>

          {/* Raw / Rate Toggle */}
          <div className="segmented segmented--small" role="group" aria-label="分数显示模式">
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

          {/* Fullscreen Landscape Toggle */}
          <button
            type="button"
            className={`replay-page__fs-btn ${isFullscreen ? 'replay-page__fs-btn--active' : ''}`}
            onClick={() => void toggleFullscreenLandscape()}
            title={isFullscreen ? '退出全屏' : '全屏横屏展示'}
            aria-label={isFullscreen ? '退出全屏' : '全屏横屏展示'}
          >
            {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
            <span className="replay-page__fs-btn-text">{isFullscreen ? '退出全屏' : '全屏横屏'}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      {points.length === 0 ? (
        <main className="replay-page__empty">
          <BookOpenCheck size={48} />
          <h2>还没有{METRIC_LABELS[metric]}记录</h2>
          <p>请选择其他科目，或先在主页录入考试成绩。</p>
          <Link to="/" className="button button--primary">
            返回主页
          </Link>
        </main>
      ) : (
        <main className="replay-page__stage">
          {/* Integrated Spotlight Header Strip */}
          {currentPoint && (
            <section className="replay-card" aria-live="polite">
              <div className="replay-card__header">
                <div className="replay-card__tags">
                  <span className="replay-card__date">{formatDate(currentPoint.examDate)}</span>
                  <span className="replay-card__kind">
                    {currentExam?.kind === 'comprehensive' ? '综合考试' : '单科测验'}
                    {currentExam?.term ? ` · ${currentExam.term}` : ''}
                  </span>
                  {milestoneTag && <span className="replay-card__milestone">{milestoneTag}</span>}
                </div>
                <h2 className="replay-card__title">{currentPoint.examName}</h2>
                {/* Subject Breakdown if comprehensive */}
                {currentExam?.kind === 'comprehensive' && currentSubjectScores.length > 0 && (
                  <div className="replay-card__subjects">
                    {currentSubjectScores.map((subj) => (
                      <span key={subj.id} className="replay-card__subject-chip">
                        <strong>{METRIC_LABELS[subj.subject as SubjectCode] ?? subj.subject}</strong>
                        <span>{subj.score ?? '—'}{subj.full_score ? `/${subj.full_score}` : ''}</span>
                        {subj.rank_value && <small>#{subj.rank_value}</small>}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="replay-card__stats">
                {/* Score */}
                <div className="replay-card__stat-item">
                  <span className="replay-card__stat-label">
                    <TrendingUp size={13} /> 成绩与得分率
                  </span>
                  <div className="replay-card__stat-main">
                    <strong>
                      {currentPoint.score !== null
                        ? formatScore(currentPoint.score, currentPoint.maxScore)
                        : '未录入'}
                    </strong>
                    {currentPoint.scoreRate !== null && (
                      <small className="replay-card__rate-badge">
                        {currentPoint.scoreRate.toFixed(1)}%
                      </small>
                    )}
                  </div>
                  {currentPoint.scoreRateChange !== null && (
                    <span className={`replay-card__delta change-text--${currentPoint.scoreRateChange > 0 ? 'up' : currentPoint.scoreRateChange < 0 ? 'down' : 'steady'}`}>
                      较上次 {signed(currentPoint.scoreRateChange, ' 个百分点')}
                    </span>
                  )}
                </div>

                {/* Rank */}
                <div className="replay-card__stat-item">
                  <span className="replay-card__stat-label">
                    <Trophy size={13} /> 年级排名
                  </span>
                  <div className="replay-card__stat-main">
                    <strong>
                      {currentPoint.rank !== null ? `第 ${currentPoint.rank} 名` : '未录入'}
                    </strong>
                    {currentPoint.rankPercentile !== null && (
                      <small className="replay-card__rate-badge">
                        前 {(100 - currentPoint.rankPercentile).toFixed(1)}%
                      </small>
                    )}
                  </div>
                  {currentPoint.rankChange !== null ? (
                    <span className={`replay-card__delta change-text--${currentPoint.rankChange > 0 ? 'up' : currentPoint.rankChange < 0 ? 'down' : 'steady'}`}>
                      较上次 {currentPoint.rankChange > 0 ? `提升 ${currentPoint.rankChange} 名` : currentPoint.rankChange < 0 ? `后退 ${Math.abs(currentPoint.rankChange)} 名` : '持平'}
                    </span>
                  ) : currentPoint.participantCount ? (
                    <span className="replay-card__delta">共 {currentPoint.participantCount} 人参考</span>
                  ) : null}
                </div>
              </div>
            </section>
          )}

          {/* Full-bleed ECharts Canvas */}
          <section className="replay-chart-stage">
            <ReactEChartsCore
              echarts={echarts}
              option={option}
              className="replay-chart-canvas"
              style={{ width: '100%', height: '100%' }}
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

      {/* Full-width Playback Dock */}
      {points.length > 0 && (
        <footer className="replay-dock">
          {/* Timeline Scrubber */}
          <div className="replay-dock__scrubber">
            <div className="replay-dock__track">
              <div
                className="replay-dock__fill"
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
                    className={`replay-dock__node ${isPassed ? 'replay-dock__node--passed' : ''} ${isCurrent ? 'replay-dock__node--current' : ''}`}
                    style={{
                      left: points.length > 1 ? `${(index / (points.length - 1)) * 100}%` : '50%',
                    }}
                    onClick={() => handleSeek(index)}
                    title={`${point.examName} (${point.examDate})`}
                    aria-label={`跳转到第 ${index + 1} 场：${point.examName}`}
                  >
                    <span className="replay-dock__tooltip">
                      {point.examDate.slice(5)} {point.examName}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Playback Controls Row */}
          <div className="replay-dock__controls">
            {/* Left: Speed & Loop */}
            <div className="replay-dock__group-left">
              <button
                type="button"
                className={`replay-dock__loop-btn ${isLoop ? 'replay-dock__loop-btn--active' : ''}`}
                onClick={() => setIsLoop((prev) => !prev)}
                title={isLoop ? '循环播放：已开启' : '循环播放：单次'}
                aria-pressed={isLoop}
              >
                <Repeat size={13} />
                <span>{isLoop ? '循环' : '单次'}</span>
              </button>

              <div className="replay-dock__speed-group">
                {[1, 1.5, 2].map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    className={`replay-dock__speed-btn ${playbackSpeed === speed ? 'replay-dock__speed-btn--active' : ''}`}
                    onClick={() => setPlaybackSpeed(speed)}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            {/* Center: Main Step Buttons */}
            <div className="replay-dock__group-center">
              <button
                type="button"
                className="icon-button replay-dock__icon-btn"
                onClick={() => handleSeek(0)}
                disabled={safeIndex === 0}
                title="第一场 (Home)"
                aria-label="跳转至第一场"
              >
                <SkipBack size={16} />
              </button>
              <button
                type="button"
                className="icon-button replay-dock__icon-btn"
                onClick={() => handleSeek(Math.max(0, safeIndex - 1))}
                disabled={safeIndex === 0}
                title="上一场 (←)"
                aria-label="上一场"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="button button--primary replay-dock__play-btn"
                onClick={() => {
                  if (safeIndex >= points.length - 1 && !isPlaying) {
                    setCurrentIndex(0)
                    setIsPlaying(true)
                  } else {
                    setIsPlaying((prev) => !prev)
                  }
                }}
                title={isPlaying ? '暂停 (空格)' : '播放 (空格)'}
                aria-label={isPlaying ? '暂停' : isAtEnd ? '重新播放' : '播放'}
              >
                {isPlaying ? <Pause size={17} /> : isAtEnd ? <RotateCcw size={17} /> : <Play size={17} />}
                <span>{isPlaying ? '暂停' : isAtEnd ? '重播' : '播放'}</span>
              </button>
              <button
                type="button"
                className="icon-button replay-dock__icon-btn"
                onClick={() => handleSeek(Math.min(points.length - 1, safeIndex + 1))}
                disabled={safeIndex >= points.length - 1}
                title="下一场 (→)"
                aria-label="下一场"
              >
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                className="icon-button replay-dock__icon-btn"
                onClick={() => handleSeek(points.length - 1)}
                disabled={safeIndex >= points.length - 1}
                title="最新一场 (End)"
                aria-label="跳转至最新一场"
              >
                <SkipForward size={16} />
              </button>
            </div>

            {/* Right: Inline completion note or hint */}
            <div className="replay-dock__group-right">
              {isAtEnd && netScoreChange !== null ? (
                <span className="replay-dock__status-badge">
                  <Sparkles size={13} />
                  <span>已播完全部 {points.length} 场 (总分 {signed(netScoreChange, '分')})</span>
                </span>
              ) : (
                <span className="replay-dock__hint-text">按空格键暂停 · 方向键切换</span>
              )}
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
