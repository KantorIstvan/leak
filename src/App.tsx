import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarBlank, ChartBar, Drop, GearSix, Plus, Tag, Target, type Icon } from '@phosphor-icons/react'
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

type Page = 'month' | 'year' | 'goals' | 'categories' | 'settings'
const NAV: { id: Page; icon: Icon }[] = [
  { id: 'month', icon: CalendarBlank },
  { id: 'year', icon: ChartBar },
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
  const settings = useLiveQuery(async () => (await db.settings.get('app')) ?? DEFAULT_SETTINGS)
  const cats = useLiveQuery(() => db.categories.toArray())
  const [page, go] = usePage()
  const [month, setMonth] = useState(() => monthOf(today()))
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [editing, setEditing] = useState<Tx | 'new' | null>(null)
  useTheme(settings?.theme)
  useEffect(() => {
    if (settings) document.documentElement.lang = settings.lang
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
      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-zinc-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden dark:border-zinc-800 dark:bg-zinc-950/90">
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
    </Ctx.Provider>
  )
}
