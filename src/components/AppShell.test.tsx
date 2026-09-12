import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

const profile = { id: 'student-1', display_name: '小芽', login_alias: 'sprout', color_key: 'sage' as const }

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ profile, profiles: [profile] }),
}))

vi.mock('../contexts/StudentScopeContext', () => ({
  useStudentScope: () => ({ studentId: profile.id, selectedProfile: profile, setStudentId: vi.fn() }),
}))

vi.mock('./ProfileAvatar', () => ({
  ProfileAvatar: () => <span data-testid="avatar" />,
}))

afterEach(cleanup)

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<div>页面内容</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppShell navigation', () => {
  it('keeps add and exams mutually exclusive', () => {
    renderShell('/exams/new')
    const desktopNav = screen.getByRole('navigation', { name: '主要导航' })
    expect(desktopNav.querySelector('a[href="/exams/new"]')).toHaveClass('nav-link--active')
    expect(desktopNav.querySelector('a[href="/exams/new"]')).toHaveAttribute('aria-current', 'page')
    expect(desktopNav.querySelector('a[href="/exams"]')).not.toHaveClass('nav-link--active')
    expect(desktopNav.querySelector('a[href="/exams"]')).not.toHaveAttribute('aria-current')
  })

  it('treats trash as settings and provides a working skip control', async () => {
    const user = userEvent.setup()
    renderShell('/trash')
    const desktopNav = screen.getByRole('navigation', { name: '主要导航' })
    expect(desktopNav.querySelector('a[href="/settings"]')).toHaveClass('nav-link--active')
    expect(desktopNav.querySelector('a[href="/settings"]')).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('button', { name: '跳到主要内容' }))
    expect(document.activeElement).toBe(document.querySelector('#app-content'))
  })

  it('renders bottom nav items and highlights current path', () => {
    renderShell('/')
    const mobileNav = screen.getByRole('navigation', { name: '移动端导航' })
    const homeLink = mobileNav.querySelector('a[href="/"]')
    const examsLink = mobileNav.querySelector('a[href="/exams"]')
    const addLink = mobileNav.querySelector('a[href="/exams/new"]')
    const settingsLink = mobileNav.querySelector('a[href="/settings"]')

    expect(homeLink).toHaveClass('bottom-nav__item--active')
    expect(homeLink).toHaveAttribute('aria-current', 'page')
    expect(examsLink).not.toHaveClass('bottom-nav__item--active')
    expect(addLink).toHaveClass('bottom-nav__item--primary')
    expect(settingsLink).not.toHaveClass('bottom-nav__item--active')
  })

  it('toggles sidebar collapse and expansion correctly', async () => {
    localStorage.clear()
    const user = userEvent.setup()
    renderShell('/')

    const shell = document.querySelector('.app-shell')
    expect(shell).not.toHaveClass('app-shell--collapsed')

    // Click collapse button in side-nav
    const collapseBtn = screen.getByRole('button', { name: '向左隐藏侧边栏' })
    await user.click(collapseBtn)

    expect(shell).toHaveClass('app-shell--collapsed')
    expect(localStorage.getItem('sidebar_collapsed')).toBe('true')

    // Find and click the expand button in topbar
    const expandBtn = screen.getAllByRole('button', { name: '展开侧边栏' })[0]
    await user.click(expandBtn)

    expect(shell).not.toHaveClass('app-shell--collapsed')
    expect(localStorage.getItem('sidebar_collapsed')).toBe('false')
  })
})
