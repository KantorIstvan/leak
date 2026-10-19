import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { UserButton } from '@clerk/react'
import { CaretUpDown, Check, DownloadSimple, MagnifyingGlass, UploadSimple } from '@phosphor-icons/react'
import { replaceAll, saveSettings, wipeAll } from '../cloud'
import { BUCKETS, exportBackup, rekey, type Bucket } from '../db'
import { currencySymbol, today } from '../lib'
import { BUCKET_BG, Button, Card, ConfirmButton, PageHeader, Segmented, Switch, useApp, useMonthlyIncome } from '../ui'

// Every ISO 4217 currency the runtime knows about.
const CURRENCIES = Intl.supportedValuesOf('currency')

const update = saveSettings

export function SettingsPage() {
  const { t, s } = useApp()

  return (
    <>
      <PageHeader title={t.nav.settings} />
      <div className="grid max-w-3xl gap-4">
        <Card title={t.account} hint={t.accountHint}>
          <UserButton showName />
        </Card>

        <Card>
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
            <Switch checked={!!s.colorblind} onChange={(colorblind) => update({ colorblind })} label={t.colorblind} hint={t.colorblindHint} />
            <div className="max-w-sm">
              <CurrencyPicker />
            </div>
          </div>
        </Card>

        <Ratios />
        <DataCard />
      </div>
    </>
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
        className="flex h-11 items-center gap-3 rounded-lg bg-white px-3 text-left text-base ring-1 ring-zinc-300 transition hover:ring-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-sm dark:bg-zinc-950 dark:ring-zinc-700 dark:hover:ring-zinc-500"
      >
        <span className="num w-10 shrink-0 font-semibold">{s.currency}</span>
        <span className="flex-1 truncate text-zinc-600 dark:text-zinc-400">{current?.name}</span>
        <CaretUpDown size={16} className="shrink-0 text-zinc-500" />
      </button>
      <span className="text-xs text-zinc-600 dark:text-zinc-400">{t.currencyHint}</span>

      {open && (
        <div className="absolute inset-x-0 top-[4.75rem] z-20 overflow-hidden rounded-xl bg-white shadow-xl ring-1 shadow-zinc-900/10 ring-zinc-200 dark:bg-zinc-900 dark:shadow-black/40 dark:ring-zinc-700">
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
    if (drag.current !== 'tie') setR(moveCut(drag.current, p))
  }
  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (drag.current === null) return
    const p = posOf(e)
    if (drag.current === 'tie') {
      if (Math.round(p) === cuts[0]) return
      drag.current = p < cuts[0] ? 0 : 1
    }
    setR(moveCut(drag.current, p))
  }
  function onUp() {
    if (drag.current === null) return
    drag.current = null
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
        <div className="flex h-full gap-0.5 overflow-hidden rounded-xl">
          {BUCKETS.filter((b) => r[b] > 0).map((b) => (
            <div key={b} className={`grid min-w-0 place-items-center text-sm font-semibold text-white dark:text-zinc-950 ${BUCKET_BG[b]}`} style={{ flex: `${r[b]} 1 0` }}>
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
            className="absolute top-1/2 grid h-16 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white shadow-md ring-1 shadow-zinc-900/20 ring-zinc-300 transition-shadow hover:ring-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:bg-zinc-100 dark:ring-zinc-500"
            style={{ left: `${cuts[i]}%` }}
          >
            <span className="flex gap-0.5" aria-hidden>
              <span className="h-5 w-px bg-zinc-400" />
              <span className="h-5 w-px bg-zinc-400" />
            </span>
          </div>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3">
        {BUCKETS.map((b) => (
          <div key={b} className="min-w-0">
            <dt className="flex items-center gap-2 truncate text-sm text-zinc-600 dark:text-zinc-400">
              <span className={`size-2.5 shrink-0 rounded-sm ${BUCKET_BG[b]}`} aria-hidden />
              {t.bucket[b]}
            </dt>
            <dd className="num mt-1 text-2xl font-semibold tracking-tight">{r[b]}%</dd>
            {income > 0 && <dd className="num truncate text-xs text-zinc-600 dark:text-zinc-400">{t.perMonthApprox(money(Math.round((income * r[b]) / 10000) * 100))}</dd>}
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
              className={`num h-8 rounded-full px-3 text-sm font-medium transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent ${
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

function DataCard() {
  const { t } = useApp()
  const [pending, setPending] = useState<unknown>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function download() {
    const blob = new Blob([JSON.stringify(await exportBackup(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `leak-backup-${today()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setPending(JSON.parse(await file.text()))
      setMsg(null)
    } catch {
      setMsg({ ok: false, text: t.importFailed })
    }
  }

  async function confirmImport() {
    try {
      await replaceAll(rekey(pending))
      setMsg({ ok: true, text: t.imported })
    } catch {
      setMsg({ ok: false, text: t.importFailed })
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
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-zinc-800 ring-1 ring-zinc-200 transition focus-within:outline-2 focus-within:outline-accent hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800">
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
