export function formatDate(value: string): string {
  if (!value) return '—'
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${year}年${Number(month)}月${Number(day)}日`
}

export function formatDateTime(value: string): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function formatScore(score: number | null, fullScore: number | null): string {
  if (score === null) return '未录入'
  return fullScore === null ? String(score) : `${score} / ${fullScore}`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export function daysUntilPurge(deletedAt: string): number {
  const expires = new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((expires - Date.now()) / (24 * 60 * 60 * 1000)))
}

export function percent(value: number | null, digits = 1): string {
  return value === null ? '—' : `${value.toFixed(digits)}%`
}
