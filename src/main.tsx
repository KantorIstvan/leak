import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import './index.css'
import App from './App.tsx'

if (import.meta.env.DEV && location.search.includes('demo')) import('./demo').then((m) => m.seedDemo())

// No browser right-click menu (Back, Reload, Inspect…) in the app; text fields keep it for copy/paste.
if (!import.meta.env.DEV)
  addEventListener('contextmenu', (e) => {
    if (!(e.target as HTMLElement).closest('input, textarea')) e.preventDefault()
  })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
