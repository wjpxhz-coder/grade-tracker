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
})
