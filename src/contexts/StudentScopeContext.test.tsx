import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../types/domain'
import {
  STUDENT_SCOPE_STORAGE_KEY,
  StudentScopeProvider,
  useStudentScope,
} from './StudentScopeContext'

let authState: {
  profile: Profile | null
  profiles: Profile[]
  loading: boolean
}

vi.mock('./AuthContext', () => ({
  useAuth: () => authState,
}))

const currentProfile: Profile = {
  id: 'student-1',
  display_name: '芽',
  login_alias: 'ya',
  color_key: 'sage',
}
const otherProfile: Profile = {
  id: 'student-2',
  display_name: '叶',
  login_alias: 'ye',
  color_key: 'peach',
}

function ScopeProbe() {
  const { studentId, selectedProfile, setStudentId } = useStudentScope()
  return (
    <div>
      <output aria-label="student-id">{studentId}</output>
      <output aria-label="student-name">{selectedProfile?.display_name ?? '无'}</output>
      <button type="button" onClick={() => setStudentId(otherProfile.id)}>切换成叶</button>
    </div>
  )
}

describe('StudentScopeProvider', () => {
  afterEach(cleanup)

  beforeEach(() => {
    window.localStorage.clear()
    authState = {
      profile: currentProfile,
      profiles: [currentProfile, otherProfile],
      loading: false,
    }
  })

  it('restores a valid stored member and persists user changes', async () => {
    window.localStorage.setItem(STUDENT_SCOPE_STORAGE_KEY, currentProfile.id)
    render(<StudentScopeProvider><ScopeProbe /></StudentScopeProvider>)

    expect(screen.getByLabelText('student-name')).toHaveTextContent('芽')
    fireEvent.click(screen.getByRole('button', { name: '切换成叶' }))

    expect(screen.getByLabelText('student-id')).toHaveTextContent(otherProfile.id)
    await waitFor(() => {
      expect(window.localStorage.getItem(STUDENT_SCOPE_STORAGE_KEY)).toBe(otherProfile.id)
    })
  })

  it('falls back to the current profile when the stored member is no longer valid', async () => {
    window.localStorage.setItem(STUDENT_SCOPE_STORAGE_KEY, 'removed-student')
    render(<StudentScopeProvider><ScopeProbe /></StudentScopeProvider>)

    expect(screen.getByLabelText('student-id')).toHaveTextContent(currentProfile.id)
    expect(screen.getByLabelText('student-name')).toHaveTextContent('芽')
    await waitFor(() => {
      expect(window.localStorage.getItem(STUDENT_SCOPE_STORAGE_KEY)).toBe(currentProfile.id)
    })
  })

  it('exposes the current member synchronously on a first visit', () => {
    render(<StudentScopeProvider><ScopeProbe /></StudentScopeProvider>)

    expect(screen.getByLabelText('student-id')).toHaveTextContent(currentProfile.id)
    expect(screen.getByLabelText('student-name')).toHaveTextContent('芽')
  })
})
