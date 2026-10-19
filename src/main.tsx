import { ClerkProvider } from '@clerk/react'
import { Clerk } from '@clerk/clerk-js'
import { ui } from '@clerk/ui'
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

// Writes reach Supabase before the screen changes, so a failed one (offline, expired session) changed nothing: say so.
addEventListener('unhandledrejection', (e) => {
  console.error(e.reason)
  const detail = e.reason?.message ?? String(e.reason)
  alert(`${navigator.language.toLowerCase().startsWith('hu') ? 'Nem sikerült menteni. Ellenőrizd az internetkapcsolatot.' : 'Could not save. Check your internet connection.'}\n\n${detail}`)
})

// Bundled rather than fetched from Clerk's CDN, so the app still opens offline.
const clerk = new Clerk(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)
const desktop = '__TAURI_INTERNALS__' in window
if (desktop) {
  // The window's origin (tauri.localhost) is a different site than clerk.leakbudget.hu, so the webview never
  // sends Clerk's cookies back. Native mode carries the client token in a header instead, kept here.
  const KEY = 'leak-clerk-client'
  clerk.__internal_onBeforeRequest((req) => {
    req.credentials = 'omit'
    req.url?.searchParams.append('_is_native', '1')
    ;(req.headers as Headers).set('authorization', localStorage.getItem(KEY) ?? '')
  })
  clerk.__internal_onAfterResponse((_, res) => {
    const token = res?.headers.get('authorization')
    if (token) localStorage.setItem(KEY, token)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      Clerk={clerk}
      ui={ui}
      standardBrowser={!desktop}
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      // Desktop: Google/GitHub must come back into the app (App.tsx finishes it), not to Clerk's account portal.
      {...(desktop && { signInUrl: `${location.origin}/`, signUpUrl: `${location.origin}/` })}
    >
      <App />
    </ClerkProvider>
  </StrictMode>,
)
