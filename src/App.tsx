import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AuthenticateWithRedirectCallback, SignInButton, useAuth } from '@clerk/react'
import { ArrowsClockwise, CalendarBlank, ChartBar, Drop, GearSix, Plus, Tag, Target, type Icon } from '@phosphor-icons/react'
import { clearLocal, pull, setToken, start } from './cloud'
import { db, DEFAULT_SETTINGS, type Theme, type Tx } from './db'
import { dicts } from './i18n'
import { formatMoney, monthOf, today } from './lib'
import { TxForm } from './TxSheet'
import { Button, Ctx, Sheet, type AppCtx } from './ui'
import { MonthPage } from './pages/Month'
import { YearPage } from './pages/Year'
import { GoalsPage } from './pages/Goals'
import { CategoriesPage } from './pages/Categories'
import { SettingsPage } from './pages/Settings'
import { Updater } from './Updater'
import { SubsPage, syncSubs } from './pages/Subs'

type Page = 'month' | 'year' | 'subs' | 'goals' | 'categories' | 'settings'
const NAV: { id: Page; icon: Icon }[] = [
  { id: 'month', icon: CalendarBlank },
  { id: 'year', icon: ChartBar },
  { id: 'subs', icon: ArrowsClockwise },
  { id: 'goals', icon: Target },
  { id: 'categories', icon: Tag },
  { id: 'settings', icon: GearSix },
]

const readPage = (): Page => {
  const h = location.hash.slice(1) as Page
  return NAV.some((n) => n.id === h) ? h : 'month'
}

function usePage() {
  const [page, setPage] = useState(readPage)
  useEffect(() => {
    const on = () => setPage(readPage())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return [page, (p: Page) => (location.hash = p)] as const
}

function useTheme(theme: Theme | undefined) {
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme !== 'light' && mq.matches))
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

export default function App() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const [synced, setSynced] = useState(false)
  useEffect(() => {
    if (!isLoaded) return
    setSynced(false)
    // A signed-out device keeps none of the account's data. Failures surface through main.tsx's rejection handler.
    if (!isSignedIn) return void clearLocal()
    setToken(() => getToken())
    // Offline: the mirror from the last session still shows, read-only.
    start().finally(() => setSynced(true))
  }, [isLoaded, isSignedIn, getToken])

  if (!isLoaded || (isSignedIn && !synced)) return null
  // Back from Google/GitHub: Clerk finishes the sign-in here, then reloads the app signed in.
  if (!isSignedIn && location.hash.startsWith('#/sso-callback')) return <AuthenticateWithRedirectCallback />
  return isSignedIn ? <Main /> : <SignedOut />
}

function SignedOut() {
  const t = dicts[DEFAULT_SETTINGS.lang]
  useTheme('system')
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="grid max-w-sm justify-items-center gap-4 text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-accent text-accent-fg">
          <Drop size={26} weight="fill" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Leak</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t.accountHint}</p>
        <SignInButton mode="modal">
          <Button variant="primary">{t.signIn}</Button>
        </SignInButton>
      </div>
    </div>
  )
}

function Main() {
  const settings = useLiveQuery(async () => (await db.settings.get('app')) ?? DEFAULT_SETTINGS)
  const cats = useLiveQuery(() => db.categories.toArray())
  const [page, go] = usePage()
  const [month, setMonth] = useState(() => monthOf(today()))
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [editing, setEditing] = useState<Tx | 'new' | null>(null)
  useTheme(settings?.theme)
  // Charge subscriptions on start. On focus, first fetch what other devices changed meanwhile,
  // then charge in case the app stayed open into a new month.
  useEffect(() => {
    syncSubs()
    // Offline: keep showing the mirror quietly; an alert here would refocus the window and loop.
    const refresh = () => pull().then(syncSubs).catch(console.error)
    addEventListener('focus', refresh)
    return () => removeEventListener('focus', refresh)
  }, [])
  useEffect(() => {
    if (!settings) return
    document.documentElement.lang = settings.lang
    document.documentElement.toggleAttribute('data-colorblind', !!settings.colorblind)
  }, [settings])

  const ctx = useMemo<AppCtx | null>(() => {
    if (!settings || !cats) return null
    const t = dicts[settings.lang]
    return {
      s: settings,
      t,
      cats,
      cat: new Map(cats.map((c) => [c.id, c])),
      money: (minor, compact) => formatMoney(minor, settings.currency, t.locale, compact),
    }
  }, [settings, cats])

  if (!ctx) return null
  const { t } = ctx

  const add = () => setEditing('new')
  const openMonth = (m: string) => {
    setMonth(m)
    go('month')
  }
  // New entries default to today when viewing the current month, else the 1st of the viewed month.
  const defaultDate = monthOf(today()) === month ? today() : `${month}-01`

  return (
    <Ctx.Provider value={ctx}>
      <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
        <aside className="sticky top-0 hidden h-dvh flex-col gap-1 border-r border-zinc-200/80 p-4 md:flex dark:border-zinc-800">
          <div className="mb-6 flex items-center gap-2 px-2 pt-1">
            <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-fg">
              <Drop size={18} weight="fill" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Leak</span>
          </div>
          <nav className="grid gap-1">
            {NAV.map(({ id, icon: I }) => (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                aria-current={page === id ? 'page' : undefined}
                className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-accent ${
                  page === id
                    ? 'bg-zinc-900/[0.06] text-zinc-900 dark:bg-white/10 dark:text-white'
                    : 'text-zinc-600 hover:bg-zinc-900/[0.04] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100'
                }`}
              >
                <I size={18} weight={page === id ? 'fill' : 'regular'} />
                {t.nav[id]}
              </button>
            ))}
          </nav>
          <Button variant="primary" className="mt-auto" onClick={add}>
            <Plus size={16} weight="bold" />
            {t.addTx}
          </Button>
        </aside>

        <main className="px-4 pt-6 pb-32 sm:px-6 md:px-8 md:pt-8 md:pb-12">
          <div className="mx-auto max-w-6xl">
            {page === 'month' && <MonthPage month={month} setMonth={setMonth} onAdd={add} onEdit={setEditing} />}
            {page === 'year' && <YearPage year={year} setYear={setYear} openMonth={openMonth} />}
            {page === 'subs' && <SubsPage />}
            {page === 'goals' && <GoalsPage />}
            {page === 'categories' && <CategoriesPage />}
            {page === 'settings' && <SettingsPage />}
          </div>
        </main>
      </div>

      {/* Mobile: floating add button + bottom tab bar */}
      <button
        type="button"
        onClick={add}
        aria-label={t.addTx}
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] grid size-14 place-items-center rounded-full bg-accent text-accent-fg shadow-lg shadow-zinc-900/25 transition active:scale-95 md:hidden"
      >
        <Plus size={24} weight="bold" />
      </button>
      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-6 border-t border-zinc-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden dark:border-zinc-800 dark:bg-zinc-950/90">
        {NAV.map(({ id, icon: I }) => (
          <button
            key={id}
            type="button"
            onClick={() => go(id)}
            aria-current={page === id ? 'page' : undefined}
            className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              page === id ? 'text-accent' : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            <I size={22} weight={page === id ? 'fill' : 'regular'} />
            <span className="max-w-full truncate px-1">{t.nav[id]}</span>
          </button>
        ))}
      </nav>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? t.addTx : t.editTx}>
        {editing && <TxForm tx={editing === 'new' ? undefined : editing} defaultDate={defaultDate} onDone={() => setEditing(null)} />}
      </Sheet>
      <Updater />
    </Ctx.Provider>
  )
}
