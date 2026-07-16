import { BarChart3, BookOpenText, Plus, Settings, Trash2 } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ProfileAvatar } from './ProfileAvatar'

const navItems = [
  { to: '/', label: '趋势', icon: BarChart3, end: true },
  { to: '/exams', label: '考试', icon: BookOpenText },
  { to: '/exams/new', label: '添加', icon: Plus, primary: true },
  { to: '/trash', label: '回收站', icon: Trash2 },
  { to: '/settings', label: '设置', icon: Settings },
]

export function AppShell() {
  const { profile } = useAuth()
  const location = useLocation()
  const hideHeader = /^\/exams\/(new|[^/]+\/edit)$/.test(location.pathname)

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="brand-mark" aria-label="我们的成绩手账">
          <span>芽</span>
          <div><strong>我们的成绩手账</strong><small>一起看见成长</small></div>
        </div>
        <nav aria-label="主要导航">
          {navItems.map(({ to, label, icon: Icon, end, primary }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}${primary ? ' nav-link--primary' : ''}`}>
              <Icon size={20} aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="side-nav__profile">
          <ProfileAvatar profile={profile} />
          <div><strong>{profile?.display_name ?? '成长记录者'}</strong><small>已安全登录</small></div>
        </div>
      </aside>

      <main className="app-main">
        {!hideHeader ? <div className="mobile-brand"><span>芽</span><strong>我们的成绩手账</strong></div> : null}
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="移动端导航">
        {navItems.map(({ to, label, icon: Icon, end, primary }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}${primary ? ' bottom-nav__item--primary' : ''}`}>
            <Icon size={primary ? 24 : 20} aria-hidden="true" /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
