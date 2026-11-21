import type { ScoreDisplayMode } from './score'

export interface AxisBounds {
  min?: number
  max?: number
  interval?: number
}

interface NiceBoundsOptions {
  clampMin?: number
  clampMax?: number
  targetSplits?: number
  minStep?: number
}

const NICE_MULTIPLIERS = [1, 2, 2.5, 5] as const

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function roundClean(value: number): number {
  const rounded = Number(value.toFixed(6))
  return Object.is(rounded, -0) ? 0 : rounded
}

function isMultiple(value: number, step: number): boolean {
  const quotient = value / step
  return Math.abs(quotient - Math.round(quotient)) < 1e-6
}

function chooseNiceBounds(
  paddedMin: number,
  paddedMax: number,
  options: NiceBoundsOptions = {},
): AxisBounds {
  const { clampMin, clampMax, targetSplits = 4, minStep = 1 } = options
  const safeSpan = Math.max(paddedMax - paddedMin, minStep)
  const rawStep = safeSpan / targetSplits
  const baseExp = Math.floor(Math.log10(Math.max(rawStep, 1e-6)))

  const candidateSteps = new Set<number>()
  for (let exp = baseExp - 1; exp <= baseExp + 2; exp += 1) {
    const magnitude = 10 ** exp
    for (const multiplier of NICE_MULTIPLIERS) {
      const step = roundClean(multiplier * magnitude)
      if (step < minStep) continue
      if (minStep >= 1 && !Number.isInteger(step)) continue
      candidateSteps.add(step)
    }
  }
  if (candidateSteps.size === 0) {
    candidateSteps.add(minStep)
  }

  let best: { min: number; max: number; step: number; score: number } | null = null

  for (const step of candidateSteps) {
    let niceMin = roundClean(Math.floor((paddedMin + 1e-9) / step) * step)
    let niceMax = roundClean(Math.ceil((paddedMax - 1e-9) / step) * step)

    if (clampMin !== undefined && niceMin < clampMin) niceMin = clampMin
    if (clampMax !== undefined && niceMax > clampMax) niceMax = clampMax
    if (niceMax <= niceMin) continue

    const span = niceMax - niceMin
    const splits = span / step
    const aligned = isMultiple(niceMin, step) && isMultiple(niceMax, step)

    let splitPenalty: number
    if (splits >= 3 && splits <= 5) {
      splitPenalty = Math.abs(splits - targetSplits) * 0.45
    } else if (splits >= 2 && splits <= 6) {
      splitPenalty = 2.2 + Math.abs(splits - targetSplits) * 0.8
    } else {
      splitPenalty = 10 + Math.abs(splits - targetSplits) * 2
    }

    const wastePenalty = Math.max(0, (span - safeSpan) / safeSpan) * 1.4
    const score = splitPenalty + wastePenalty + (aligned ? 0 : 0.15)

    if (!best || score < best.score) {
      best = { min: niceMin, max: niceMax, step, score }
    }
  }

  if (!best) {
    return {
      min: clampMin !== undefined ? Math.max(clampMin, Math.floor(paddedMin)) : Math.floor(paddedMin),
      max: clampMax !== undefined ? Math.min(clampMax, Math.ceil(paddedMax)) : Math.ceil(paddedMax),
    }
  }

  const exactGrid = isMultiple(best.min, best.step) && isMultiple(best.max, best.step)
  return exactGrid
    ? { min: best.min, max: best.max, interval: best.step }
    : { min: best.min, max: best.max }
}

/**
 * Computes compact, readable Y-axis bounds focused around the actual score data
 * so upward/downward trends are visually clear instead of compressed against 0.
 */
export function computeScoreAxisBounds(
  values: readonly (number | null | undefined)[],
  mode: ScoreDisplayMode,
  maxScores?: readonly (number | null | undefined)[],
): AxisBounds {
  const valid = values.filter(isFiniteNumber)
  if (valid.length === 0) {
    return mode === 'percentage' ? { min: 0, max: 100 } : {}
  }

  const dataMin = Math.min(...valid)
  const dataMax = Math.max(...valid)
  const rawSpan = dataMax - dataMin

  const validMaxScores = (maxScores ?? []).filter(isFiniteNumber).filter((v) => v > 0)
  const scaleRef = mode === 'percentage'
    ? 100
    : validMaxScores.length > 0
      ? Math.max(...validMaxScores)
      : Math.max(dataMax, 20)

  let effectiveSpan: number
  let bottomPad: number
  let topPad: number

  if (rawSpan === 0) {
    effectiveSpan = mode === 'percentage'
      ? 16
      : Math.max(10, Math.round(scaleRef * 0.08))
    bottomPad = effectiveSpan * 0.45
    topPad = effectiveSpan * 0.55
  } else {
    const minSpan = mode === 'percentage'
      ? 5
      : Math.max(6, Math.round(scaleRef * 0.03))
    effectiveSpan = Math.max(rawSpan, minSpan)
    const extra = Math.max(0, effectiveSpan - rawSpan)
    // Reserve extra breathing room at the top so node value labels never clip.
    bottomPad = extra * 0.45 + effectiveSpan * 0.16
    topPad = extra * 0.55 + effectiveSpan * 0.28
  }

  const clampMin = dataMin >= 0 ? 0 : undefined
  const clampMax = mode === 'percentage' && dataMax <= 100 ? 100 : undefined

  let paddedMin = clampMin !== undefined ? Math.max(clampMin, dataMin - bottomPad) : dataMin - bottomPad
  let paddedMax = clampMax !== undefined ? Math.min(clampMax, dataMax + topPad) : dataMax + topPad

  // Rebalance if clamping at 0 or 100% squashed the range too tightly.
  if (paddedMax - paddedMin < effectiveSpan * 0.6) {
    if (clampMax !== undefined && paddedMax >= clampMax) {
      paddedMin = clampMin !== undefined
        ? Math.max(clampMin, paddedMax - effectiveSpan)
        : paddedMax - effectiveSpan
    } else if (clampMin !== undefined && paddedMin <= clampMin) {
      paddedMax = clampMax !== undefined
        ? Math.min(clampMax, paddedMin + effectiveSpan)
        : paddedMin + effectiveSpan
    }
  }

  return chooseNiceBounds(paddedMin, paddedMax, {
    clampMin,
    clampMax,
    targetSplits: 4,
    minStep: 1,
  })
}

/**
 * Computes compact, readable Y-axis bounds for an inverted rank axis
 * (smaller rank sits near the top, larger rank sits near the bottom).
 */
export function computeRankAxisBounds(
  values: readonly (number | null | undefined)[],
): AxisBounds {
  const valid = values.filter(isFiniteNumber).filter((v) => v >= 1)
  if (valid.length === 0) {
    return { min: 1 }
  }

  const dataMin = Math.min(...valid)
  const dataMax = Math.max(...valid)
  const rawSpan = dataMax - dataMin

  let paddedMin: number
  let paddedMax: number

  if (rawSpan === 0) {
    const flatSpan = Math.max(10, Math.round(dataMax * 0.2))
    paddedMin = Math.max(1, dataMin - flatSpan * 0.55)
    paddedMax = dataMax + flatSpan * 0.45
    if (paddedMax - paddedMin < flatSpan * 0.6) {
      paddedMax = paddedMin + flatSpan
    }
  } else {
    const minSpan = Math.max(6, Math.round(dataMax * 0.06))
    const effectiveSpan = Math.max(rawSpan, minSpan)
    const extra = Math.max(0, effectiveSpan - rawSpan)
    // Because the rank axis is inverted, dataMin is at the visual top (needs room for labels).
    const topPad = extra * 0.55 + effectiveSpan * 0.28
    const bottomPad = extra * 0.45 + effectiveSpan * 0.16
    paddedMin = Math.max(1, dataMin - topPad)
    paddedMax = dataMax + bottomPad
  }

  return chooseNiceBounds(paddedMin, paddedMax, {
    clampMin: 1,
    targetSplits: 4,
    minStep: 1,
  })
}
