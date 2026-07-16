import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff, KeyRound, Leaf, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { listLoginProfiles, signIn } from '../lib/api'

export function LoginPage() {
  const { user, configured } = useAuth()
  const { showToast } = useToast()
  const [selectedId, setSelectedId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const profilesQuery = useQuery({ queryKey: ['login-profiles'], queryFn: listLoginProfiles, enabled: configured })
  useEffect(() => {
    if (!selectedId && profilesQuery.data?.[0]) setSelectedId(profilesQuery.data[0].id)
  }, [profilesQuery.data, selectedId])

  if (user) return <Navigate to="/" replace />
  const selected = profilesQuery.data?.find((profile) => profile.id === selectedId)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || !password) {
      showToast('请选择账号并输入口令。', 'error')
      return
    }
    setSubmitting(true)
    try {
      await signIn(selected.login_email, password)
      showToast(`欢迎回来，${selected.display_name}`, 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '登录失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-hero">
        <div className="login-hero__orb login-hero__orb--one" />
        <div className="login-hero__orb login-hero__orb--two" />
        <div className="login-hero__content">
          <span className="login-logo"><Leaf size={28} /></span>
          <p className="eyebrow">只属于两个人的成长空间</p>
          <h1>把每一次努力，<br />都留在时间里。</h1>
          <p>记录分数、排名、试卷和当时的想法。不是为了比较，而是一起看见走过的路。</p>
          <div className="login-promise"><ShieldCheck size={18} /><span>成绩与试卷存放在私有空间，访客无法查看</span></div>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-card__heading"><span><KeyRound size={22} /></span><div><h2>欢迎回来</h2><p>先选择自己，再输入口令</p></div></div>

          {!configured ? (
            <div className="setup-notice" role="status">
              <strong>还差一步配置</strong>
              <p>请复制 <code>.env.example</code> 为 <code>.env.local</code>，填写 Supabase URL 和 publishable key 后重新启动。</p>
            </div>
          ) : profilesQuery.isLoading ? (
            <div className="login-loading"><LoaderCircle className="spin" />正在读取两个账号…</div>
          ) : profilesQuery.error ? (
            <div className="setup-notice setup-notice--error"><strong>账号读取失败</strong><p>{profilesQuery.error.message}</p></div>
          ) : profilesQuery.data?.length !== 2 ? (
            <div className="setup-notice"><strong>请先初始化双账号</strong><p>运行 <code>npm run bootstrap:users</code> 后，这里会显示两个昵称。</p></div>
          ) : (
            <div className="login-people" role="radiogroup" aria-label="选择账号">
              {profilesQuery.data.map((profile) => (
                <button type="button" role="radio" aria-checked={profile.id === selectedId} key={profile.id} className={profile.id === selectedId ? 'login-person login-person--active' : 'login-person'} onClick={() => { setSelectedId(profile.id); setPassword('') }}>
                  <span className={`avatar avatar--large avatar--${profile.color_key}`}>{profile.display_name.slice(0, 1)}</span>
                  <strong>{profile.display_name}</strong><small>@{profile.login_alias}</small>
                </button>
              ))}
            </div>
          )}

          <label className="field">
            <span>口令</span>
            <div className="password-field">
              <input autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入你的口令" disabled={!selected || submitting} />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? '隐藏口令' : '显示口令'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </label>
          <button className="button button--primary button--wide" type="submit" disabled={!selected || submitting}>
            {submitting ? <><LoaderCircle className="spin" size={18} />正在进入…</> : '进入我们的手账'}
          </button>
          <p className="login-card__hint">登录状态会安全保留在这台设备上。忘记口令时由管理员在后台重置。</p>
        </form>
      </section>
    </main>
  )
}
