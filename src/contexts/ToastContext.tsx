import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])
  const showToast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = crypto.randomUUID()
      setItems((current) => [...current, { id, message, tone }])
      window.setTimeout(() => remove(id), 4200)
    },
    [remove],
  )
  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-label="通知">
        {items.map((item) => {
          const Icon = item.tone === 'success' ? CheckCircle2 : item.tone === 'error' ? CircleAlert : Info
          return (
            <div className={`toast toast--${item.tone}`} key={item.id}>
              <Icon size={18} aria-hidden="true" />
              <span>{item.message}</span>
              <button type="button" onClick={() => remove(item.id)} aria-label="关闭通知">
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
