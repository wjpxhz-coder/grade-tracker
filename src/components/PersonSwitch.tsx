import type { Profile } from '../types/domain'
import { ProfileAvatar } from './ProfileAvatar'

export function PersonSwitch({ profiles, value, onChange }: {
  profiles: Profile[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="person-switch" role="group" aria-label="选择查看谁的成绩">
      {profiles.map((profile) => (
        <button key={profile.id} type="button" aria-pressed={value === profile.id} className={value === profile.id ? 'person-switch__item person-switch__item--active' : 'person-switch__item'} onClick={() => onChange(profile.id)}>
          <ProfileAvatar profile={profile} />
          <span>{profile.display_name}</span>
        </button>
      ))}
    </div>
  )
}
