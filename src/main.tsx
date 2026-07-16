import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initializeTheme } from './contexts/ThemeContext'
import { installDeploymentRecovery } from './lib/recovery'
import './styles.css'

initializeTheme()
installDeploymentRecovery()
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
