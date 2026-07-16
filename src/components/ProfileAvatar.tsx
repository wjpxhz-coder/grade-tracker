import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { createProfileAvatarUrl } from '../lib/api'
import type { Profile } from '../types/domain'

interface ProfileAvatarProps {
  profile: Pick<Profile, 'display_name' | 'color_key' | 'avatar_path'> | null | undefined
  size?: 'small' | 'large'
  previewUrl?: string | null
}

export function ProfileAvatar({ profile, size, previewUrl }: ProfileAvatarProps) {
  const { user } = useAuth()
  const path = profile?.avatar_path ?? null
  const avatarQuery = useQuery({
    queryKey: ['profile-avatar', path],
    queryFn: () => createProfileAvatarUrl(path!),
    enabled: Boolean(user && path),
    staleTime: 55 * 60 * 1000,
  })
  const className = `avatar avatar--${profile?.color_key ?? 'sage'}${size ? ` avatar--${size}` : ''}`
  const initial = profile?.display_name?.trim().slice(0, 1) ?? '我'

  const imageUrl = previewUrl ?? avatarQuery.data
  return <span className={className} aria-label={`${profile?.display_name ?? '用户'}头像`}>{imageUrl ? <img src={imageUrl} alt="" /> : initial}</span>
}
