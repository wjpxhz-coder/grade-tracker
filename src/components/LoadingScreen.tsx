import { Sprout } from 'lucide-react'

export function LoadingScreen({ label = '正在整理成长记录…' }: { label?: string }) {
  return (
    <div className="loading-screen" role="status">
      <span className="loading-screen__icon"><Sprout size={28} /></span>
      <p>{label}</p>
    </div>
  )
}
