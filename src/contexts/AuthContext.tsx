import type { Session, User } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getMembership, getProfile, listProfiles } from '../lib/api'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Profile, SpaceMember } from '../types/domain'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  membership: SpaceMember | null
  profiles: Profile[]
  loading: boolean
  configured: boolean
  refreshIdentity: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSessionLoading(false)
      return
    }
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session)
        setSessionLoading(false)
      }
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setSessionLoading(false)
      if (!nextSession) queryClient.clear()
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [queryClient])

  const user = session?.user ?? null
  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!),
    enabled: Boolean(user),
  })
  const membershipQuery = useQuery({
    queryKey: ['membership', user?.id],
    queryFn: () => getMembership(user!.id),
    enabled: Boolean(user),
  })
  const profilesQuery = useQuery({
    queryKey: ['profiles', membershipQuery.data?.space_id],
    queryFn: listProfiles,
    enabled: Boolean(membershipQuery.data),
  })

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile: profileQuery.data ?? null,
      membership: membershipQuery.data ?? null,
      profiles: profilesQuery.data ?? [],
      loading:
        sessionLoading ||
        Boolean(user && (profileQuery.isLoading || membershipQuery.isLoading || profilesQuery.isLoading)),
      configured: isSupabaseConfigured,
      refreshIdentity: async () => {
        await Promise.all([
          profileQuery.refetch(),
          membershipQuery.refetch(),
          profilesQuery.refetch(),
        ])
      },
    }),
    [
      session,
      user,
      profileQuery.data,
      profileQuery.isLoading,
      profileQuery.refetch,
      membershipQuery.data,
      membershipQuery.isLoading,
      membershipQuery.refetch,
      profilesQuery.data,
      profilesQuery.isLoading,
      profilesQuery.refetch,
      sessionLoading,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
