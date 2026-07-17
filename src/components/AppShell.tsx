import { BookOpenText, LayoutDashboard, LockKeyhole, Plus, Settings } from 'lucide-react'
import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useStudentScope } from '../contexts/StudentScopeContext'
import { ProfileAvatar } from './ProfileAvatar'
import { PersonSwitch } from './PersonSwitch'

const navItems = [
  { to: '/', label: '总览', icon: LayoutDashboard, end: true },
  { to: '/exams', label: '考试', icon: BookOpenText, end: true },
  { to: '/exams/new', label: '添加', icon: Plus, primary: true, end: true },
  { to: '/settings', label: '设置', icon: Settings },
]

export function AppShell() {
  const { profile, profiles } = useAuth()
  const { studentId, setStudentId } = useStudentScope()
  const location = useLocation()
  const showScope = location.pathname === '/' || location.pathname === '/exams'

  useEffect(() => {
    let frameId = 0
    function keepFocusedControlAboveMobileNav(event: FocusEvent) {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const mobileNav = document.querySelector<HTMLElement>('.bottom-nav')
      if (!mobileNav || mobileNav.contains(target) || getComputedStyle(mobileNav).display === 'none') return
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        const targetRect = target.getBoundingClientRect()
        const navRect = mobileNav.getBoundingClientRect()
        const safeBottom = navRect.top - 12
        if (targetRect.bottom <= safeBottom || targetRect.top >= navRect.bottom) return
        window.scrollBy({
          top: targetRect.bottom - safeBottom,
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        })
      })
    }
    document.addEventListener('focusin', keepFocusedControlAboveMobileNav)
    return () => {
      document.removeEventListener('focusin', keepFocusedControlAboveMobileNav)
      window.cancelAnimationFrame(frameId)
    }
  }, [])

  function isSectionActive(to: string): boolean {
    if (to === '/') return location.pathname === '/'
    if (to === '/settings') return location.pathname === '/settings' || location.pathname === '/trash'
    if (to === '/exams/new') return location.pathname === '/exams/new'
    if (to === '/exams') return location.pathname === '/exams' || /^\/exams\/(?!new$)[^/]+(?:\/edit)?$/.test(location.pathname)
    return location.pathname === to
  }

  return (
    <div className="app-shell">
      <button className="skip-link" type="button" onClick={() => document.getElementById('app-content')?.focus()}>跳到主要内容</button>
      <aside className="side-nav">
        <Link className="brand-mark" to="/" aria-label="我们的成绩手账，返回总览">
          <span>芽</span>
          <div><strong>我们的成绩手账</strong><small>一起看见成长</small></div>
        </Link>
        <nav aria-label="主要导航">
          {navItems.map(({ to, label, icon: Icon, primary }) => (
            <Link key={to} to={to} aria-current={isSectionActive(to) ? 'page' : undefined} className={`nav-link${isSectionActive(to) ? ' nav-link--active' : ''}${primary ? ' nav-link--primary' : ''}`}>
              <Icon size={20} aria-hidden="true" /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <Link to="/settings" className="side-nav__profile" aria-label="打开账号设置">
          <ProfileAvatar profile={profile} />
          <div><strong>{profile?.display_name ?? '成长记录者'}</strong><small>已安全登录</small></div>
        </Link>
      </aside>

      <main id="app-content" className="app-main" tabIndex={-1}>
        <header className="shell-topbar">
          <Link className="mobile-brand" to="/" aria-label="返回总览"><span>芽</span><strong>成绩手账</strong></Link>
          {showScope ? (
            <div className="shell-scope">
              <span className="shell-scope__label">查看范围</span>
              <PersonSwitch profiles={profiles} value={studentId} onChange={setStudentId} />
            </div>
          ) : <div className="shell-topbar__title">我们的成长空间</div>}
          <div className="shell-topbar__status"><LockKeyhole size={14} aria-hidden="true" /><span>双人私密空间</span></div>
        </header>
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="移动端导航">
        {navItems.map(({ to, label, icon: Icon, primary }) => (
          <Link key={to} to={to} aria-current={isSectionActive(to) ? 'page' : undefined} className={`bottom-nav__item${isSectionActive(to) ? ' bottom-nav__item--active' : ''}${primary ? ' bottom-nav__item--primary' : ''}`}>
            <Icon size={primary ? 24 : 20} aria-hidden="true" /><span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
