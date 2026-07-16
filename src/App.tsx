import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LoadingScreen } from './components/LoadingScreen'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { signOut } from './lib/api'
import { LoginPage } from './pages/LoginPage'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const ExamsPage = lazy(() => import('./pages/ExamsPage').then((module) => ({ default: module.ExamsPage })))
const ExamFormPage = lazy(() => import('./pages/ExamFormPage').then((module) => ({ default: module.ExamFormPage })))
const ExamDetailPage = lazy(() => import('./pages/ExamDetailPage').then((module) => ({ default: module.ExamDetailPage })))
const TrashPage = lazy(() => import('./pages/TrashPage').then((module) => ({ default: module.TrashPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))

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
    <Suspense fallback={<LoadingScreen />}>
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
    </Suspense>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <ToastProvider>
            <AuthProvider><AppRoutes /></AuthProvider>
          </ToastProvider>
        </HashRouter>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
