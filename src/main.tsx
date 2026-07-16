import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initializeTheme } from './contexts/ThemeContext'
import './styles.css'

initializeTheme()
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
