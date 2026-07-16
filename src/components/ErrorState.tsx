import { CircleAlert, RefreshCw } from 'lucide-react'

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <section className="empty-state empty-state--error" role="alert">
      <CircleAlert size={30} />
      <h2>这次没有加载成功</h2>
      <p>{error instanceof Error ? error.message : '请检查网络后重试。'}</p>
      {onRetry ? (
        <button className="button button--secondary" type="button" onClick={onRetry}>
          <RefreshCw size={16} />重新加载
        </button>
      ) : null}
    </section>
  )
}
