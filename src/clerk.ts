// Clerk is bundled rather than fetched from Clerk's CDN, so the app still opens offline.
import { Clerk } from '@clerk/clerk-js'

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
  },
} as const
export const clerk = new Clerk(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)

const TOKEN = 'leak-clerk-client'
const FLOW = 'leak-clerk-flow' // the sign-in/up a Google/GitHub redirect belongs to, e.g. "sign_ins/sia_…"

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
    // Remember the flow with the token it belongs to: the redirect rotates that token, and after the reload the
    // first requests already hand out a fresh, empty client's token. The nonce only redeems with the old one.
    const id = (res?.payload?.response as { id?: unknown } | null | undefined)?.id
    if (typeof id === 'string' && /^s[iu]a_/.test(id))
      localStorage.setItem(FLOW, JSON.stringify({ path: `${id.startsWith('sia_') ? 'sign_ins' : 'sign_ups'}/${id}`, token: localStorage.getItem(TOKEN) ?? '' }))
  })
}

/**
 * Desktop return from Google/GitHub, which lands on ?rotating_token_nonce=…. The redirect rotated the client token
 * and the page reload dropped the in-flight sign-in, so redeem the nonce on that sign-in (as Clerk's mobile SDKs do)
 * to get the rotated token back, then activate the session it created. No redirect ever leaves the app.
 */
export async function finishSso(nonce: string) {
  const saved = localStorage.getItem(FLOW)
  if (!saved) return
  const flow = JSON.parse(saved) as { path: string; token: string }
  const url = `https://${clerk.frontendApi}/v1/client/${flow.path}?_is_native=1&_clerk_js_version=${clerk.version}&rotating_token_nonce=${encodeURIComponent(nonce)}`
  const res = await fetch(url, { headers: { authorization: flow.token } })
  if (!res.ok) throw new Error(`Sign-in could not be finished (${res.status})`)
  const token = res.headers.get('authorization')
  if (token) localStorage.setItem(TOKEN, token)
  localStorage.removeItem(FLOW)

  const client = await clerk.client!.reload()
  const { signIn, signUp } = client
  let session: string | null = signIn.createdSessionId ?? signUp.createdSessionId ?? client.sessions[0]?.id ?? null
  // A Google/GitHub account with no Leak user yet comes back "transferable": finish it as a sign-up.
  if (!session && signIn.firstFactorVerification.status === 'transferable') session = (await signUp.create({ transfer: true })).createdSessionId
  if (session) await clerk.setActive({ session })
}
