import { useQuery } from '@tanstack/react-query'
import { ImageOff, Maximize2, Trash2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createAttachmentUrls } from '../lib/api'
import { ATTACHMENT_CATEGORY_LABELS, SUBJECT_LABELS } from '../lib/constants'
import type { Attachment } from '../types/domain'

export function AttachmentTile({ attachment, onDelete, canEdit }: {
  attachment: Attachment
  onDelete: () => void
  canEdit: boolean
}) {
  const [open, setOpen] = useState(false)
  const dialogTitleId = useId()
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const urlQuery = useQuery({
    queryKey: ['attachment-url', attachment.id],
    queryFn: () => createAttachmentUrls(attachment),
    staleTime: 8 * 60 * 1000,
  })

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )]
      if (!focusable.length) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      openButtonRef.current?.focus()
    }
  }, [open])

  return (
    <article className="attachment-tile">
      <button ref={openButtonRef} className="attachment-tile__image" type="button" onClick={() => setOpen(true)} disabled={!urlQuery.data?.full} aria-label={`查看${attachment.original_name}`}>
        {urlQuery.data?.thumbnail ? <img src={urlQuery.data.thumbnail} alt={attachment.original_name} /> : <span><ImageOff size={25} />{urlQuery.isError ? '读取失败' : '正在读取'}</span>}
        <i><Maximize2 size={15} /></i>
      </button>
      <div><span>{attachment.subject ? `${SUBJECT_LABELS[attachment.subject]} · ` : ''}{ATTACHMENT_CATEGORY_LABELS[attachment.category]}</span><small>第 {attachment.page_order + 1} 页</small>{canEdit ? <button type="button" onClick={onDelete} aria-label={`删除${attachment.original_name}`}><Trash2 size={15} /></button> : null}</div>
      {open && urlQuery.data?.full ? (
        <div className="lightbox" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
          <div
            ref={dialogRef}
            className="lightbox__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            tabIndex={-1}
          >
            <header className="lightbox__header">
              <div>
                <span className="eyebrow">图片预览</span>
                <h2 id={dialogTitleId}>{attachment.original_name}</h2>
              </div>
              <button ref={closeButtonRef} className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="关闭图片预览"><X /></button>
            </header>
            <div className="lightbox__canvas">
              <img src={urlQuery.data.full} alt={attachment.original_name} />
            </div>
          </div>
        </div>
      ) : null}
    </article>
  )
}
