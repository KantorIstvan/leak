import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { useClerk, useUser } from '@clerk/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CaretUpDown, Check, CloudCheck, DownloadSimple, MagnifyingGlass, SignOut, UploadSimple, UserGear } from '@phosphor-icons/react'
import { add, replaceAll, saveSettings, wipeAll } from '../cloud'
import { decodeCsv, missing, readCsv, sameName, toCsv, type Row } from '../csv'
import { BUCKETS, DATA_COLORS, db, exportBackup, rekey, type Backup, type Bucket, type DataColor, type Kind } from '../db'
import { currencySymbol, monthOf, today } from '../lib'
import { BUCKET_BG, Button, Card, ConfirmButton, PageHeader, Segmented, Select, Switch, triggerCls, useApp, useMonthlyIncome } from '../ui'
import { desktop } from '../clerk'
import { ColorPicker, SWATCHES } from './Categories'

// Every ISO 4217 currency the runtime knows about.
const CURRENCIES = Intl.supportedValuesOf('currency')

const update = saveSettings

export function SettingsPage() {
  const { t, s } = useApp()

  return (
    <>
      <PageHeader title={t.nav.settings} />
      <div className="grid max-w-3xl gap-10">
        <AccountCard />

        <Card title={t.general}>
          <div className="grid gap-6">
            <div className="grid gap-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.language}</span>
              <Segmented
                label={t.language}
                value={s.lang}
                onChange={(lang) => update({ lang })}
                options={[
                  { value: 'hu', label: 'Magyar' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.theme}</span>
              <Segmented
                label={t.theme}
                value={s.theme}
                onChange={(theme) => update({ theme })}
                options={(['system', 'light', 'dark'] as const).map((v) => ({ value: v, label: t.themes[v] }))}
              />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.clock}</span>
              <Segmented
                label={t.clock}
                value={s.clock ?? '24'}
                onChange={(clock) => update({ clock })}
                options={(['24', '12'] as const).map((v) => ({ value: v, label: t.clocks[v] }))}
              />
            </div>
            <div className="max-w-sm">
              <CurrencyPicker />
            </div>
          </div>
        </Card>

        <ColorsCard />
        <Ratios />
        <CsvCard />
        <DataCard />
      </div>
    </>
  )
}

/** Re-renders when <html>'s attributes change: light/dark, the colour-blind palette and picked colours all live there. */
function useRootAttributes() {
  const [, tick] = useState(0)
  useEffect(() => {
    const mo = new MutationObserver(() => tick((n) => n + 1))
    mo.observe(document.documentElement, { attributes: true })
    return () => mo.disconnect()
  }, [])
}

/** The data colours, each with the system colour picker, over whatever light/dark and colour-blind mode would show. */
function ColorsCard() {
  const { t, s } = useApp()
  useRootAttributes()
  const css = getComputedStyle(document.documentElement)
  return (
    <Card
      title={t.colors}
      hint={t.colorsHint}
      action={
        s.colors && !s.colorblind && (
          <Button variant="ghost" className="h-8 px-3" onClick={() => update({ colors: null })}>
            {t.resetColors}
          </Button>
        )
      }
    >
      <div className="grid">
        {DATA_COLORS.map((k) => (
          <ColorRow key={k} k={k} value={css.getPropertyValue(`--color-${k}`).trim()} />
        ))}
      </div>
      <div className="mt-6">
        <Switch checked={!!s.colorblind} onChange={(colorblind) => update({ colorblind })} label={t.colorblind} hint={t.colorblindHint} />
      </div>
    </Card>
  )
}

function ColorRow({ k, value }: { k: DataColor; value: string }) {
  const { t, s } = useApp()
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const picked = s.colors?.[k]
  const locked = !!s.colorblind // its palette is checked as a whole (palette.test.ts); a picked colour could break it
  // The picker reports every step of a drag: each previews at once (inline on <html>, where App puts saved colours),
  // the save waits until the dragging pauses.
  const change = (hex: string) => {
    document.documentElement.style.setProperty(`--color-${k}`, hex)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // A save that fails (offline, column missing) must not leave the preview looking like it stuck.
      update({ colors: { ...s.colors, [k]: hex } }).catch((e) => {
        const saved = s.colors?.[k]
        if (saved) document.documentElement.style.setProperty(`--color-${k}`, saved)
        else document.documentElement.style.removeProperty(`--color-${k}`)
        throw e // on to main.tsx's "Could not save" alert
      })
    }, 400)
  }
  const reset = () => {
    const { [k]: _, ...rest } = s.colors ?? {}
    return update({ colors: Object.keys(rest).length ? rest : null })
  }
  return (
    <div className="border-b border-line">
      <div className="flex h-12 items-center gap-3">
        <button
          type="button"
          aria-expanded={open && !locked}
          disabled={locked}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-3 self-stretch text-left focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="size-7 shrink-0 ring-1 ring-ink" style={{ background: value }} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm">{t.colorNames[k]}</span>
        </button>
        {picked && !locked && (
          <Button variant="ghost" className="h-8 px-2" onClick={reset}>
            {t.resetColor}
          </Button>
        )}
      </div>
      {open && !locked && (
        <div className="anim-pop pb-4">
          <ColorPicker value={value} onChange={change} preview={null} />
        </div>
      )}
    </div>
  )
}

/** Profile row as settings pages usually show it: avatar, name and email, with account actions on the side. */
function AccountCard() {
  const { t } = useApp()
  const { user } = useUser()
  const clerk = useClerk()
  if (!user) return null
  const email = user.primaryEmailAddress?.emailAddress
  const name = user.fullName || user.username || email
  return (
    <Card title={t.account}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-4">
        <img src={user.imageUrl} alt="" className="size-14 shrink-0 rounded-full object-cover ring-1 ring-zinc-900/10 dark:ring-white/10" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-xl leading-tight">{name}</div>
          {email && email !== name && <div className="truncate text-sm text-zinc-600 dark:text-zinc-400">{email}</div>}
          <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <CloudCheck size={14} weight="bold" aria-hidden />
            {t.synced}
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button className="flex-1 sm:flex-none" onClick={() => clerk.openUserProfile()}>
            <UserGear size={16} />
            {t.manageAccount}
          </Button>
          <Button variant="ghost" className="flex-1 sm:flex-none" onClick={() => clerk.signOut()}>
            <SignOut size={16} />
            {t.signOut}
          </Button>
        </div>
      </div>
    </Card>
  )
}

const POPULAR = ['HUF', 'EUR', 'USD', 'GBP', 'CHF']
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Searchable currency combobox: matches code, symbol and the name in both the UI language and English. */
function CurrencyPicker() {
  const { t, s } = useApp()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const all = useMemo(() => {
    const local = new Intl.DisplayNames([t.locale], { type: 'currency' })
    const en = new Intl.DisplayNames(['en'], { type: 'currency' })
    return CURRENCIES.map((code) => {
      const name = local.of(code) ?? code
      const sym = currencySymbol(code, t.locale)
      return { code, name, sym: sym === code ? '' : sym, hay: fold(`${code} ${name} ${en.of(code)} ${sym}`) }
    }).sort((a, b) => a.name.localeCompare(b.name, t.locale))
  }, [t.locale])

  const needle = fold(q.trim())
  const list = needle
    ? all.filter((c) => c.hay.includes(needle))
    : [...POPULAR.map((p) => all.find((c) => c.code === p)!).filter(Boolean), ...all.filter((c) => !POPULAR.includes(c.code))]
  const current = all.find((c) => c.code === s.currency)

  useEffect(() => {
    if (!open) return
    const onDown = (e: globalThis.PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (code: string) => {
    update({ currency: code })
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={box} className="relative grid gap-2">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.currency}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          setActive(0)
        }}
        className={`${triggerCls} h-11 w-full gap-3 text-base sm:text-sm`}
      >
        <span className="num w-10 shrink-0 font-semibold">{s.currency}</span>
        <span className="flex-1 truncate text-zinc-600 dark:text-zinc-400">{current?.name}</span>
        <CaretUpDown size={16} className="shrink-0 text-zinc-500" />
      </button>
      <span className="text-xs text-zinc-600 dark:text-zinc-400">{t.currencyHint}</span>

      {open && (
        <div className="absolute inset-x-0 top-[4.75rem] z-20 overflow-hidden bg-panel shadow-[6px_6px_0] ring-1 shadow-ink/10 ring-ink dark:shadow-black/50">
          <div className="relative border-b border-zinc-100 dark:border-zinc-800">
            <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" aria-hidden />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls="currency-list"
              aria-activedescendant={list[active] ? `cur-${list[active].code}` : undefined}
              placeholder={t.currencySearch}
              className="h-11 w-full bg-transparent pr-3 pl-9 text-base outline-none placeholder:text-zinc-500 sm:text-sm"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setActive(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') setActive(Math.min(active + 1, list.length - 1))
                else if (e.key === 'ArrowUp') setActive(Math.max(active - 1, 0))
                else if (e.key === 'Enter' && list[active]) choose(list[active].code)
                else if (e.key === 'Escape') setOpen(false)
                else return
                e.preventDefault()
              }}
            />
          </div>
          <ul ref={listRef} id="currency-list" role="listbox" className="max-h-72 overflow-y-auto p-1">
            {list.map((c, i) => (
              <li
                key={c.code}
                id={`cur-${c.code}`}
                role="option"
                aria-selected={c.code === s.currency}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(c.code)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm ${i === active ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
              >
                <span className="num w-10 shrink-0 font-semibold">{c.code}</span>
                <span className="flex-1 truncate">{c.name}</span>
                {c.sym && <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{c.sym}</span>}
                {c.code === s.currency && <Check size={16} weight="bold" className="shrink-0" />}
              </li>
            ))}
            {!list.length && <li className="p-4 text-center text-sm text-zinc-600 dark:text-zinc-400">{t.noMatch}</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

const PRESETS: Record<Bucket, number>[] = [
  { needs: 50, wants: 30, investments: 20 },
  { needs: 60, wants: 20, investments: 20 },
  { needs: 70, wants: 20, investments: 10 },
  { needs: 40, wants: 30, investments: 30 },
]

const split = (a: number, b: number): Record<Bucket, number> => ({ needs: a, wants: b - a, investments: 100 - b })
const same = (x: Record<Bucket, number>, y: Record<Bucket, number>) => BUCKETS.every((b) => x[b] === y[b])

/** One bar split into the three buckets by two draggable cuts, so the parts always add up to 100. */
function Ratios() {
  const { t, s, money } = useApp()
  const income = useMonthlyIncome()
  const [r, setR] = useState(s.ratios)
  const track = useRef<HTMLDivElement>(null)
  // Which cut is being dragged; 'tie' when both sit on the same spot until the drag direction decides.
  const drag = useRef<0 | 1 | 'tie' | null>(null)
  const [held, setHeld] = useState<0 | 1 | 'tie' | null>(null) // drag, as state for styling
  // Presets and arrow keys glide into place; a drag follows the pointer with no lag.
  const ease = held === null ? 'motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]' : ''
  const cuts = [r.needs, r.needs + r.wants]

  const save = (next: Record<Bucket, number>) => {
    setR(next)
    update({ ratios: next })
  }
  const moveCut = (i: 0 | 1, pos: number) => {
    const p = Math.max(0, Math.min(100, Math.round(pos)))
    return i === 0 ? split(Math.min(p, cuts[1]), cuts[1]) : split(cuts[0], Math.max(p, cuts[0]))
  }
  const posOf = (e: PointerEvent<HTMLElement>) => {
    const box = track.current!.getBoundingClientRect()
    return ((e.clientX - box.left) / box.width) * 100
  }

  function onDown(e: PointerEvent<HTMLDivElement>) {
    const p = posOf(e)
    drag.current = cuts[0] === cuts[1] ? 'tie' : Math.abs(p - cuts[0]) <= Math.abs(p - cuts[1]) ? 0 : 1
    e.currentTarget.setPointerCapture(e.pointerId)
    setHeld(drag.current)
    if (drag.current !== 'tie') setR(moveCut(drag.current, p))
  }
  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (drag.current === null) return
    const p = posOf(e)
    if (drag.current === 'tie') {
      if (Math.round(p) === cuts[0]) return
      drag.current = p < cuts[0] ? 0 : 1
      setHeld(drag.current)
    }
    setR(moveCut(drag.current, p))
  }
  function onUp() {
    if (drag.current === null) return
    drag.current = null
    setHeld(null)
    if (!same(r, s.ratios)) update({ ratios: r })
  }
  function onKey(i: 0 | 1, e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10, Home: -100, End: 100 }[e.key]
    if (!step) return
    e.preventDefault()
    save(moveCut(i, cuts[i] + step))
  }

  return (
    <Card title={t.ratios} hint={t.ratiosHint}>
      <div
        ref={track}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative my-2 h-14 cursor-ew-resize touch-none select-none"
      >
        <div className="flex h-full overflow-hidden rounded-xl">
          {BUCKETS.filter((b) => r[b] > 0).map((b) => (
            <div
              key={b}
              className={`grid min-w-0 place-items-center text-sm font-semibold text-white dark:text-zinc-950 ${held === null ? 'motion-safe:transition-[flex-grow]' : ''} ${ease} ${BUCKET_BG[b]}`}
              style={{ flex: `${r[b]} 1 0` }}
            >
              {r[b] >= 10 && <span className="num drop-shadow-sm dark:drop-shadow-none">{r[b]}%</span>}
            </div>
          ))}
        </div>
        {([0, 1] as const).map((i) => (
          <div
            key={i}
            role="slider"
            tabIndex={0}
            aria-label={t.ratioCut(t.bucket[BUCKETS[i]], t.bucket[BUCKETS[i + 1]])}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={cuts[i]}
            aria-valuetext={BUCKETS.map((b) => `${t.bucket[b]} ${r[b]}%`).join(', ')}
            onKeyDown={(e) => onKey(i, e)}
            className={`group absolute inset-y-0 w-8 -translate-x-1/2 cursor-ew-resize outline-none ${held === null ? 'motion-safe:transition-[left]' : ''} ${ease}`}
            style={{ left: `${cuts[i]}%` }}
          >
            {/* The cut itself: a seam in the card colour that opens up a little on hover and while held. */}
            <span
              aria-hidden
              className={`absolute inset-y-0 left-1/2 -translate-x-1/2 bg-[var(--card)] transition-[width] duration-200 group-hover:w-1.5 ${held === i ? 'w-1.5' : 'w-[3px]'}`}
            />
            {/* The knob shows the two buckets it divides. */}
            <span
              aria-hidden
              className={`absolute top-1/2 left-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[var(--card)] shadow-lg ring-1 shadow-zinc-950/25 ring-zinc-900/10 transition-transform duration-200 ease-out group-focus-visible:ring-2 group-focus-visible:ring-accent dark:shadow-black/50 dark:ring-white/10 ${
                held === i ? 'scale-90' : 'group-hover:scale-115'
              }`}
            >
              <span className="size-3 rounded-full" style={{ background: `linear-gradient(90deg, var(--color-${BUCKETS[i]}) 50%, var(--color-${BUCKETS[i + 1]}) 50%)` }} />
            </span>
          </div>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-x-6 gap-y-3">
        {BUCKETS.map((b) => (
          <div key={b} className="min-w-0">
            <dt className="flex items-center gap-2 truncate text-sm text-zinc-600 dark:text-zinc-400">
              <span className={`size-2.5 shrink-0 rounded-sm ${BUCKET_BG[b]}`} aria-hidden />
              {t.bucket[b]}
            </dt>
            <dd className="num mt-1 font-display tracking-[-0.02em] text-3xl leading-tight">{r[b]}%</dd>
            {income > 0 && <dd className="num text-xs text-zinc-600 dark:text-zinc-400">{t.perMonthApprox(money(Math.round((income * r[b]) / 10000) * 100))}</dd>}
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <span className="mr-1 text-sm text-zinc-600 dark:text-zinc-400">{t.presets}</span>
        {PRESETS.map((p) => {
          const on = same(p, r)
          return (
            <button
              key={BUCKETS.map((b) => p[b]).join('-')}
              type="button"
              aria-pressed={on}
              onClick={() => save(p)}
              className={`num h-8 px-3 text-sm font-medium ring-1 ring-ink ring-inset transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent ${
                on
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              {BUCKETS.map((b) => p[b]).join(' / ')}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

/** Saves a text file: a Save As dialog on desktop (the webview ignores <a download>), a download in the browser. */
async function save(text: string, name: string, type: string) {
  if (desktop) {
    const { save: pick } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    const ext = name.split('.').pop()!
    const path = await pick({ defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] })
    if (path) await writeTextFile(path, text)
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href)) // revoking in the same tick can cancel the download
}

const fileCls =
  'inline-flex h-10 cursor-pointer items-center gap-2 px-4 text-[13px] font-medium tracking-[0.08em] text-zinc-900 uppercase ring-1 ring-ink ring-inset transition focus-within:outline-2 focus-within:outline-accent hover:bg-ink/5 dark:text-zinc-100'

/** Year + month pickers for a "YYYY-MM" value. */
function MonthPick({ label, value, years, onChange }: { label: string; value: string; years: string[]; onChange: (m: string) => void }) {
  const { t } = useApp()
  const [y, m] = value.split('-')
  const name = new Intl.DateTimeFormat(t.locale, { month: 'long' })
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <div className="flex gap-2">
        <Select label={label} value={y} onChange={(v) => onChange(`${v}-${m}`)} options={years.map((v) => ({ value: v, label: v }))} />
        <Select
          label={label}
          value={m}
          onChange={(v) => onChange(`${y}-${v}`)}
          options={Array.from({ length: 12 }, (_, i) => {
            const v = String(i + 1).padStart(2, '0')
            return { value: v, label: name.format(new Date(2000, i, 1)) }
          })}
        />
      </div>
    </div>
  )
}

interface CsvPlan {
  rows: Row[]
  skip: number
  bad: number[]
  newCats: { name: string; kind: Kind }[]
}

/** Transactions out to and in from a spreadsheet. Import only adds what is missing (see csv.ts). */
function CsvCard() {
  const { t, s, cat, cats } = useApp()
  // The oldest date straight from the index: reading every transaction for it took ~30 ms per 10 000.
  const oldest = useLiveQuery(async () => (await db.txs.orderBy('date').first())?.date)
  const now = monthOf(today())
  const first = monthOf(oldest && oldest < `${now}-01` ? oldest : `${now}-01`)
  const [range, setRange] = useState<[string, string] | null>(null)
  const [from, to] = range ?? [first, now]
  const firstYear = Number(first.slice(0, 4))
  const years = Array.from({ length: Number(now.slice(0, 4)) - firstYear + 1 }, (_, i) => String(firstYear + i))
  const [plan, setPlan] = useState<CsvPlan | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const name = (id: string) => cat.get(id)?.name ?? t.uncategorized
  const findCat = <C extends { name: string; kind: Kind }>(list: C[], r: Row) => list.find((c) => c.kind === r.kind && sameName(c.name, r.category))

  async function exportCsv() {
    const [a, b] = from <= to ? [from, to] : [to, from]
    const list = await db.txs.where('date').between(`${a}-01`, `${b}-31`, true, true).toArray()
    await save(toCsv(list, name), `leak-${a}_${b}.csv`, 'text/csv')
  }

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMsg(null)
    const parsed = readCsv(decodeCsv(await file.arrayBuffer(), s.lang), t.uncategorized)
    if (!parsed) return setMsg({ ok: false, text: t.csvInvalid })
    const rows = missing(parsed.rows, await db.txs.toArray(), name)
    const newCats: CsvPlan['newCats'] = []
    for (const r of rows) if (!findCat(cats, r) && !findCat(newCats, r)) newCats.push({ name: r.category, kind: r.kind })
    setPlan({ rows, skip: parsed.rows.length - rows.length, bad: parsed.bad, newCats })
  }

  async function confirmImport() {
    const p = plan!
    try {
      const made = await add(
        'categories',
        p.newCats.map((c, i) => ({
          ...c,
          bucket: 'needs' as Bucket,
          ...(c.name === t.uncategorized ? { color: '#a1a1aa', icon: 'DotsThree' } : { color: SWATCHES[i % SWATCHES.length], icon: 'Tag' }),
        })),
      )
      const all = [...cats, ...made]
      await add(
        'txs',
        p.rows.map((r) => {
          const c = findCat(all, r)!
          return { date: r.date, kind: r.kind, amount: r.amount, categoryId: c.id, bucket: r.kind === 'income' ? null : (r.bucket ?? c.bucket), note: r.note }
        }),
      )
      setMsg({ ok: true, text: t.csvAdded(p.rows.length) })
    } catch (e) {
      // Some batches may be in already: this plan would add those twice, picking the file again only adds the rest.
      console.error(e)
      setMsg({ ok: false, text: t.csvFailed })
    }
    setPlan(null)
  }

  return (
    <Card title={t.csvTitle} hint={t.csvHint}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <MonthPick label={t.from} value={from} years={years} onChange={(m) => setRange([m, to])} />
          <MonthPick label={t.to} value={to} years={years} onChange={(m) => setRange([from, m])} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportCsv}>
            <DownloadSimple size={16} />
            {t.exportCsv}
          </Button>
          <label className={fileCls}>
            <UploadSimple size={16} />
            {t.importCsv}
            <input type="file" accept="text/csv,.csv" className="sr-only" onChange={pick} />
          </label>
        </div>
      </div>

      {plan && (
        <div className="anim-pop mt-4 grid gap-3 rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-800/70">
          <p>{plan.rows.length ? t.csvPreview(plan.rows.length, plan.skip, plan.newCats.length) : t.csvNothing}</p>
          {plan.bad.length > 0 && (
            <p className="text-rose-700 dark:text-rose-400">{t.csvBad(plan.bad.slice(0, 10).join(', ') + (plan.bad.length > 10 ? '…' : ''))}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPlan(null)}>
              {t.cancel}
            </Button>
            {plan.rows.length > 0 && (
              <Button variant="primary" onClick={confirmImport}>
                {t.importCsv}
              </Button>
            )}
          </div>
        </div>
      )}
      {msg && <p className={`anim-fade mt-3 text-sm ${msg.ok ? 'text-zinc-700 dark:text-zinc-300' : 'font-medium text-rose-700 dark:text-rose-400'}`}>{msg.text}</p>}
    </Card>
  )
}

function DataCard() {
  const { t } = useApp()
  const [pending, setPending] = useState<Backup | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function download() {
    await save(JSON.stringify(await exportBackup(), null, 2), `leak-backup-${today()}.json`, 'application/json')
  }

  // Checked on pick, so a broken file is turned away before the "replaces everything" question.
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setPending(rekey(JSON.parse(await file.text())))
      setMsg(null)
    } catch {
      setPending(null)
      setMsg({ ok: false, text: t.importFailed })
    }
  }

  async function confirmImport() {
    try {
      await replaceAll(pending!)
      setMsg({ ok: true, text: t.imported })
    } catch (e) {
      console.error(e)
      setMsg({ ok: false, text: t.importNetworkFailed })
    }
    setPending(null)
  }

  return (
    <Card title={t.data} hint={t.dataHint}>
      <div className="flex flex-wrap gap-2">
        <Button onClick={download}>
          <DownloadSimple size={16} />
          {t.exportBackup}
        </Button>
        <label className={fileCls}>
          <UploadSimple size={16} />
          {t.importBackup}
          <input type="file" accept="application/json,.json" className="sr-only" onChange={pick} />
        </label>
      </div>

      {pending !== null && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          <span className="flex-1">{t.importConfirm}</span>
          <Button variant="ghost" onClick={() => setPending(null)}>
            {t.cancel}
          </Button>
          <Button variant="primary" onClick={confirmImport}>
            {t.importBackup}
          </Button>
        </div>
      )}
      {msg && <p className={`mt-3 text-sm ${msg.ok ? 'text-zinc-700 dark:text-zinc-300' : 'font-medium text-rose-700 dark:text-rose-400'}`}>{msg.text}</p>}

      <div className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800">
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">{t.wipeConfirm}</p>
        <ConfirmButton label={t.wipe} onConfirm={wipeAll} />
      </div>
    </Card>
  )
}
