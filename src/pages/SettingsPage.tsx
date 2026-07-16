import { useQuery } from '@tanstack/react-query'
import { Archive, Database, Download, HardDrive, LoaderCircle, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { downloadAttachment, getStorageUsage, loadExportSnapshot, signOut } from '../lib/api'
import { objectsToCsv } from '../lib/csv'
import { buildDataExportArchive, downloadBlob } from '../lib/export'
import { formatBytes } from '../lib/format'

const FREE_STORAGE_BYTES = 1024 ** 3
const MAX_EXPORT_PART_BYTES = 180 * 1024 ** 2

function safePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'exam'
}

export function SettingsPage() {
  const { profile, profiles, membership } = useAuth()
  const { showToast } = useToast()
  const [exporting, setExporting] = useState('')
  const storageQuery = useQuery({ queryKey: ['storage-usage'], queryFn: getStorageUsage })
  const usage = storageQuery.data?.used_bytes ?? 0
  const usagePercent = Math.min(100, (usage / FREE_STORAGE_BYTES) * 100)

  async function handleExport() {
    setExporting('正在整理结构化数据…')
    try {
      const snapshot = await loadExportSnapshot()
      const profileMap = new Map(snapshot.profiles.map((item) => [item.id, item]))
      const examMap = new Map(snapshot.exams.map((item) => [item.id, item]))
      const readableAttachments = snapshot.attachments.filter((item) => !item.deleted_at)
      const parts = readableAttachments.reduce<typeof readableAttachments[]>((groups, item) => {
        const current = groups.at(-1)
        const currentBytes = current?.reduce((sum, entry) => sum + entry.byte_size, 0) ?? 0
        if (!current || (current.length > 0 && currentBytes + item.byte_size > MAX_EXPORT_PART_BYTES)) groups.push([item])
        else current.push(item)
        return groups
      }, [])
      if (!parts.length) parts.push([])
      if (parts.length > 1 && !window.confirm(`图片将自动分成 ${parts.length} 个 ZIP，避免浏览器一次占用过多内存。浏览器可能询问是否允许下载多个文件。继续吗？`)) return

      const csvFiles = {
        exams: objectsToCsv(snapshot.exams, [
          { header: '考试ID', value: (row) => row.id },
          { header: '所属人', value: (row) => profileMap.get(row.student_id)?.display_name ?? row.student_id },
          { header: '考试名称', value: (row) => row.title },
          { header: '日期', value: (row) => row.exam_date },
          { header: '类型', value: (row) => row.kind },
          { header: '总分', value: (row) => row.total_score },
          { header: '满分', value: (row) => row.total_full_score },
          { header: '排名', value: (row) => row.rank_value },
          { header: '参考人数', value: (row) => row.participant_count },
          { header: '可见性', value: (row) => row.visibility },
          { header: '已删除', value: (row) => row.deleted_at },
        ]),
        subject_scores: objectsToCsv(snapshot.subjectScores, [
          { header: '考试ID', value: (row) => row.exam_id },
          { header: '科目', value: (row) => row.subject },
          { header: '得分', value: (row) => row.score },
          { header: '满分', value: (row) => row.full_score },
          { header: '排名', value: (row) => row.rank_value },
          { header: '参考人数', value: (row) => row.participant_count },
        ]),
      }
      const reflections = snapshot.notes.filter((note) => !note.deleted_at).map((note) => ({ id: note.id, examName: examMap.get(note.exam_id)?.title ?? note.exam_id, authorName: profileMap.get(note.author_id)?.display_name ?? note.author_id, createdAt: note.created_at, content: note.content }))
      let downloadedCount = 0
      for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
        const attachments = []
        for (const item of parts[partIndex]) {
          const exam = examMap.get(item.exam_id)
          if (!exam) continue
          downloadedCount += 1
          setExporting(`正在下载私有图片 ${downloadedCount} / ${readableAttachments.length}`)
          const extension = item.mime_type === 'image/webp' ? 'webp' : item.mime_type === 'image/png' ? 'png' : 'jpg'
          attachments.push({ path: `${exam.exam_date}-${safePart(exam.title)}-${exam.id}/${String(item.page_order + 1).padStart(2, '0')}-${item.id}.${extension}`, data: await downloadAttachment(item.storage_path), modifiedAt: new Date(item.created_at) })
        }
        setExporting(`正在生成 ZIP ${partIndex + 1} / ${parts.length}`)
        const archive = await buildDataExportArchive({
          schemaVersion: 1,
          data: { ...snapshot, exported_by: profile?.id, space_id: membership?.space_id, export_part: { number: partIndex + 1, total: parts.length } },
          csvFiles,
          reflections,
          attachmentManifest: snapshot.attachments,
          attachments,
        })
        const fileName = parts.length === 1 ? archive.fileName : archive.fileName.replace('.zip', `-part-${partIndex + 1}-of-${parts.length}.zip`)
        downloadBlob(archive.blob, fileName)
        if (partIndex < parts.length - 1) await new Promise((resolve) => window.setTimeout(resolve, 1_100))
      }
      showToast(`导出完成：${readableAttachments.length} 张图片，${parts.length} 个 ZIP`, 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出失败', 'error')
    } finally {
      setExporting('')
    }
  }

  async function handleSignOut() {
    try { await signOut() } catch (error) { showToast(error instanceof Error ? error.message : '退出失败', 'error') }
  }

  return (
    <div className="page">
      <PageHeader eyebrow="空间与安全" title="设置" description="管理当前账号、存储空间和离线备份。" />
      <div className="settings-grid">
        <section className="panel settings-card">
          <div className="settings-card__heading"><span><UserRound /></span><div><h2>当前账号</h2><p>固定双账号之一</p></div></div>
          <div className="account-profile"><span className={`avatar avatar--large avatar--${profile?.color_key ?? 'sage'}`}>{profile?.display_name.slice(0, 1)}</span><div><strong>{profile?.display_name}</strong><small>@{profile?.login_alias}</small></div></div>
          <div className="settings-fact"><span>双人空间成员</span><strong>{profiles.map((item) => item.display_name).join('、')}</strong></div>
          <button className="button button--secondary button--wide" type="button" onClick={() => void handleSignOut()}><LogOut size={17} />退出登录</button>
        </section>

        <section className="panel settings-card">
          <div className="settings-card__heading"><span><HardDrive /></span><div><h2>图片存储</h2><p>Supabase 免费层 1 GB</p></div></div>
          <div className="storage-number"><strong>{formatBytes(usage)}</strong><span>/ 1 GB</span></div>
          <div className="storage-bar" aria-label={`已使用 ${usagePercent.toFixed(1)}%`}><i style={{ width: `${usagePercent}%` }} /></div>
          <div className="settings-fact"><span>文件数量</span><strong>{storageQuery.data?.file_count ?? '—'} 个</strong></div>
          <p className="settings-note">达到 80% 时建议先导出并清理旧图片。上传的原图不会保存，只保留优化高清图和缩略图。</p>
        </section>

        <section className="panel settings-card settings-card--wide">
          <div className="settings-card__heading"><span><Archive /></span><div><h2>导出共享空间</h2><p>数据库免费备份不包含实际图片，请定期保存离线副本。</p></div></div>
          <div className="export-row"><div><strong>版本化 ZIP 备份</strong><p>包含 JSON、CSV、心得、附件清单，以及当前账号有权读取的全部图片；伴侣私密内容不会被导出。大体量图片会自动拆成约 180 MB 的分卷，避免一次占满浏览器内存。</p></div><button className="button button--primary" type="button" onClick={() => void handleExport()} disabled={Boolean(exporting)}>{exporting ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}{exporting || '一键导出'}</button></div>
        </section>

        <section className="panel settings-card settings-card--wide security-card">
          <div className="settings-card__heading"><span><ShieldCheck /></span><div><h2>安全边界</h2><p>由服务端策略保护，而不是只隐藏页面按钮。</p></div></div>
          <div className="security-points"><p><Database size={17} /><span><strong>数据库 RLS</strong>阻止访客和第三账号读取记录。</span></p><p><ShieldCheck size={17} /><span><strong>私有 Storage</strong>图片链接短时有效，不使用公开地址。</span></p><p><Archive size={17} /><span><strong>30 天回收站</strong>到期后图片和关联数据一起清除。</span></p></div>
        </section>
      </div>
    </div>
  )
}
