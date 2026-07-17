import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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

    await user.tab()
    expect(close).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })
})
