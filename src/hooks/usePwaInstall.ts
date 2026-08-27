import { useEffect, useState } from 'react'

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIos, setIsIos] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches ?? false
      const isIosStandalone = Boolean((window.navigator as unknown as { standalone?: boolean })?.standalone)
      return isStandaloneMedia || isIosStandalone
    }

    setIsInstalled(checkStandalone())

    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !checkStandalone()
    setIsIos(isIosDevice)

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent default mini-infobar or browser handling
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setIsInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  async function promptInstall(): Promise<boolean> {
    if (!deferredPrompt) return false
    try {
      await deferredPrompt.prompt()
      const choiceResult = await deferredPrompt.userChoice
      if (choiceResult.outcome === 'accepted') {
        setDeferredPrompt(null)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIos,
    promptInstall,
  }
}
