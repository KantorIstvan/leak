// Clerk is bundled rather than fetched from Clerk's CDN, so the app still opens offline.
import { Clerk } from '@clerk/clerk-js'
import { openUrl } from '@tauri-apps/plugin-opener'
import { deleteAccountData } from './cloud'
import { SSO_CALLBACK, ssoReturn } from './lib'

export const desktop = '__TAURI_INTERNALS__' in window

/**
 * Clerk's sign-in and account screens in the app's own editorial look: ink on paper, square corners, rules instead of
 * boxes, the serif for titles, uppercase tracked buttons, and the window's own canvas/panel split for the account
 * screen's menu. Its colour tokens follow light/dark and Settings > Colours. Clerk's CSS goes in the components
 * layer, so the Tailwind classes below win.
 */
const label = 'text-[13px] font-medium tracking-[0.08em] uppercase'
const quiet = 'text-zinc-600 hover:bg-ink/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
const outline = 'h-10 border-0 bg-transparent shadow-none ring-1 ring-ink ring-inset transition hover:bg-ink/5 active:scale-[0.98]'

export const appearance = {
  cssLayerName: 'components',
  layout: { unsafe_disableDevelopmentModeWarnings: true },
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
    colorDanger: 'var(--ui-danger)',
    colorModalBackdrop: 'rgb(9 9 11 / 0.4)',
    fontFamily: "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
    borderRadius: '0',
  },
  // Same classes as our own sheets, palette, fields and buttons (index.css, ui.tsx), so the two read as one app.
  elements: {
    modalBackdrop: 'backdrop-blur-[2px]',
    // The command palette's box: an ink frame with a flat offset shadow.
    cardBox: 'border-2 border-ink bg-panel shadow-[8px_8px_0] shadow-ink/10 dark:shadow-black/50',
    card: 'bg-panel shadow-none',
    modalCloseButton: `size-10 ${quiet}`,
    headerTitle: 'font-display text-[1.75rem] leading-tight font-medium tracking-[-0.01em]',
    headerSubtitle: 'text-sm text-zinc-600 dark:text-zinc-400',

    // Account screen menu: the app's sidebar, canvas behind the panel, the current item marked with an ink rule.
    navbar: 'border-r border-line bg-canvas bg-none shadow-none',
    navbarButton: `h-9 text-sm font-medium transition ${quiet} [&.cl-active]:bg-ink/5 [&.cl-active]:text-zinc-900 [&.cl-active]:shadow-[inset_2px_0_0_var(--color-ink)] dark:[&.cl-active]:text-white`,
    navbarMobileMenuRow: 'border-b border-line bg-canvas',

    // Sections: small tracked labels on the left, hairline rules between them.
    profileSection: 'border-line',
    profileSectionTitleText: 'text-[11px] font-medium tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400',
    profileSectionPrimaryButton: `${label} ${quiet}`,
    // Delete account stays red so it stands out, like our danger buttons (`!`: it also carries the quiet grey above).
    profileSectionPrimaryButton__danger: 'text-(--ui-danger)! ring-1 ring-(--ui-danger)/30 ring-inset hover:bg-(--ui-danger)/10!',
    badge: 'bg-transparent text-[10px] font-medium tracking-[0.12em] text-zinc-600 uppercase shadow-none ring-1 ring-line ring-inset dark:text-zinc-400',
    menuList: 'border-0 bg-panel shadow-[6px_6px_0] ring-1 shadow-ink/10 ring-ink dark:shadow-black/50',
    menuItem: 'hover:bg-ink/5',
    dividerLine: 'bg-line',

    // Flat monochrome buttons, without Clerk's sheen; red on hover like ours.
    button: { '&[data-variant="solid"]::after': { display: 'none' } },
    formButtonPrimary: `h-10 ${label} shadow-none transition hover:bg-accent-strong active:scale-[0.98]`,
    formButtonReset: `h-10 ${label} ${quiet}`,
    socialButtonsIconButton: outline,
    socialButtonsBlockButton: outline,
    // Fields are an ink underline, shaded while focused (inputCls).
    formFieldLabel: 'text-sm font-medium text-zinc-700 dark:text-zinc-300',
    formFieldInput:
      'h-11 border-0 bg-transparent shadow-[inset_0_-1px_0_var(--color-ink)] transition focus:bg-ink/5 focus:shadow-[inset_0_-2px_0_var(--color-ink)]',
    // Checkboxes also get formFieldInput's classes, so undo the underline field (`!`) and draw a square ink frame
    // that fills with ink, inset from the frame, when checked.
    formFieldCheckboxInput:
      'mt-0.5 size-4! shrink-0 cursor-pointer appearance-none bg-transparent! shadow-[inset_0_0_0_1.5px_var(--color-ink)]! transition checked:bg-ink! checked:shadow-[inset_0_0_0_1.5px_var(--color-ink),inset_0_0_0_4px_var(--color-panel)]! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    formFieldCheckboxLabel: 'text-sm font-medium text-zinc-800 dark:text-zinc-200',
    footer: 'border-t border-line bg-transparent bg-none',

    // One email per account: Leak never mails, so a second address would only be one more way in to secure.
    profileSectionPrimaryButton__emailAddresses: 'hidden',
    // Desktop signs in with Google/GitHub through the system browser from App's own buttons. Clerk's buttons for that,
    // and for connecting an account later, would run it in the webview, which Google refuses.
    ...(desktop && { socialButtonsRoot: 'hidden', dividerRow: 'hidden', profileSection__connectedAccounts: 'hidden' }),
  },
} as const
export const clerk = new Clerk(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)

const TOKEN = 'leak-clerk-client'
const FLOW = 'leak-clerk-flow' // the Google/GitHub sign-in in the browser, e.g. "sign_ins/sia_…", with its client token

// "Delete account" in Clerk's profile screen deletes only the Clerk user; the account's data goes first. A failure throws,
// which stops the deletion and shows there (returning false would make Clerk fake a success). Registered before the
// native-mode hook below, so the request carries the client token as it is after the wipe.
// ponytail: deletions made elsewhere (account portal, dashboard) keep the rows, and another open device can refill the
// account in its token's last minute (setUp); a Clerk user.deleted webhook that wipes and blocks the user closes both.
clerk.__internal_onBeforeRequest(async (req) => {
  if (req.method === 'DELETE' && req.path === '/me') await deleteAccountData()
})

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
