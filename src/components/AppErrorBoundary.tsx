import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCcw } from 'lucide-react'
import { isStaleAssetError, recoverStaleDeployment, reloadLatestVersion } from '../lib/recovery'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application render failed', error, info.componentStack)
    if (isStaleAssetError(error)) recoverStaleDeployment()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="app-crash">
        <section className="panel">
          <span className="app-crash__icon"><AlertTriangle /></span>
          <p className="eyebrow">页面恢复</p>
          <h1>页面没有成功加载</h1>
          <p>成绩数据仍安全保存在云端。请重新载入最新网站版本；如果仍失败，此页面会保留错误信息，不会再显示空白屏。</p>
          <code>{this.state.error.message || this.state.error.name}</code>
          <button className="button button--primary" type="button" onClick={reloadLatestVersion}><RefreshCcw size={17} />重新加载最新版本</button>
        </section>
      </main>
    )
  }
}
