import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Profile } from '../types/domain'
import { useAuth } from './AuthContext'

export const STUDENT_SCOPE_STORAGE_KEY = 'grade-journal-student-scope'

export interface StudentScopeContextValue {
  studentId: string
  selectedProfile: Profile | null
  setStudentId: (studentId: string) => void
}

const StudentScopeContext = createContext<StudentScopeContextValue | null>(null)

function readStoredStudentId(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(STUDENT_SCOPE_STORAGE_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function resolveStudentScopeId(
  requestedId: string,
  profiles: readonly Profile[],
  currentProfile: Profile | null,
): string {
  if (profiles.some((profile) => profile.id === requestedId)) return requestedId
  return currentProfile?.id ?? ''
}

export function StudentScopeProvider({ children }: { children: ReactNode }) {
  const { profile, profiles, loading } = useAuth()
  const [studentId, setStudentIdState] = useState(readStoredStudentId)
  const resolvedStudentId = useMemo(
    () => loading ? '' : resolveStudentScopeId(studentId, profiles, profile),
    [loading, profile, profiles, studentId],
  )

  useEffect(() => {
    if (loading) return
    if (resolvedStudentId !== studentId) setStudentIdState(resolvedStudentId)
  }, [loading, resolvedStudentId, studentId])

  useEffect(() => {
    if (!resolvedStudentId) return
    try {
      window.localStorage.setItem(STUDENT_SCOPE_STORAGE_KEY, resolvedStudentId)
    } catch {
      // Storage can be unavailable in privacy-restricted browsers. The in-memory
      // scope remains usable for the current session.
    }
  }, [resolvedStudentId])

  const setStudentId = useCallback((nextStudentId: string) => {
    setStudentIdState(resolveStudentScopeId(nextStudentId, profiles, profile))
  }, [profile, profiles])

  const selectedProfile = useMemo(
    () => profiles.find((candidate) => candidate.id === resolvedStudentId)
      ?? (profile?.id === resolvedStudentId ? profile : null),
    [profile, profiles, resolvedStudentId],
  )

  const value = useMemo<StudentScopeContextValue>(() => ({
    studentId: resolvedStudentId,
    selectedProfile,
    setStudentId,
  }), [resolvedStudentId, selectedProfile, setStudentId])

  return <StudentScopeContext.Provider value={value}>{children}</StudentScopeContext.Provider>
}

export function useStudentScope(): StudentScopeContextValue {
  const context = useContext(StudentScopeContext)
  if (!context) throw new Error('useStudentScope must be used inside StudentScopeProvider')
  return context
}
