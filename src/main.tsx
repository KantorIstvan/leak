import { ClerkProvider } from '@clerk/react'
import { ui } from '@clerk/ui'
import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/newsreader' // headlines and big figures (font-display)
import './index.css'
import App from './App.tsx'
import { appearance, clerk, desktop } from './clerk'
import { DEFAULT_SETTINGS } from './db'
import { Button } from './ui'

// The UI language until the account's settings load (App sets it from them); the messages below follow it.
document.documentElement.lang = DEFAULT_SETTINGS.lang
const hu = () => document.documentElement.lang === 'hu'

// No browser right-click menu (Back, Reload, Inspect…) in the app; text fields keep it for copy/paste.
if (!import.meta.env.DEV)
  addEventListener('contextmenu', (e) => {
    if (!(e.target as HTMLElement).closest('input, textarea')) e.preventDefault()
  })

// Writes reach Supabase before the screen changes, so a failed one (offline, expired session) changed nothing: say so.
addEventListener('unhandledrejection', (e) => {
  console.error(e.reason)
  const detail = e.reason?.message ?? String(e.reason)
  alert(`${hu() ? 'Nem sikerült menteni. Ellenőrizd az internetkapcsolatot.' : 'Could not save. Check your internet connection.'}\n\n${detail}`)
})

/** A crash while rendering shows what happened and a way out, instead of an empty window. */
class Crash extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <div className="grid max-w-md justify-items-center gap-4 text-center">
          <h1 className="text-xl font-semibold tracking-tight">{hu() ? 'Valami hiba történt' : 'Something went wrong'}</h1>
          <p className="text-sm wrap-break-word text-zinc-600 dark:text-zinc-400">{error.message}</p>
          <Button variant="primary" onClick={() => location.reload()}>
            {hu() ? 'Újratöltés' : 'Reload'}
          </Button>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      Clerk={clerk}
      ui={ui}
      appearance={appearance}
      standardBrowser={!desktop}
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      // Desktop: Clerk's own redirects (after an email sign-in, say) stay in the app instead of going to Clerk's
      // account portal or its default home URL (https://leakbudget.hu). Google/GitHub run in the browser (startSso).
      {...(desktop && {
        signInUrl: `${location.origin}/`,
        signUpUrl: `${location.origin}/`,
        signInFallbackRedirectUrl: `${location.origin}/`,
        signUpFallbackRedirectUrl: `${location.origin}/`,
      })}
    >
      <Crash>
        <App />
      </Crash>
    </ClerkProvider>
  </StrictMode>,
)
