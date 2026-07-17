import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AppShell } from './components/AppShell'
import { LoadingScreen } from './components/LoadingScreen'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { StudentScopeProvider } from './contexts/StudentScopeContext'
import { ToastProvider } from './contexts/ToastContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { signOut } from './lib/api'
import { DashboardPage } from './pages/DashboardPage'
import { ExamDetailPage } from './pages/ExamDetailPage'
import { ExamFormPage } from './pages/ExamFormPage'
import { ExamsPage } from './pages/ExamsPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SettingsPage } from './pages/SettingsPage'
import { TrashPage } from './pages/TrashPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
})

function ProtectedLayout() {
  const { user, profile, membership, loading, configured, refreshIdentity } = useAuth()
  if (loading) return <LoadingScreen />
  if (!configured || !user) return <Navigate to="/login" replace />
  if (!profile || !membership) {
    return (
      <main className="identity-gate">
        <section className="panel">
          <p className="eyebrow">访问已拒绝</p>
          <h1>这个账号不在双人空间里</h1>
          <p>它可能尚未完成初始化，或当前网络暂时无法读取成员资格。业务数据仍会由 RLS 拒绝访问。</p>
          <div>
            <button className="button button--primary" type="button" onClick={() => void refreshIdentity()}>重新检查</button>
            <button className="button button--secondary" type="button" onClick={() => void signOut().catch(() => undefined)}>退出账号</button>
          </div>
        </section>
      </main>
    )
  }
  return <AppShell />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="exams" element={<ExamsPage />} />
        <Route path="exams/new" element={<ExamFormPage />} />
        <Route path="exams/:examId" element={<ExamDetailPage />} />
        <Route path="exams/:examId/edit" element={<ExamFormPage />} />
        <Route path="trash" element={<TrashPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <HashRouter>
            <ToastProvider>
              <AuthProvider><StudentScopeProvider><AppRoutes /></StudentScopeProvider></AuthProvider>
            </ToastProvider>
          </HashRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  )
}
