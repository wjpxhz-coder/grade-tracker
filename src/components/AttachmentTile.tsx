import { useQuery } from '@tanstack/react-query'
import { ImageOff, Maximize2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { createAttachmentUrls } from '../lib/api'
import { ATTACHMENT_CATEGORY_LABELS } from '../lib/constants'
import type { Attachment } from '../types/domain'

export function AttachmentTile({ attachment, onDelete, canEdit }: {
  attachment: Attachment
  onDelete: () => void
  canEdit: boolean
}) {
  const [open, setOpen] = useState(false)
  const urlQuery = useQuery({
    queryKey: ['attachment-url', attachment.id],
    queryFn: () => createAttachmentUrls(attachment),
    staleTime: 8 * 60 * 1000,
  })

  return (
    <article className="attachment-tile">
      <button className="attachment-tile__image" type="button" onClick={() => setOpen(true)} disabled={!urlQuery.data?.full} aria-label={`查看${attachment.original_name}`}>
        {urlQuery.data?.thumbnail ? <img src={urlQuery.data.thumbnail} alt={attachment.original_name} /> : <span><ImageOff size={25} />{urlQuery.isError ? '读取失败' : '正在读取'}</span>}
        <i><Maximize2 size={15} /></i>
      </button>
      <div><span>{ATTACHMENT_CATEGORY_LABELS[attachment.category]}</span><small>第 {attachment.page_order + 1} 页</small>{canEdit ? <button type="button" onClick={onDelete} aria-label={`删除${attachment.original_name}`}><Trash2 size={15} /></button> : null}</div>
      {open && urlQuery.data?.full ? <div className="lightbox" role="dialog" aria-modal="true" aria-label="试卷大图" onClick={() => setOpen(false)}><button type="button" onClick={() => setOpen(false)}>关闭</button><img src={urlQuery.data.full} alt={attachment.original_name} onClick={(event) => event.stopPropagation()} /></div> : null}
    </article>
  )
}
