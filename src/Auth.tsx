/**
 * Leak's own sign-in-or-up and account menu, with the motion of Motion's Clerk examples
 * (motion.dev/examples, category Clerk): the password field that opens only when it is needed (its height measured with
 * resize()), the code card that stacks over the sign-in card, the heading that blurs between "sign in" and "create your
 * account", and the avatar that morphs into the account menu (shared layoutId). Square corners and ink frames instead
 * of the examples' rounded cards, so it reads as the rest of the app. Talks to Clerk through its resource API, as
 * finishSso does; anything this form does not cover (a second factor other than a code, extra sign-up fields) falls
 * back to Clerk's own modal.
 */
import { useClerk, useUser } from '@clerk/react'
import { GearSix, SignOut, UserGear } from '@phosphor-icons/react'
import { AnimatePresence, MotionConfig, motion, resize, useAnimate, type Transition, type Variants } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { clerk, desktop } from './clerk'
import type { Dict } from './i18n'
import { Button, inputCls } from './ui'

type SignInResource = NonNullable<typeof clerk.client>['signIn']
type SignUpResource = NonNullable<typeof clerk.client>['signUp']

// The examples' springs: cards, fields and headings; the account menu is a touch quicker and calmer.
const SPRING: Transition = { type: 'spring', bounce: 0.3, visualDuration: 0.4 }
const MENU_SPRING: Transition = { type: 'spring', bounce: 0.15, visualDuration: 0.25 }

const SIGN_IN: Variants = { default: { opacity: 1, scale: 1, y: 0 }, verifying: { opacity: 0.6, scale: 0.95, y: -10 } }
const VERIFY: Variants = { default: { opacity: 0, y: 100 }, verifying: { opacity: 1, y: 0 } }
const TEXT: Variants = {
  initial: { opacity: 0, filter: 'blur(10px)', y: -10 },
  animate: { opacity: 1, filter: 'blur(0px)', y: 0 },
  exit: { opacity: 0, filter: 'blur(10px)', y: 10 },
}
const CONTENT = {
  initial: { opacity: 0, filter: 'blur(8px)' },
  animate: { opacity: 1, filter: 'blur(0px)', transition: { delay: 0.15 } },
  exit: { opacity: 0, filter: 'blur(8px)' },
}

const cardCls = 'border-2 border-ink bg-panel p-6 text-left shadow-[8px_8px_0] shadow-ink/10 dark:shadow-black/50'
const linkCls =
  'text-sm text-zinc-600 underline decoration-ink/30 underline-offset-4 transition hover:text-zinc-900 hover:decoration-ink disabled:pointer-events-none disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100'

/** What went wrong, in the app's language for the usual cases (Clerk's own messages are English), else Clerk's words. */
function why(e: unknown, t: Dict) {
  const first = (e as { errors?: { code?: string; message?: string; longMessage?: string }[] })?.errors?.[0]
  const ours: Record<string, string> = {
    form_password_incorrect: t.errPassword,
    form_code_incorrect: t.errCode,
    verification_expired: t.errExpired,
    too_many_requests: t.errTooMany,
    user_locked: t.errTooMany,
    form_password_pwned: t.errPwned,
  }
  return ours[first?.code ?? ''] ?? first?.longMessage ?? first?.message ?? t.signInFailed
}
const code = (e: unknown) => (e as { errors?: { code?: string }[] })?.errors?.[0]?.code

/** Twelve fading bars, as in the examples (CSS, so it also runs with reduced motion: it is a status, not decoration). */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    // aria-hidden: the button it sits in says aria-busy.
    <span aria-hidden className={`relative inline-block size-4 ${className}`}>
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="spinner-bar absolute top-0 left-[calc(50%-1px)] h-[30%] w-0.5 origin-[50%_166%] rounded-full bg-current"
          style={{ rotate: `${i * 30}deg`, animationDelay: `${-1.1 + i * 0.1}s` }}
        />
      ))}
    </span>
  )
}

/**
 * Opens to its content's height and closes to nothing: the height is measured with resize() and animated by Motion,
 * while the content fades and drops in (the Conditional Field example).
 */
function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  const [height, setHeight] = useState(0)
  const measure = useCallback((el: HTMLDivElement | null) => (el ? resize(el, (_, size) => setHeight(size.height)) : undefined), [])
  return (
    <motion.div initial={false} animate={{ height: open ? height : 0 }} style={{ willChange: 'height' }} className="-mx-1 overflow-hidden px-1">
      <div ref={measure}>
        <AnimatePresence mode="popLayout" initial={false}>
          {open && (
            <motion.div key="content" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 0 }} className="pt-4">
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

/** Six slots over one plain input, so paste, autofill and the OS's one-time-code suggestions all just work. */
function CodeInput({ value, onChange, label, shake }: { value: string; onChange: (v: string) => void; label: string; shake: number }) {
  const [scope, animate] = useAnimate()
  const [focused, setFocused] = useState(true)
  // A wrong code shakes the slots, the way a password field shakes on a Mac.
  useEffect(() => {
    if (shake) void animate(scope.current, { x: [0, -8, 8, -5, 5, -2, 0] }, { duration: 0.4, ease: 'easeOut' })
  }, [shake, animate, scope])
  return (
    <div ref={scope} className="relative">
      <input
        autoFocus
        aria-label={label}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 z-10 w-full bg-transparent text-transparent caret-transparent opacity-0 outline-none selection:bg-transparent"
      />
      <div aria-hidden className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }, (_, i) => {
          const active = focused && (i === value.length || (i === 5 && value.length === 6))
          return (
            <div
              key={i}
              className={`num relative grid h-12 place-items-center text-xl font-medium transition-[box-shadow,background-color] ${
                active ? 'bg-ink/5 shadow-[inset_0_-2px_0_var(--color-ink)]' : 'shadow-[inset_0_-1px_0_var(--color-ink)]'
              }`}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {value[i] && (
                  <motion.span key={value[i]} initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -6 }}>
                    {value[i]}
                  </motion.span>
                )}
              </AnimatePresence>
              {active && !value[i] && <span className="caret-blink h-5 w-px bg-current" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The code being asked for, and how to send it again (none for an authenticator app's code). */
type Verify = { kind: 'first' | 'second' | 'up'; strategy: 'email_code' | 'totp'; resend?: () => Promise<unknown> }

/**
 * Sign in or create an account with an email: Continue checks the address with Clerk, then asks for what that account
 * needs, a password (opened in place) or an emailed code (on a card stacked over this one). An unknown address becomes
 * a sign-up, and the heading says so.
 */
export function EmailSignIn({ t }: { t: Dict }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [up, setUp] = useState(false) // creating an account rather than signing in
  const [askPassword, setAskPassword] = useState(false)
  const [canCode, setCanCode] = useState(false) // this account can sign in with an emailed code instead of its password
  const [verify, setVerify] = useState<Verify | null>(null)
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(0)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(Date.now)
  const running = useRef(false)

  useEffect(() => {
    if (resendAt <= now) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [resendAt, now])

  const client = () => clerk.client!
  // Clerk's modal, for what this form does not do. On desktop it is a fallback only: its Google/GitHub buttons are hidden
  // there (clerk.ts) and SignedOut has its own, so the modal has nothing more to offer than this form.
  const other = () => (up ? clerk.openSignUp() : clerk.openSignIn())

  /** One request at a time; a failure shows under the form instead of throwing. */
  const run = async (fn: () => Promise<unknown>, onError?: (e: unknown) => void) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      console.error(e)
      setError(why(e, t))
      onError?.(e)
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  const showCode = (v: Verify) => {
    setOtp('')
    setVerify(v)
    if (v.strategy === 'email_code') {
      setResendAt(Date.now() + 30_000)
      setNow(Date.now())
    }
  }

  /** Emails a code for the first factor, or false when this account cannot take one. */
  const emailCode = async (si: SignInResource) => {
    const f = si.supportedFirstFactors?.find((f) => f.strategy === 'email_code')
    if (!f || !('emailAddressId' in f)) return false
    const send = () => si.prepareFirstFactor({ strategy: 'email_code', emailAddressId: f.emailAddressId })
    await send()
    showCode({ kind: 'first', strategy: 'email_code', resend: send })
    return true
  }

  /** After the first factor: in, a code from an app or email, or Clerk's modal for anything else. */
  const signedIn = async (si: SignInResource) => {
    if (si.status === 'complete') return clerk.setActive({ session: si.createdSessionId })
    if (si.status === 'needs_second_factor' || si.status === 'needs_client_trust') {
      const f2 = si.supportedSecondFactors ?? []
      if (f2.some((f) => f.strategy === 'totp')) return showCode({ kind: 'second', strategy: 'totp' })
      const ec = f2.find((f) => f.strategy === 'email_code')
      if (ec) {
        const send = () => si.prepareSecondFactor({ strategy: 'email_code', ...('emailAddressId' in ec && { emailAddressId: ec.emailAddressId }) })
        await send()
        return showCode({ kind: 'second', strategy: 'email_code', resend: send })
      }
    }
    other()
  }

  /** A new account: a password if the instance wants one, then the emailed code. */
  const signUp = async (su: SignUpResource) => {
    if (su.status === 'complete') return clerk.setActive({ session: su.createdSessionId })
    // Anything else first (Clerk Protect's bot check, a name, legal consent): Clerk's modal asks for it, and it should
    // come before anyone types a password here that the modal would ask for again.
    if (su.missingFields.some((f) => f !== 'password')) return other()
    if (su.missingFields.includes('password') && !password) return setAskPassword(true)
    const send = () => su.prepareEmailAddressVerification({ strategy: 'email_code' })
    await send()
    showCode({ kind: 'up', strategy: 'email_code', resend: send })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    void run(async () => {
      if (up) return signUp(await (askPassword ? client().signUp.update({ password }) : client().signUp.create({ emailAddress: email.trim() })))
      if (askPassword) return signedIn(await client().signIn.attemptFirstFactor({ strategy: 'password', password }))
      try {
        const si = await client().signIn.create({ identifier: email.trim() })
        if (si.supportedFirstFactors?.some((f) => f.strategy === 'password')) {
          setCanCode(si.supportedFirstFactors.some((f) => f.strategy === 'email_code'))
          return setAskPassword(true)
        }
        if (!(await emailCode(si))) other()
      } catch (e) {
        if (code(e) !== 'form_identifier_not_found') throw e
        setUp(true)
        await signUp(await client().signUp.create({ emailAddress: email.trim() }))
      }
    })
  }

  const check = (value: string) =>
    run(
      async () => {
        if (!verify) return
        if (verify.kind === 'up') return signUp(await client().signUp.attemptEmailAddressVerification({ code: value }))
        const si =
          verify.kind === 'first'
            ? await client().signIn.attemptFirstFactor({ strategy: 'email_code', code: value })
            : await client().signIn.attemptSecondFactor({ strategy: verify.strategy, code: value })
        await signedIn(si)
      },
      () => {
        setShake((n) => n + 1)
        setOtp('')
      },
    )

  const resend = () =>
    run(async () => {
      if (!verify?.resend) return
      await verify.resend()
      setOtp('')
      setResendAt(Date.now() + 30_000)
      setNow(Date.now())
    })

  /** Back to the address alone: the password field closes and, for a new account, the heading turns back. */
  const restart = () => {
    setVerify(null)
    setAskPassword(false)
    setPassword('')
    setUp(false)
    setCanCode(false)
    setError('')
  }

  const wait = Math.ceil((resendAt - now) / 1000)
  const verifying = verify !== null
  const title = up ? t.createAccount : t.signInEmail

  return (
    <MotionConfig transition={SPRING} reducedMotion="user">
      {/* pb: room for the code card, which sits a little lower than the card it stacks over. */}
      <motion.div className="relative w-[min(22rem,calc(100vw-2rem))] pb-4" initial={false} animate={verifying ? 'verifying' : 'default'}>
        <motion.div variants={SIGN_IN} inert={verifying} className={cardCls}>
          <div className="relative mb-5 h-9 overflow-visible">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.h2 key={title} variants={TEXT} initial="initial" animate="animate" exit="exit" className="font-display text-[1.75rem] leading-tight font-medium tracking-[-0.01em]">
                {title}
              </motion.h2>
            </AnimatePresence>
          </div>
          <form noValidate onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && askPassword && (e.stopPropagation(), restart())}>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.email}</span>
              <input
                type="email"
                autoComplete="username"
                autoFocus
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  // A different address is a different account: start its checks over.
                  if (askPassword || up) restart()
                }}
                className={inputCls}
              />
            </label>
            <Reveal open={askPassword}>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.password}</span>
                <input
                  type="password"
                  autoComplete={up ? 'new-password' : 'current-password'}
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls}
                />
              </label>
              {canCode && (
                <button type="button" className={`mt-3 ${linkCls}`} disabled={busy} onClick={() => run(async () => void ((await emailCode(client().signIn)) || other()))}>
                  {t.emailCodeInstead}
                </button>
              )}
            </Reveal>
            <Reveal open={!!error && !verifying}>
              <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-400">
                {error}
              </p>
            </Reveal>
            <Button type="submit" variant="primary" aria-busy={busy} className="relative mt-6 w-full">
              <span className={busy ? 'invisible' : ''}>{t.continue}</span>
              {busy && <Spinner className="absolute" />}
            </Button>
          </form>
          {!desktop && (
            <div className="mt-5 border-t border-line pt-4 text-center">
              <button type="button" className={linkCls} onClick={other}>
                {t.otherWays}
              </button>
            </div>
          )}
        </motion.div>

        <AnimatePresence mode="popLayout">
          {verify && (
            <motion.div key="verify" variants={VERIFY} initial="default" animate="verifying" exit="default" className={`absolute inset-x-0 top-4 ${cardCls}`}>
              <h2 className="font-display text-[1.75rem] leading-tight font-medium tracking-[-0.01em]">{verify.strategy === 'totp' ? t.verifyApp : t.verifyTitle}</h2>
              <p className="mt-2 mb-6 text-sm text-zinc-600 dark:text-zinc-400">{verify.strategy === 'totp' ? t.verifyAppHint : t.verifyHint(email.trim())}</p>
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault()
                  if (otp.length === 6) void check(otp)
                }}
              >
                <CodeInput
                  label={t.verifyTitle}
                  value={otp}
                  shake={shake}
                  onChange={(v) => {
                    setOtp(v)
                    if (v.length === 6) void check(v) // a full code goes at once, no button needed
                  }}
                />
                <Reveal open={!!error}>
                  <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-400">
                    {error}
                  </p>
                </Reveal>
                <Button type="submit" variant="primary" aria-busy={busy} disabled={otp.length < 6 && !busy} className="relative mt-6 w-full">
                  <span className={busy ? 'invisible' : ''}>{t.verify}</span>
                  {busy && <Spinner className="absolute" />}
                </Button>
              </form>
              <div className="mt-5 flex items-center justify-between gap-4 border-t border-line pt-4">
                <button type="button" className={linkCls} onClick={restart}>
                  {t.startOver}
                </button>
                {verify.resend && (
                  <button type="button" className={`num ${linkCls}`} disabled={busy || wait > 0} onClick={resend}>
                    {wait > 0 ? t.resendIn(wait) : t.resend}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  )
}

function Avatar({ src, size }: { src: string; size: string }) {
  return (
    <motion.div layoutId="user-avatar" className={`shrink-0 overflow-hidden rounded-full ring-1 ring-zinc-900/10 dark:ring-white/10 ${size}`} style={{ borderRadius: 999 }}>
      <img src={src} alt="" className="size-full object-cover" />
    </motion.div>
  )
}

/**
 * The account in the sidebar's foot, which is also the way to Settings: the avatar row morphs into the account menu
 * over the sidebar (the User Button example's shared layoutId), and back on a pick, Esc, Tab away or a click elsewhere.
 * Marked like a nav item while Settings is open. Without an account (Clerk could not load) it shows `fallback`.
 */
export function UserButton({
  t,
  collapsed,
  current,
  onSettings,
  fallback,
}: {
  t: Dict
  collapsed: boolean
  current: boolean
  onSettings: () => void
  fallback: ReactNode
}) {
  const { user } = useUser()
  const clerk = useClerk()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const refocus = useRef(false)

  /** Closes the menu; `back` returns focus to the avatar row (not when a Clerk dialog takes it, or we sign out). */
  const close = (back: boolean) => {
    refocus.current = back
    setOpen(false)
  }

  // Focus moves in on open (to the first item) and back out on close. Not with autoFocus or a ref callback: when the menu
  // opens or closes again within a second, AnimatePresence brings back the element it is still fading out (layoutId)
  // instead of mounting a new one, and those only run on mount.
  useEffect(() => {
    if (open) return box.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
    if (!refocus.current) return
    refocus.current = false
    box.current?.querySelector<HTMLElement>('[aria-haspopup=menu]')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close(true)
    }
    addEventListener('pointerdown', away)
    addEventListener('keydown', esc, true)
    return () => {
      removeEventListener('pointerdown', away)
      removeEventListener('keydown', esc, true)
    }
  }, [open])

  if (!user) return fallback
  const email = user.primaryEmailAddress?.emailAddress
  const name = user.fullName || user.username || email || ''
  const items = [
    { icon: UserGear, label: t.manageAccount, on: false, back: false, run: () => clerk.openUserProfile() },
    { icon: GearSix, label: t.nav.settings, on: current, back: true, run: onSettings },
    { icon: SignOut, label: t.signOut, on: false, back: false, run: () => clerk.signOut() },
  ]
  // A menu moves with the arrow keys, Home and End (the WAI-ARIA menu pattern).
  const move = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]')]
    const i = all.indexOf(document.activeElement as HTMLElement)
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key]
    if (to === undefined) return
    e.preventDefault()
    all[(to + all.length) % all.length]?.focus()
  }

  return (
    <MotionConfig transition={MENU_SPRING} reducedMotion="user">
      {/* Holds the closed row's place; the menu opens upwards out of it, over the nav. */}
      <div ref={box} className="relative h-11">
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="open"
              layoutId="user-button"
              role="menu"
              aria-label={name}
              onKeyDown={move}
              // Tab (or anything else) taking focus out of the menu closes it.
              onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && e.relatedTarget && setOpen(false)}
              className="absolute bottom-0 left-0 z-30 w-[216px] border-2 border-ink bg-panel p-1.5 shadow-[6px_6px_0] shadow-ink/10 dark:shadow-black/50"
            >
              <div className="flex items-center gap-3 px-2 pt-1.5 pb-3">
                <Avatar src={user.imageUrl} size="size-9" />
                <motion.div {...CONTENT} className="min-w-0">
                  <div className="truncate text-sm font-medium">{name}</div>
                  {email && email !== name && <div className="truncate text-xs text-zinc-600 dark:text-zinc-400">{email}</div>}
                </motion.div>
              </div>
              <motion.div {...CONTENT} className="grid gap-0.5 border-t border-line pt-1.5">
                {items.map(({ icon: I, label, on, back, run }) => (
                  <button
                    key={label}
                    type="button"
                    role="menuitem"
                    aria-current={on ? 'page' : undefined}
                    onClick={() => {
                      close(back)
                      void run()
                    }}
                    className={`flex h-9 items-center gap-3 px-2 text-left text-sm font-medium transition hover:bg-ink/5 focus-visible:bg-ink/5 focus-visible:outline-none ${
                      on
                        ? 'text-zinc-900 shadow-[inset_2px_0_0_var(--color-ink)] dark:text-white'
                        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                    }`}
                  >
                    <I size={18} weight={on ? 'fill' : 'regular'} className="shrink-0" />
                    {label}
                  </button>
                ))}
              </motion.div>
            </motion.div>
          ) : (
            <motion.button
              key="closed"
              layoutId="user-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={false}
              aria-current={current ? 'page' : undefined}
              aria-label={collapsed ? name : undefined}
              data-tip={collapsed ? name : undefined}
              data-tip-side="right"
              onClick={() => setOpen(true)}
              className={`absolute bottom-0 left-0 flex h-11 items-center gap-3 px-2.5 text-left text-sm font-medium transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-accent ${collapsed ? 'w-11' : 'w-full'} ${
                current
                  ? 'bg-ink/5 text-zinc-900 shadow-[inset_2px_0_0_var(--color-ink)] dark:text-white'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <Avatar src={user.imageUrl} size="size-6" />
              {!collapsed && (
                <motion.span {...CONTENT} className="truncate">
                  {name}
                </motion.span>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}
