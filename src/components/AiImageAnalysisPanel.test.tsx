import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../contexts/ToastContext'
import { analyzeExamImages, listAiAttachmentInsights } from '../lib/api'
import type { AiAttachmentInsight, Attachment } from '../types/domain'
import { AiImageAnalysisPanel } from './AiImageAnalysisPanel'

vi.mock('../lib/api', () => ({
  aiAnalysisErrorMessage: (code?: string) => code === 'provider_error'
    ? 'AI 服务暂时不可用，请稍后重试。'
    : code === 'provider_rate_limited'
      ? 'AI 服务当前繁忙，请稍后重试。'
      : (code ?? 'AI 图片分析失败，请稍后重试。'),
  analyzeExamImages: vi.fn(),
  listAiAttachmentInsights: vi.fn(),
}))

const attachments: Attachment[] = [
  {
    id: 'attachment-current', exam_id: 'exam-1', uploader_id: 'user-1', category: 'answer_sheet', subject: 'math',
    storage_path: 'exam/current.webp', thumbnail_path: 'exam/current-thumb.webp', original_name: '数学答题卡.png', mime_type: 'image/webp',
    byte_size: 1024, thumbnail_byte_size: 256, width: 1200, height: 1600, page_order: 0, sha256: 'a'.repeat(64),
    created_at: '2026-07-17T08:00:00Z', deleted_at: null, deleted_by: null,
  },
  {
    id: 'attachment-changed', exam_id: 'exam-1', uploader_id: 'user-1', category: 'correction', subject: 'math',
    storage_path: 'exam/changed.webp', thumbnail_path: 'exam/changed-thumb.webp', original_name: '数学订正.png', mime_type: 'image/webp',
    byte_size: 1100, thumbnail_byte_size: 260, width: 1200, height: 1600, page_order: 1, sha256: 'b'.repeat(64),
    created_at: '2026-07-17T08:01:00Z', deleted_at: null, deleted_by: null,
  },
  {
    id: 'attachment-pending', exam_id: 'exam-1', uploader_id: 'user-1', category: 'paper', subject: null,
    storage_path: 'exam/pending.webp', thumbnail_path: 'exam/pending-thumb.webp', original_name: '试卷第二页.png', mime_type: 'image/webp',
    byte_size: 1200, thumbnail_byte_size: 280, width: 1200, height: 1600, page_order: 2, sha256: 'c'.repeat(64),
    created_at: '2026-07-17T08:02:00Z', deleted_at: null, deleted_by: null,
  },
]

function insight(overrides: Partial<AiAttachmentInsight> = {}): AiAttachmentInsight {
  return {
    id: 'insight-current', attachment_id: 'attachment-current', exam_id: 'exam-1', sha256: 'a'.repeat(64),
    model: 'gpt-5.5', prompt_version: 'exam-image-summary-v1', title: '数学答题卡：计算题失分集中',
    summary: '答题卡显示基础题完成稳定，但计算题步骤不够完整。', key_findings: ['第 18 题符号处理有误', '订正时补全中间步骤'],
    confidence: 0.86,
    details: { document_type: 'answer_sheet', overview: '数学答题卡', visible_scores: [], mistakes: [], annotations: [], study_signals: [], uncertainties: [] },
    usage: { total_tokens: 520 }, analyzed_by: 'user-1', created_at: '2026-07-20T08:00:00Z', updated_at: '2026-07-20T08:00:00Z',
    ...overrides,
  }
}

function renderPanel(options: { items?: Attachment[]; canAnalyze?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AiImageAnalysisPanel examId="exam-1" attachments={options.items ?? attachments} canAnalyze={options.canAnalyze ?? true} />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('AiImageAnalysisPanel', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.mocked(listAiAttachmentInsights).mockReset()
    vi.mocked(analyzeExamImages).mockReset()
  })

  it('shows persisted summaries and clearly distinguishes cached, changed and pending images', async () => {
    vi.mocked(listAiAttachmentInsights).mockResolvedValue([
      insight(),
      insight({ id: 'insight-changed', attachment_id: 'attachment-changed', sha256: 'd'.repeat(64), title: '上一版订正摘要' }),
    ])
    renderPanel()

    expect(await screen.findByRole('heading', { name: '数学答题卡：计算题失分集中' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getAllByText('答题卡显示基础题完成稳定，但计算题步骤不够完整。')).toHaveLength(2)
    expect(screen.getAllByText('第 18 题符号处理有误')).toHaveLength(2)
    expect(screen.getAllByText('置信度 86%')).toHaveLength(2)
    expect(screen.getAllByText('gpt-5.5')).toHaveLength(2)
    expect(screen.getByText('已缓存')).toBeInTheDocument()
    expect(screen.getByText('图片已变化')).toBeInTheDocument()
    expect(screen.getByText('待分析')).toBeInTheDocument()
    expect(screen.getByText('当前图片内容已变化，下方仍是上一版摘要。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '分析全部未分析/需更新图片 (2)' })).toBeEnabled()
  })

  it('analyzes only pending or changed images from the batch action', async () => {
    const user = userEvent.setup()
    vi.mocked(listAiAttachmentInsights).mockResolvedValue([
      insight(),
      insight({ id: 'insight-changed', attachment_id: 'attachment-changed', sha256: 'd'.repeat(64) }),
    ])
    vi.mocked(analyzeExamImages).mockResolvedValue({
      examId: 'exam-1', model: 'gpt-5.5', promptVersion: 'exam-image-summary-v1',
      counts: { total: 2, cached: 0, analyzed: 2, failed: 0 },
      items: [
        { attachmentId: 'attachment-changed', status: 'analyzed' },
        { attachmentId: 'attachment-pending', status: 'analyzed' },
      ],
      usage: { total_tokens: 900 },
    })
    renderPanel()

    await user.click(await screen.findByRole('button', { name: '分析全部未分析/需更新图片 (2)' }))
    await waitFor(() => expect(analyzeExamImages).toHaveBeenCalledWith({
      examId: 'exam-1',
      attachmentIds: ['attachment-changed', 'attachment-pending'],
      force: false,
    }))
    expect(await screen.findByText('2 张图片分析完成')).toBeInTheDocument()
  })

  it('turns a stable partial failure into an explicit retry action', async () => {
    const user = userEvent.setup()
    vi.mocked(listAiAttachmentInsights).mockResolvedValue([])
    vi.mocked(analyzeExamImages).mockResolvedValue({
      examId: 'exam-1', model: 'gpt-5.5', promptVersion: 'exam-image-summary-v1',
      counts: { total: 1, cached: 0, analyzed: 0, failed: 1 },
      items: [{ attachmentId: 'attachment-current', status: 'failed', error: 'provider_error' }],
      usage: null,
    })
    renderPanel({ items: [attachments[0]] })

    await user.click(await screen.findByRole('button', { name: '分析这张' }))
    const card = screen.getByRole('article', { name: '数学答题卡.png的 AI 图片摘要' })
    expect(await within(card).findByText('AI 服务暂时不可用，请稍后重试。')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: '失败重试' })
    await user.click(retry)
    await waitFor(() => expect(analyzeExamImages).toHaveBeenLastCalledWith({
      examId: 'exam-1', attachmentIds: ['attachment-current'], force: false,
    }))
  })

  it('marks an older model or prompt version for refresh', async () => {
    vi.mocked(listAiAttachmentInsights).mockResolvedValue([insight({ prompt_version: 'exam-image-summary-v0' })])
    renderPanel({ items: [attachments[0]] })

    expect(await screen.findByText('摘要需更新')).toBeInTheDocument()
    expect(screen.getByText('这份摘要由旧版模型或分析规则生成，下方内容仍可阅读。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '分析全部未分析/需更新图片 (1)' })).toBeEnabled()
  })

  it('automatically splits a large batch into the service limit of 4 images', async () => {
    const user = userEvent.setup()
    const manyAttachments = Array.from({ length: 5 }, (_, index) => ({
      ...attachments[0],
      id: `attachment-${index}`,
      page_order: index,
      sha256: index.toString(16).padStart(64, '0'),
    }))
    vi.mocked(listAiAttachmentInsights).mockResolvedValue([])
    vi.mocked(analyzeExamImages).mockImplementation(async ({ attachmentIds = [] }) => ({
      examId: 'exam-1', model: 'gpt-5.5', promptVersion: 'exam-image-summary-v1',
      counts: { total: attachmentIds.length, cached: 0, analyzed: attachmentIds.length, failed: 0 },
      items: attachmentIds.map((attachmentId) => ({ attachmentId, status: 'analyzed' as const })),
      usage: null,
    }))
    renderPanel({ items: manyAttachments })

    await user.click(await screen.findByRole('button', { name: '分析全部未分析/需更新图片 (5)' }))
    await waitFor(() => expect(analyzeExamImages).toHaveBeenCalledTimes(2))
    expect(vi.mocked(analyzeExamImages).mock.calls[0][0].attachmentIds).toHaveLength(4)
    expect(vi.mocked(analyzeExamImages).mock.calls[1][0].attachmentIds).toHaveLength(1)
  })

  it('stops later batches after a provider stop error and marks unrequested images failed', async () => {
    const user = userEvent.setup()
    const manyAttachments = Array.from({ length: 5 }, (_, index) => ({
      ...attachments[0],
      id: `stop-attachment-${index}`,
      page_order: index,
      sha256: (index + 10).toString(16).padStart(64, '0'),
    }))
    vi.mocked(listAiAttachmentInsights).mockResolvedValue([])
    vi.mocked(analyzeExamImages).mockResolvedValue({
      examId: 'exam-1', model: 'gpt-5.5', promptVersion: 'exam-image-summary-v1',
      counts: { total: 4, cached: 0, analyzed: 3, failed: 1 },
      items: [
        ...manyAttachments.slice(0, 3).map((attachment) => ({ attachmentId: attachment.id, status: 'analyzed' as const })),
        { attachmentId: manyAttachments[3].id, status: 'failed', error: 'provider_rate_limited' },
      ],
      usage: null,
    })
    renderPanel({ items: manyAttachments })

    await user.click(await screen.findByRole('button', { name: '分析全部未分析/需更新图片 (5)' }))
    await waitFor(() => expect(analyzeExamImages).toHaveBeenCalledTimes(1))
    const unrequestedCards = screen.getAllByRole('article', { name: '数学答题卡.png的 AI 图片摘要' })
    expect(await within(unrequestedCards[4]).findByText('AI 服务当前繁忙，请稍后重试。')).toBeInTheDocument()
    expect(screen.getAllByText('分析失败')).toHaveLength(2)
  })

  it('handles empty and permission-denied states without exposing analysis actions', async () => {
    const { unmount } = renderPanel({ items: [] })
    expect(screen.getByText('还没有可分析的图片')).toBeInTheDocument()
    expect(listAiAttachmentInsights).not.toHaveBeenCalled()
    unmount()

    vi.mocked(listAiAttachmentInsights).mockRejectedValue(new Error('permission denied for table ai_attachment_insights'))
    renderPanel({ items: [attachments[0]], canAnalyze: false })
    expect(await screen.findByText('没有权限读取图片摘要')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /分析|重试|重新读取/ })).not.toBeInTheDocument()
  })
})
