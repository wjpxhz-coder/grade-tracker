import { ChevronRight, ClipboardList, LockKeyhole, PanelLeftClose, PanelLeftOpen, Plus, Settings } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useStudentScope } from '../contexts/StudentScopeContext'
import { ProfileAvatar } from './ProfileAvatar'
import { PersonSwitch } from './PersonSwitch'

interface NavIconProps {
  size?: number
  active?: boolean
  strokeWidth?: number
  'aria-hidden'?: boolean | 'true' | 'false'
}

function HomeNavIcon({ size = 22, active = false, strokeWidth = 2, 'aria-hidden': ariaHidden }: NavIconProps) {
  if (active) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden={ariaHidden}
        className="nav-icon"
      >
        <path
          d="M11.242 2.293a1.2 1.2 0 0 1 1.516 0l8.03 6.424A1.2 1.2 0 0 1 21.2 9.65V19.8a2.2 2.2 0 0 1-2.2 2.2H5a2.2 2.2 0 0 1-2.2-2.2V9.65a1.2 1.2 0 0 1 .412-.933l8.03-6.424zM10 20h4v-5.5a2 2 0 0 0-2-2 2 2 0 0 0-2 2V20z"
          fillRule="evenodd"
          clipRule="evenodd"
        />
      </svg>
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      className="nav-icon"
    >
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6" />
    </svg>
  )
}

function ExamNavIcon({ size = 22, active = false, strokeWidth = 2, 'aria-hidden': ariaHidden }: NavIconProps) {
  return (
    <ClipboardList
      size={size}
      strokeWidth={active ? 2.3 : strokeWidth}
      aria-hidden={ariaHidden}
      className="nav-icon"
    />
  )
}

function PlusNavIcon({ size = 24, strokeWidth = 2.4, 'aria-hidden': ariaHidden }: NavIconProps) {
  return (
    <Plus
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden={ariaHidden}
      className="nav-icon"
    />
  )
}

function SettingsNavIcon({ size = 22, active = false, strokeWidth = 2, 'aria-hidden': ariaHidden }: NavIconProps) {
  return (
    <Settings
      size={size}
      strokeWidth={active ? 2.3 : strokeWidth}
      aria-hidden={ariaHidden}
      className="nav-icon"
    />
  )
}

interface NavItem {
  to: string
  label: string
  icon: (props: NavIconProps) => ReactNode
  primary?: boolean
  end?: boolean
}

const navItems: NavItem[] = [
  { to: '/', label: '总览', icon: HomeNavIcon, end: true },
  { to: '/exams', label: '考试', icon: ExamNavIcon, end: true },
  { to: '/exams/new', label: '添加', icon: PlusNavIcon, primary: true, end: true },
  { to: '/settings', label: '设置', icon: SettingsNavIcon },
]

export function AppShell() {
  const { profile, profiles } = useAuth()
  const { studentId, setStudentId } = useStudentScope()
  const location = useLocation()
  const showScope = location.pathname === '/' || location.pathname === '/exams'
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleSidebar = (collapsed?: boolean) => {
    setIsSidebarCollapsed((prev) => {
      const next = typeof collapsed === 'boolean' ? collapsed : !prev
      try {
        localStorage.setItem('sidebar_collapsed', String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 260)
    return () => clearTimeout(timer)
  }, [isSidebarCollapsed])

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
    <div className={`app-shell${isSidebarCollapsed ? ' app-shell--collapsed' : ''}`}>
      <button className="skip-link" type="button" onClick={() => document.getElementById('app-content')?.focus()}>跳到主要内容</button>
      <aside className="side-nav" aria-label="桌面端侧边栏">
        <div className="side-nav__header">
          <Link className="brand-mark" to="/" aria-label="我们的成绩手账，返回总览">
            <span>芽</span>
            <div><strong>我们的成绩手账</strong><small>一起看见成长</small></div>
          </Link>
          <button
            type="button"
            className="side-nav__collapse-btn"
            onClick={() => toggleSidebar(true)}
            aria-label="向左隐藏侧边栏"
            title="向左隐藏侧边栏"
          >
            <PanelLeftClose size={18} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="主要导航">
          {navItems.map(({ to, label, icon: Icon, primary }) => {
            const active = isSectionActive(to)
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? 'page' : undefined}
                className={`nav-link${active ? ' nav-link--active' : ''}${primary ? ' nav-link--primary' : ''}`}
              >
                <Icon size={20} active={active} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>
        <Link to="/settings" className="side-nav__profile" aria-label="打开账号设置">
          <ProfileAvatar profile={profile} />
          <div><strong>{profile?.display_name ?? '成长记录者'}</strong><small>已安全登录</small></div>
        </Link>
      </aside>

      {isSidebarCollapsed && (
        <button
          type="button"
          className="sidebar-edge-trigger"
          onClick={() => toggleSidebar(false)}
          aria-label="展开侧边栏"
          title="展开侧边栏"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      )}

      <main id="app-content" className="app-main" tabIndex={-1}>
        <header className="shell-topbar">
          <div className="shell-topbar__left">
            {isSidebarCollapsed && (
              <button
                type="button"
                className="shell-sidebar-trigger"
                onClick={() => toggleSidebar(false)}
                aria-label="展开侧边栏"
                title="展开侧边栏"
              >
                <PanelLeftOpen size={18} aria-hidden="true" />
                <span>展开侧边栏</span>
              </button>
            )}
            <Link className="mobile-brand" to="/" aria-label="返回总览"><span>芽</span><strong>成绩手账</strong></Link>
            {showScope ? (
              <div className="shell-scope">
                <span className="shell-scope__label">查看范围</span>
                <PersonSwitch profiles={profiles} value={studentId} onChange={setStudentId} />
              </div>
            ) : <div className="shell-topbar__title">我们的成长空间</div>}
          </div>
          <div className="shell-topbar__status"><LockKeyhole size={14} aria-hidden="true" /><span>双人私密空间</span></div>
        </header>
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="移动端导航">
        {navItems.map(({ to, label, icon: Icon, primary }) => {
          const active = isSectionActive(to)
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              className={`bottom-nav__item${active ? ' bottom-nav__item--active' : ''}${primary ? ' bottom-nav__item--primary' : ''}`}
            >
              {primary ? (
                <span className="bottom-nav__primary-btn" aria-hidden="true">
                  <Icon size={26} strokeWidth={2.4} aria-hidden="true" />
                </span>
              ) : (
                <>
                  <Icon size={22} active={active} aria-hidden="true" />
                  <span className="bottom-nav__label">{label}</span>
                </>
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
