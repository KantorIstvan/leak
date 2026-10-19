import { ClerkProvider } from '@clerk/react'
import { ui } from '@clerk/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import './index.css'
import App from './App.tsx'
import { clerk, desktop } from './clerk'

if (import.meta.env.DEV && location.search.includes('demo')) import('./demo').then((m) => m.seedDemo())

// No browser right-click menu (Back, Reload, Inspect…) in the app; text fields keep it for copy/paste.
if (!import.meta.env.DEV)
  addEventListener('contextmenu', (e) => {
    if (!(e.target as HTMLElement).closest('input, textarea')) e.preventDefault()
  })

// Writes reach Supabase before the screen changes, so a failed one (offline, expired session) changed nothing: say so.
addEventListener('unhandledrejection', (e) => {
  console.error(e.reason)
  const detail = e.reason?.message ?? String(e.reason)
  alert(`${navigator.language.toLowerCase().startsWith('hu') ? 'Nem sikerült menteni. Ellenőrizd az internetkapcsolatot.' : 'Could not save. Check your internet connection.'}\n\n${detail}`)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      Clerk={clerk}
      ui={ui}
      standardBrowser={!desktop}
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      // Desktop: Google/GitHub must come back into the app (App.tsx finishes it), not to Clerk's account portal.
      // After finishing, stay in the app instead of Clerk's default home URL (https://leakbudget.hu).
      {...(desktop && {
        signInUrl: `${location.origin}/`,
        signUpUrl: `${location.origin}/`,
        signInFallbackRedirectUrl: `${location.origin}/`,
        signUpFallbackRedirectUrl: `${location.origin}/`,
      })}
    >
      <App />
    </ClerkProvider>
  </StrictMode>,
)
