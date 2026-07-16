import type { Profile } from '../types/domain'

export function PersonSwitch({ profiles, value, onChange }: {
  profiles: Profile[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="person-switch" role="group" aria-label="选择查看谁的成绩">
      {profiles.map((profile) => (
        <button key={profile.id} type="button" aria-pressed={value === profile.id} className={value === profile.id ? 'person-switch__item person-switch__item--active' : 'person-switch__item'} onClick={() => onChange(profile.id)}>
          <span className={`avatar avatar--${profile.color_key}`}>{profile.display_name.slice(0, 1)}</span>
          <span>{profile.display_name}</span>
        </button>
      ))}
    </div>
  )
}
