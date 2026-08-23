import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '../types/domain'
import { AttachmentTile } from './AttachmentTile'

vi.mock('../lib/api', () => ({
  createAttachmentUrls: vi.fn().mockResolvedValue({
    thumbnail: 'data:image/png;base64,thumbnail',
    full: 'data:image/png;base64,full',
  }),
}))

const attachment: Attachment = {
  id: 'attachment-1',
  exam_id: 'exam-1',
  uploader_id: 'user-1',
  category: 'answer_sheet',
  subject: 'math',
  storage_path: 'exam-1/math.png',
  thumbnail_path: 'exam-1/math-thumb.png',
  original_name: '数学答题卡.png',
  mime_type: 'image/png',
  byte_size: 1024,
  thumbnail_byte_size: 256,
  width: 1200,
  height: 1600,
  page_order: 0,
  sha256: null,
  created_at: '2026-07-17T08:00:00Z',
  deleted_at: null,
  deleted_by: null,
}

function renderTile() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AttachmentTile attachment={attachment} canEdit={false} onDelete={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('AttachmentTile lightbox', () => {
  afterEach(cleanup)

  it('renders thumbnail with lazy loading and async decoding', async () => {
    renderTile()
    const img = await screen.findByRole('img', { name: '数学答题卡.png' })
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('decoding', 'async')
  })

  it('preloads full-size image on hover', async () => {
    const user = userEvent.setup()
    renderTile()
    const opener = await screen.findByRole('button', { name: '查看数学答题卡.png' })
    await waitFor(() => expect(opener).toBeEnabled())

    await user.hover(opener)
    // Opener should remain enabled and accessible
    expect(opener).toBeInTheDocument()
  })

  it('traps focus, closes with Escape, restores focus and unlocks scrolling', async () => {
    const user = userEvent.setup()
    renderTile()
    const opener = await screen.findByRole('button', { name: '查看数学答题卡.png' })
    await waitFor(() => expect(opener).toBeEnabled())

    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: '数学答题卡.png' })
    const close = screen.getByRole('button', { name: '关闭图片预览' })
    expect(dialog).toBeInTheDocument()
    expect(close).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')

    const fullImg = within(dialog).getByRole('img', { name: '数学答题卡.png' })
    expect(fullImg).toHaveAttribute('decoding', 'async')

    await user.tab()
    expect(close).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })
})

