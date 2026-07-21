import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, CheckCircle2, CircleAlert, Clock3, LoaderCircle, LockKeyhole, RefreshCcw, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useToast } from '../contexts/ToastContext'
import { aiAnalysisErrorMessage, analyzeExamImages, listAiAttachmentInsights } from '../lib/api'
import {
  AI_IMAGE_ANALYSIS_BATCH_SIZE,
  AI_IMAGE_ANALYSIS_MODEL,
  AI_IMAGE_ANALYSIS_PROMPT_VERSION,
  ATTACHMENT_CATEGORY_LABELS,
  SUBJECT_LABELS,
} from '../lib/constants'
import { formatDateTime } from '../lib/format'
import type { AiAttachmentInsight, AiImageAnalysisResult, Attachment } from '../types/domain'

type AnalysisState = 'cached' | 'pending' | 'changed' | 'outdated' | 'analyzing' | 'failed'

const STATE_LABELS: Record<AnalysisState, string> = {
  cached: '已缓存',
  pending: '待分析',
  changed: '图片已变化',
  outdated: '摘要需更新',
  analyzing: '分析中',
  failed: '分析失败',
}

const STOP_BATCH_ERROR_CODES = new Set([
  'provider_auth_error',
  'provider_rate_limited',
  'provider_timeout',
  'provider_unreachable',
])

function hasImageChanged(attachment: Attachment, insight: AiAttachmentInsight | undefined): boolean {
  return Boolean(insight && attachment.sha256 && insight.sha256 !== attachment.sha256)
}

function usesCurrentAnalyzer(insight: AiAttachmentInsight | undefined): boolean {
  return Boolean(
    insight &&
    insight.model === AI_IMAGE_ANALYSIS_MODEL &&
    insight.prompt_version === AI_IMAGE_ANALYSIS_PROMPT_VERSION,
  )
}

async function analyzeInBatches(examId: string, attachmentIds: string[], force: boolean): Promise<AiImageAnalysisResult> {
  const combined: AiImageAnalysisResult = {
    examId,
    model: AI_IMAGE_ANALYSIS_MODEL,
    promptVersion: AI_IMAGE_ANALYSIS_PROMPT_VERSION,
    counts: { total: 0, cached: 0, analyzed: 0, failed: 0 },
    items: [],
    usage: null,
  }
  let hasUsage = false
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

  for (let offset = 0; offset < attachmentIds.length; offset += AI_IMAGE_ANALYSIS_BATCH_SIZE) {
    const batch = attachmentIds.slice(offset, offset + AI_IMAGE_ANALYSIS_BATCH_SIZE)
    let result: AiImageAnalysisResult
    try {
      result = await analyzeExamImages({ examId, attachmentIds: batch, force })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 图片分析失败，请稍后重试。'
      const remaining = attachmentIds.slice(offset)
      combined.counts.total += remaining.length
      combined.counts.failed += remaining.length
      combined.items.push(...remaining.map((attachmentId) => ({ attachmentId, status: 'failed' as const, error: message })))
      break
    }
    combined.model = result.model
    combined.promptVersion = result.promptVersion
    combined.counts.total += result.counts.total
    combined.counts.cached += result.counts.cached
    combined.counts.analyzed += result.counts.analyzed
    combined.counts.failed += result.counts.failed
    combined.items.push(...result.items)
    if (result.usage) {
      hasUsage = true
      usage.prompt_tokens += Number(result.usage.prompt_tokens) || 0
      usage.completion_tokens += Number(result.usage.completion_tokens) || 0
      usage.total_tokens += Number(result.usage.total_tokens) || 0
    }
    const stopError = result.items.find((item) =>
      item.status === 'failed' && item.error && STOP_BATCH_ERROR_CODES.has(item.error),
    )?.error
    if (stopError) {
      const remaining = attachmentIds.slice(offset + batch.length)
      combined.counts.total += remaining.length
      combined.counts.failed += remaining.length
      combined.items.push(...remaining.map((attachmentId) => ({ attachmentId, status: 'failed' as const, error: stopError })))
      break
    }
  }
  combined.usage = hasUsage ? usage : null
  return combined
}

function isPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /没有权限|登录已失效|permission|forbidden|unauthorized|row.level|jwt/i.test(message)
}

function attachmentLabel(attachment: Attachment): string {
  const subject = attachment.subject ? `${SUBJECT_LABELS[attachment.subject]} · ` : ''
  return `${subject}${ATTACHMENT_CATEGORY_LABELS[attachment.category]} · 第 ${attachment.page_order + 1} 页`
}

function confidenceLabel(value: number): string {
  const normalized = Number(value)
  if (!Number.isFinite(normalized)) return '置信度未提供'
  return `置信度 ${Math.round(Math.min(1, Math.max(0, normalized)) * 100)}%`
}

export function AiImageAnalysisPanel({ examId, attachments, canAnalyze }: {
  examId: string
  attachments: Attachment[]
  canAnalyze: boolean
}) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})
  const insightsQuery = useQuery({
    queryKey: ['ai-attachment-insights', examId],
    queryFn: () => listAiAttachmentInsights(examId),
    enabled: attachments.length > 0,
    staleTime: 60 * 1000,
  })

  const insightMap = useMemo(() => {
    const map = new Map<string, AiAttachmentInsight>()
    const attachmentMap = new Map(attachments.map((attachment) => [attachment.id, attachment]))
    for (const insight of insightsQuery.data ?? []) {
      const attachment = attachmentMap.get(insight.attachment_id)
      if (!attachment) continue
      const current = map.get(insight.attachment_id)
      if (!current) {
        map.set(insight.attachment_id, insight)
        continue
      }
      const score = (candidate: AiAttachmentInsight) =>
        (attachment.sha256 && candidate.sha256 === attachment.sha256 ? 2 : 0) +
        (usesCurrentAnalyzer(candidate) ? 1 : 0)
      if (score(insight) > score(current)) map.set(insight.attachment_id, insight)
    }
    return map
  }, [attachments, insightsQuery.data])

  const pendingOrStaleIds = useMemo(() => attachments
    .filter((attachment) => {
      const insight = insightMap.get(attachment.id)
      return !insight || hasImageChanged(attachment, insight) || !usesCurrentAnalyzer(insight)
    })
    .map((attachment) => attachment.id), [attachments, insightMap])

  const analysisMutation = useMutation({
    mutationFn: (variables: { attachmentIds: string[]; force: boolean }) => analyzeInBatches(examId, variables.attachmentIds, variables.force),
    onSuccess: (result) => {
      setItemErrors((current) => {
        const next = { ...current }
        for (const item of result.items) {
          if (item.status === 'failed') next[item.attachmentId] = aiAnalysisErrorMessage(item.error)
          else delete next[item.attachmentId]
        }
        return next
      })
      if (result.counts.failed) {
        showToast(`已完成 ${result.counts.analyzed + result.counts.cached} 张，${result.counts.failed} 张分析失败`, 'error')
      } else {
        const cachedCopy = result.counts.cached ? `，${result.counts.cached} 张使用缓存` : ''
        showToast(`${result.counts.analyzed} 张图片分析完成${cachedCopy}`, 'success')
      }
    },
    onError: (error, variables) => {
      const message = error instanceof Error ? error.message : 'AI 图片分析失败，请稍后重试。'
      setItemErrors((current) => {
        const next = { ...current }
        for (const attachmentId of variables.attachmentIds) next[attachmentId] = message
        return next
      })
      showToast(message, 'error')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['ai-attachment-insights', examId] }),
  })

  const activeIds = new Set(analysisMutation.isPending ? analysisMutation.variables?.attachmentIds ?? [] : [])
  const permissionDenied = isPermissionError(insightsQuery.error)

  return (
    <section className="panel detail-section ai-analysis-section" aria-labelledby="ai-image-analysis-title">
      <div className="section-heading ai-analysis-heading">
        <div>
          <p className="eyebrow">AI 图片分析</p>
          <h2 id="ai-image-analysis-title">图片摘要</h2>
          <p className="ai-analysis-heading__copy">摘要保存后可直接阅读，也可供后续成绩分析复用，避免重复读取图片。分析时图片会发送至已配置的 AI 服务；超过 {AI_IMAGE_ANALYSIS_BATCH_SIZE} 张会自动分批。</p>
        </div>
        {canAnalyze && attachments.length > 0 && !insightsQuery.isError ? (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => analysisMutation.mutate({ attachmentIds: pendingOrStaleIds, force: false })}
            disabled={analysisMutation.isPending || insightsQuery.isLoading || pendingOrStaleIds.length === 0}
          >
            {analysisMutation.isPending ? <LoaderCircle className="spin" size={16} /> : pendingOrStaleIds.length ? <Sparkles size={16} /> : <CheckCircle2 size={16} />}
            {pendingOrStaleIds.length ? `分析全部未分析/需更新图片 (${pendingOrStaleIds.length})` : '全部图片已缓存'}
          </button>
        ) : null}
      </div>

      {!canAnalyze && attachments.length > 0 ? (
        <div className="ai-analysis-permission-note"><LockKeyhole size={16} /><span>你可以阅读已有摘要；当前账号没有重新分析权限。</span></div>
      ) : null}

      {!attachments.length ? (
        <div className="ai-analysis-state ai-analysis-state--empty">
          <Bot size={27} />
          <div><strong>还没有可分析的图片</strong><p>上传试卷、答题卡或订正图片后，摘要会按图片保存在这里。</p></div>
        </div>
      ) : insightsQuery.isLoading ? (
        <div className="ai-analysis-state" role="status"><LoaderCircle className="spin" size={24} /><div><strong>正在读取图片摘要</strong><p>只读取已保存的文字结果，不会重新调用 AI。</p></div></div>
      ) : insightsQuery.isError ? (
        <div className={`ai-analysis-state ai-analysis-state--error${permissionDenied ? ' ai-analysis-state--permission' : ''}`} role="alert">
          {permissionDenied ? <LockKeyhole size={24} /> : <CircleAlert size={24} />}
          <div>
            <strong>{permissionDenied ? '没有权限读取图片摘要' : '图片摘要读取失败'}</strong>
            <p>{permissionDenied ? '请确认当前账号拥有这场考试的查看权限。' : (insightsQuery.error instanceof Error ? insightsQuery.error.message : '请稍后重试。')}</p>
          </div>
          {!permissionDenied ? <button className="button button--secondary" type="button" onClick={() => void insightsQuery.refetch()}><RefreshCcw size={15} />重新读取</button> : null}
        </div>
      ) : (
        <div className="ai-analysis-list">
          {attachments.map((attachment) => {
            const insight = insightMap.get(attachment.id)
            const changed = hasImageChanged(attachment, insight)
            const outdated = Boolean(insight && !usesCurrentAnalyzer(insight))
            const active = activeIds.has(attachment.id)
            const itemError = itemErrors[attachment.id]
            const state: AnalysisState = active ? 'analyzing' : itemError ? 'failed' : !insight ? 'pending' : changed ? 'changed' : outdated ? 'outdated' : 'cached'
            const actionLabel = itemError ? '失败重试' : insight ? '重新分析' : '分析这张'
            return (
              <article className={`ai-analysis-card ai-analysis-card--${state}`} key={attachment.id} aria-label={`${attachment.original_name}的 AI 图片摘要`}>
                <header className="ai-analysis-card__header">
                  <div>
                    <span className="ai-analysis-card__attachment">{attachmentLabel(attachment)}</span>
                    <h3>{insight?.title || attachment.original_name}</h3>
                  </div>
                  <span className={`ai-analysis-status ai-analysis-status--${state}`}>{active ? <LoaderCircle className="spin" size={13} /> : null}{STATE_LABELS[state]}</span>
                </header>

                {state === 'pending' ? (
                  <div className="ai-analysis-card__placeholder"><Sparkles size={18} /><p>这张图片还没有文字摘要，分析后会保存到栏目中。</p></div>
                ) : null}
                {state === 'failed' ? (
                  <div className="ai-analysis-card__message ai-analysis-card__message--error" role="alert"><CircleAlert size={16} /><p>{itemError}</p></div>
                ) : null}
                {state === 'changed' ? (
                  <div className="ai-analysis-card__message"><CircleAlert size={16} /><p>当前图片内容已变化，下方仍是上一版摘要。</p></div>
                ) : null}
                {state === 'outdated' ? (
                  <div className="ai-analysis-card__message"><CircleAlert size={16} /><p>这份摘要由旧版模型或分析规则生成，下方内容仍可阅读。</p></div>
                ) : null}
                {state === 'analyzing' && !insight ? (
                  <div className="ai-analysis-card__placeholder" role="status"><LoaderCircle className="spin" size={18} /><p>正在识别图片内容并生成可复用摘要…</p></div>
                ) : null}

                {insight ? (
                  <div className="ai-analysis-card__content">
                    <p className="ai-analysis-card__summary">{insight.summary}</p>
                    {insight.key_findings.length ? (
                      <div className="ai-analysis-card__findings">
                        <strong>关键发现</strong>
                        <ul>{insight.key_findings.map((finding, index) => <li key={`${attachment.id}-finding-${index}`}>{finding}</li>)}</ul>
                      </div>
                    ) : null}
                    <footer>
                      <span>{confidenceLabel(insight.confidence)}</span>
                      <span>{insight.model}</span>
                      <time dateTime={insight.updated_at}><Clock3 size={13} />分析于 {formatDateTime(insight.updated_at)}</time>
                    </footer>
                  </div>
                ) : null}

                {canAnalyze ? (
                  <div className="ai-analysis-card__actions">
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={() => analysisMutation.mutate({ attachmentIds: [attachment.id], force: Boolean(insight) })}
                      disabled={analysisMutation.isPending}
                    >
                      {active ? <LoaderCircle className="spin" size={15} /> : itemError ? <RefreshCcw size={15} /> : <Sparkles size={15} />}
                      {active ? '正在分析' : actionLabel}
                    </button>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
