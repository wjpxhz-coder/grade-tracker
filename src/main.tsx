import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/noto-sans-sc/index.css'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { initializeTheme } from './contexts/ThemeContext'
import { installDeploymentRecovery } from './lib/recovery'
import './styles.css'
import './styles/tokens.css'
import './styles/redesign.css'

initializeTheme()
installDeploymentRecovery()
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
