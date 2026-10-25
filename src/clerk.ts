// Clerk is bundled rather than fetched from Clerk's CDN, so the app still opens offline.
import { Clerk } from '@clerk/clerk-js'
import { openUrl } from '@tauri-apps/plugin-opener'
import { SSO_CALLBACK, ssoReturn } from './lib'

export const desktop = '__TAURI_INTERNALS__' in window

/**
 * Clerk's sign-in and account screens in the app's own look: its colour tokens (so light/dark follow along),
 * Geist, and the same radii and shadows as our sheets. Clerk's CSS goes in the components layer, so the
 * Tailwind classes below win.
 */
export const appearance = {
  cssLayerName: 'components',
  variables: {
    colorPrimary: 'var(--ui-accent)',
    colorPrimaryForeground: 'var(--ui-accent-fg)',
    colorBackground: 'var(--card)',
    colorForeground: 'var(--ui-fg)',
    colorNeutral: 'var(--ui-fg)',
    colorMuted: 'var(--ui-muted)',
    colorMutedForeground: 'var(--ui-muted-fg)',
    colorInput: 'var(--ui-field)',
    colorInputForeground: 'var(--ui-fg)',
    colorBorder: 'var(--ui-line)',
    colorRing: 'var(--ui-accent)',
    colorDanger: '#e11d48',
    colorModalBackdrop: 'rgb(9 9 11 / 0.4)',
    fontFamily: "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
    borderRadius: '0.5rem',
  },
  // Same classes as our own fields, buttons and sheets (ui.tsx), so the two read as one app.
  elements: {
    modalBackdrop: 'backdrop-blur-[2px]',
    cardBox: 'rounded-2xl bg-[var(--card)] shadow-2xl shadow-zinc-950/20 ring-1 ring-zinc-200 dark:ring-zinc-800',
    card: 'shadow-none',
    headerTitle: 'text-lg font-semibold tracking-tight',
    // Flat monochrome buttons, without Clerk's sheen.
    button: { '&[data-variant="solid"]::after': { display: 'none' } },
    formButtonPrimary: 'h-10 text-sm font-medium shadow-none transition active:scale-[0.98]',
    socialButtonsIconButton:
      'h-10 border-0 bg-white shadow-none ring-1 ring-zinc-200 transition hover:bg-zinc-50 active:scale-[0.98] dark:bg-transparent dark:ring-zinc-700 dark:hover:bg-zinc-800',
    socialButtonsBlockButton:
      'h-10 border-0 bg-white shadow-none ring-1 ring-zinc-200 transition hover:bg-zinc-50 active:scale-[0.98] dark:bg-transparent dark:ring-zinc-700 dark:hover:bg-zinc-800',
    formFieldInput:
      'h-11 border-0 shadow-none ring-1 ring-zinc-300 transition focus:ring-2 focus:ring-[var(--ui-accent)] dark:ring-zinc-700',
    footer: 'border-t border-zinc-100 bg-none bg-transparent dark:border-zinc-800',
    // Desktop signs in with Google/GitHub through the system browser from App's own buttons. Clerk's buttons for that,
    // and for connecting an account later, would run it in the webview, which Google refuses.
    ...(desktop && { socialButtonsRoot: 'hidden', dividerRow: 'hidden', profileSection__connectedAccounts: 'hidden' }),
  },
} as const
export const clerk = new Clerk(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)

const TOKEN = 'leak-clerk-client'
const FLOW = 'leak-clerk-flow' // the Google/GitHub sign-in in the browser, e.g. "sign_ins/sia_…", with its client token

if (desktop) {
  // The window's origin (tauri.localhost) is a different site than clerk.leakbudget.hu, so the webview never
  // sends Clerk's cookies back. Native mode carries the client token in a header instead, kept here.
  clerk.__internal_onBeforeRequest((req) => {
    req.credentials = 'omit'
    req.url?.searchParams.append('_is_native', '1')
    ;(req.headers as Headers).set('authorization', localStorage.getItem(TOKEN) ?? '')
  })
  clerk.__internal_onAfterResponse((_, res) => {
    const token = res?.headers.get('authorization')
    if (token) localStorage.setItem(TOKEN, token)
  })
}

/**
 * Desktop Google/GitHub sign-in runs in the system browser, as RFC 8252 asks of native apps: Google refuses embedded
 * webviews, and the browser already knows the user. Clerk then sends the browser to SSO_CALLBACK, which the OS hands
 * to Leak (App.tsx). Remember the sign-in with the token it belongs to: finishing it in the browser rotates that token
 * and the nonce only redeems with the old one.
 */
export async function startSso(strategy: 'oauth_google' | 'oauth_github') {
  const signIn = await clerk.client!.signIn.create({ strategy, redirectUrl: SSO_CALLBACK, actionCompleteRedirectUrl: SSO_CALLBACK })
  localStorage.setItem(FLOW, JSON.stringify({ path: `sign_ins/${signIn.id}`, token: localStorage.getItem(TOKEN) ?? '' }))
  await openUrl(signIn.firstFactorVerification.externalVerificationRedirectURL!.href)
}

/**
 * Desktop return from Google/GitHub: the leakbudget:// link Clerk sent the browser to. Its nonce redeems the sign-in
 * (as Clerk's mobile SDKs do) for the rotated token, then the session it created is activated. A brand-new account
 * comes back without one, to be finished as a sign-up. Any other link, or one without a sign-in in progress, is ignored.
 */
export async function finishSso(link: string) {
  const back = ssoReturn(link)
  const saved = localStorage.getItem(FLOW)
  if (!back || !saved) return
  localStorage.removeItem(FLOW) // one link, one sign-in: the nonce only works once
  const flow = JSON.parse(saved) as { path: string; token: string }
  if (back.nonce) {
    const url = `https://${clerk.frontendApi}/v1/client/${flow.path}?_is_native=1&_clerk_js_version=${clerk.version}&rotating_token_nonce=${encodeURIComponent(back.nonce)}`
    const res = await fetch(url, { headers: { authorization: flow.token } })
    if (!res.ok) throw new Error(`Sign-in could not be finished (${res.status})`)
    const token = res.headers.get('authorization')
    if (token) localStorage.setItem(TOKEN, token)
  }

  const client = await clerk.client!.reload()
  const { signIn, signUp } = client
  let session: string | null = signIn.createdSessionId ?? signUp.createdSessionId ?? client.sessions[0]?.id ?? null
  // A Google/GitHub account with no Leak user yet comes back "transferable": finish it as a sign-up.
  if (!session && signIn.firstFactorVerification.status === 'transferable') session = (await signUp.create({ transfer: true })).createdSessionId
  if (session) await clerk.setActive({ session })
}
