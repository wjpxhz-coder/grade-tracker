import { ArrowLeft, MapPinOff } from 'lucide-react'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return <div className="page"><section className="empty-state"><MapPinOff size={36} /><h1>这一页没有记录</h1><p>地址可能已经改变，回到趋势首页继续查看吧。</p><Link className="button button--primary" to="/"><ArrowLeft size={16} />返回首页</Link></section></div>
}
