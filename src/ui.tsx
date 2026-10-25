import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { CalendarBlank, CaretDown, CaretLeft, CaretRight, CaretUpDown, Check, MagnifyingGlass, X } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { db, type Bucket, type Category, type Kind, type Settings } from './db'
import type { Dict } from './i18n'
import { ICONS } from './icons'
import { avgMonthlyIncome, currencySymbol, groupAmount, monthOf, shiftMonth, tint, today, type Tier } from './lib'

// Shape rules: square corners everywhere (index.css zeroes the radius scale); rounded-full only for dots and switches.

// --- App context ----------------------------------------------------------

export interface AppCtx {
  s: Settings
  t: Dict
  money: (minor: number, compact?: boolean) => string
  cats: Category[]
  cat: Map<string, Category>
}

export const Ctx = createContext<AppCtx>(null!)
export const useApp = () => useContext(Ctx)

export const BUCKET_BG: Record<Bucket, string> = { needs: 'bg-needs', wants: 'bg-wants', investments: 'bg-investments' }
/** Score tier colours (monthScore); always next to the number or tier name, so colour is never the only cue. */
export const TIER_TEXT: Record<Tier, string> = {
  healthy: 'text-emerald-700 dark:text-emerald-400',
  coping: 'text-amber-700 dark:text-amber-400',
  vulnerable: 'text-rose-700 dark:text-rose-400',
}

// --- Primitives -----------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-strong',
  secondary: 'text-zinc-900 ring-1 ring-ink ring-inset hover:bg-ink/5 dark:text-zinc-100',
  ghost: 'text-zinc-600 hover:bg-ink/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
  danger: 'text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 dark:text-rose-300 dark:ring-rose-900 dark:hover:bg-rose-950',
}

/**
 * Runs a handler unless the promise of the last one is still pending, and reports that as `busy`.
 * The ref, not the state, guards: a second click can land before React re-renders. A failure still reaches main.tsx's alert.
 */
function useBusy() {
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const run = (handler: () => unknown) => {
    if (running.current) return
    const result = handler()
    if (!(result instanceof Promise)) return
    running.current = true
    setBusy(true)
    result.finally(() => {
      running.current = false
      setBusy(false)
    })
  }
  return [busy, run] as const
}

/** An async onClick disables the button until it settles, so a double click cannot save twice. */
export function Button({
  variant = 'secondary',
  className = '',
  onClick,
  disabled,
  ...p
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { variant?: Variant; onClick?: (e: MouseEvent<HTMLButtonElement>) => unknown }) {
  const [busy, run] = useBusy()
  return (
    <button
      type="button"
      className={`inline-flex h-10 items-center justify-center gap-2 px-4 text-[13px] font-medium tracking-[0.08em] whitespace-nowrap uppercase transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${VARIANTS[variant]} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={(e) => run(() => onClick?.(e))}
      {...p}
    />
  )
}

/** A form whose async submit runs one at a time: while it saves, every field and button in it is disabled. */
export function Form({ onSubmit, children }: { onSubmit: () => unknown; children: ReactNode }) {
  const [busy, run] = useBusy()
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation() // a form in a sheet opened from another form (portaled out) still bubbles into it in React
        run(onSubmit)
      }}
    >
      <fieldset disabled={busy} className="grid min-w-0 gap-5">
        {children}
      </fieldset>
    </form>
  )
}

export function IconButton({ label, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tip={label}
      className="grid size-10 place-items-center text-zinc-600 transition hover:bg-ink/5 hover:text-zinc-900 active:scale-95 focus-visible:outline-2 focus-visible:outline-accent dark:text-zinc-400 dark:hover:text-zinc-100"
      {...p}
    >
      {children}
    </button>
  )
}

// --- Popovers -------------------------------------------------------------

/** Open state for a popover anchored in `ref`: closes on outside pointer-down and on Esc (without closing a surrounding dialog). */
export function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !open) return
    e.preventDefault()
    e.stopPropagation()
    setOpen(false)
  }
  return { open, setOpen, ref, onKeyDown }
}

export const popCls =
  'anim-pop absolute z-20 mt-2 bg-panel p-1 shadow-[6px_6px_0] ring-1 shadow-ink/10 ring-ink dark:shadow-black/50'

/** Field-looking trigger button shared by the custom pickers. */
export const triggerCls =
  'flex items-center gap-2 border-b border-ink px-3 text-left transition hover:bg-ink/5 focus-visible:bg-ink/5 focus-visible:outline-none'

/** Dropdown with a styled option list instead of the OS <select>. */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  icon,
  align = 'left',
  compact,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  icon?: ReactNode
  align?: 'left' | 'right'
  compact?: boolean // icon only on phones, no underline: sits in a toolbar
}) {
  const p = usePopover()
  return (
    <div ref={p.ref} className="relative" onKeyDown={p.onKeyDown}>
      <button type="button" aria-haspopup="listbox" aria-expanded={p.open} aria-label={label} onClick={() => p.setOpen(!p.open)} className={`${triggerCls} h-10 text-sm ${compact ? 'border-transparent' : ''}`}>
        {icon}
        <span className={`whitespace-nowrap ${compact ? 'max-sm:hidden' : ''}`}>{options.find((o) => o.value === value)?.label}</span>
        <CaretDown size={14} weight="bold" className={`shrink-0 text-zinc-500 transition-transform ${p.open ? 'rotate-180' : ''} ${compact ? 'max-sm:hidden' : ''}`} />
      </button>
      {p.open && (
        <ul role="listbox" aria-label={label} className={`${popCls} w-max min-w-full ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {options.map((o) => {
            const on = o.value === value
            return (
              <li key={o.value} role="option" aria-selected={on}>
                <button
                  type="button"
                  autoFocus={on}
                  onClick={() => {
                    onChange(o.value)
                    p.setOpen(false)
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap transition hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"
                >
                  <span className="flex-1">{o.label}</span>
                  <Check size={14} weight="bold" className={on ? '' : 'invisible'} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Text search with its own clear button (the OS one of type="search" is hidden everywhere). */
export function SearchInput({ value, onChange, placeholder, className = '' }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  const { t } = useApp()
  return (
    <div className="relative">
      <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" aria-hidden />
      <input
        className={`${inputCls} pr-10 pl-9 ${className}`}
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault()
            e.stopPropagation()
            onChange('')
          }
        }}
      />
      {value && (
        <button
          type="button"
          aria-label={t.clear}
          onClick={() => onChange('')}
          className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <X size={14} weight="bold" />
        </button>
      )}
    </div>
  )
}

// Every ISO 4217 currency the runtime knows about.
const CURRENCIES = Intl.supportedValuesOf('currency')
const POPULAR = ['HUF', 'EUR', 'USD', 'GBP', 'CHF']
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Searchable currency combobox: matches code, symbol and the name in both the UI language and English.
 * `compact` shows just the code, to sit next to an amount; the base currency then leads the list.
 */
export function CurrencySelect({ value, onChange, label, hint, compact }: { value: string; onChange: (code: string) => void; label: string; hint?: string; compact?: boolean }) {
  const { t, s } = useApp()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const id = useId()

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
  const top = [...new Set([...(compact ? [s.currency] : []), ...POPULAR])]
  const list = needle
    ? all.filter((c) => c.hay.includes(needle))
    : [...top.map((p) => all.find((c) => c.code === p)!).filter(Boolean), ...all.filter((c) => !top.includes(c.code))]
  const current = all.find((c) => c.code === value)

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
    onChange(code)
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={box} className={`relative grid ${compact ? '' : 'gap-2'}`}>
      {!compact && <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={compact ? `${label}: ${current?.name ?? value}` : undefined}
        onClick={() => {
          setOpen(!open)
          setActive(0)
        }}
        className={`${triggerCls} h-11 ${compact ? 'gap-1.5 text-sm' : 'w-full gap-3 text-base sm:text-sm'}`}
      >
        <span className={`num shrink-0 font-semibold ${compact ? '' : 'w-10'}`}>{value}</span>
        {!compact && <span className="flex-1 truncate text-zinc-600 dark:text-zinc-400">{current?.name}</span>}
        <CaretUpDown size={16} className="shrink-0 text-zinc-500" />
      </button>
      {hint && <span className="text-xs text-zinc-600 dark:text-zinc-400">{hint}</span>}

      {open && (
        <div
          className={`absolute z-20 overflow-hidden bg-panel shadow-[6px_6px_0] ring-1 shadow-ink/10 ring-ink dark:shadow-black/50 ${
            compact ? 'top-full right-0 mt-2 w-72' : 'inset-x-0 top-[4.75rem]'
          }`}
          onKeyDown={(e) => {
            // Esc closes the list, not the dialog the field sits in.
            if (e.key !== 'Escape') return
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
          }}
        >
          <div className="relative border-b border-zinc-100 dark:border-zinc-800">
            <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" aria-hidden />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={`${id}-list`}
              aria-activedescendant={list[active] ? `${id}-${list[active].code}` : undefined}
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
                else return
                e.preventDefault()
              }}
            />
          </div>
          <ul ref={listRef} id={`${id}-list`} role="listbox" className="max-h-72 overflow-y-auto p-1">
            {list.map((c, i) => (
              <li
                key={c.code}
                id={`${id}-${c.code}`}
                role="option"
                aria-selected={c.code === value}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(c.code)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm ${i === active ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
              >
                <span className="num w-10 shrink-0 font-semibold">{c.code}</span>
                <span className="flex-1 truncate">{c.name}</span>
                {c.sym && <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{c.sym}</span>}
                {c.code === value && <Check size={16} weight="bold" className="shrink-0" />}
              </li>
            ))}
            {!list.length && <li className="p-4 text-center text-sm text-zinc-600 dark:text-zinc-400">{t.noMatch}</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Day-of-month field (1-31) with a calendar-like grid popover. */
export function DayOfMonthPicker({ label, value, onChange, format }: { label: string; value: number; onChange: (d: number) => void; format: (d: number) => string }) {
  const p = usePopover()
  return (
    <div ref={p.ref} className="relative grid gap-2" onKeyDown={p.onKeyDown}>
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <button type="button" aria-expanded={p.open} onClick={() => p.setOpen(!p.open)} className={`${triggerCls} h-11 text-base sm:text-sm`}>
        <CalendarBlank size={18} className="shrink-0 text-zinc-500" />
        <span className="num flex-1">{format(value)}</span>
        <CaretDown size={14} weight="bold" className="text-zinc-500" />
      </button>
      {p.open && (
        <div className={`${popCls} top-full right-0 grid w-72 grid-cols-7 gap-0.5 p-2`}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <button
              key={d}
              type="button"
              autoFocus={d === value}
              aria-pressed={d === value}
              onClick={() => {
                onChange(d)
                p.setOpen(false)
              }}
              className={`num grid aspect-square place-items-center text-sm transition focus-visible:outline-2 focus-visible:outline-accent ${
                d === value ? 'bg-accent text-accent-fg' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Two-step delete: first click arms, second click (within 4s) confirms. A third click starts over. */
export function ConfirmButton({ label, onConfirm }: { label: string; onConfirm: () => unknown }) {
  const { t } = useApp()
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(id)
  }, [armed])
  return (
    <Button
      variant="danger"
      onClick={() => {
        if (!armed) return setArmed(true)
        setArmed(false)
        return onConfirm()
      }}
    >
      <span key={String(armed)} className="anim-fade">
        {armed ? t.confirmDelete : label}
      </span>
    </Button>
  )
}

export const inputCls =
  'h-11 w-full border-b border-ink bg-transparent px-3 text-base text-zinc-900 transition placeholder:text-zinc-500 focus:bg-ink/5 focus:outline-none sm:text-sm dark:text-zinc-100'

/** Money field that groups thousands with spaces as you type, keeping the caret where it belongs. */
export function MoneyInput({
  value,
  onChange,
  className = '',
  ...p
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (caret.current === null) return
    ref.current?.setSelectionRange(caret.current, caret.current)
    caret.current = null
  })
  return (
    <input
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      className={`${inputCls} num ${className}`}
      value={value}
      onChange={(e) => {
        const raw = e.target.value
        // Count the digits/separators before the caret, then find the same spot in the regrouped text.
        const before = raw.slice(0, e.target.selectionStart ?? raw.length).replace(/[^\d.,]/g, '').length
        const next = groupAmount(raw)
        let i = 0
        for (let n = 0; i < next.length && n < before; i++) if (next[i] !== ' ') n++
        caret.current = i
        onChange(next)
      }}
      onKeyDown={(e) => {
        // Backspace/Delete next to a group space removes the digit beyond it, not just the space.
        const el = e.currentTarget
        const pos = el.selectionStart ?? 0
        if (pos !== el.selectionEnd) return
        if (e.key === 'Backspace' && value[pos - 1] === ' ') el.setSelectionRange(pos - 1, pos - 1)
        if (e.key === 'Delete' && value[pos] === ' ') el.setSelectionRange(pos + 1, pos + 1)
      }}
      {...p}
    />
  )
}

export const chipCls = (on: boolean) =>
  `flex h-8 items-center gap-1.5 px-3 text-sm font-medium whitespace-nowrap ring-1 ring-inset transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent ${
    on ? 'bg-accent text-accent-fg ring-accent' : 'text-zinc-800 ring-ink/30 hover:bg-ink/5 hover:ring-ink dark:text-zinc-200'
  }`

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid content-start gap-2">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-zinc-600 dark:text-zinc-400">{hint}</span>}
      {error && <span className="anim-fade text-xs font-medium text-rose-700 dark:text-rose-400">{error}</span>}
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-fit max-w-full overflow-x-auto p-1 ring-1 ring-ink ring-inset">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-8 px-3 text-sm font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-accent ${
            o.value === value ? 'bg-accent text-accent-fg' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Sections and stat tiles: no box, a heavy ink rule on top and the content flush with it, as in print. */
export const cardCls = 'border-t-2 border-ink'

export function Card({ title, hint, action, children, className = '' }: { title?: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${cardCls} min-w-0 pt-4 pb-6 ${className}`}>
      {(title || action) && (
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {title && <h2 className="font-display text-[1.375rem] leading-tight font-medium tracking-[-0.01em] text-zinc-900 dark:text-zinc-100">{title}</h2>}
            {hint && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, sub, tone, className = '' }: { label: string; value: string; sub?: string; tone?: string; className?: string }) {
  return (
    <div className={`${cardCls} min-w-0 pt-3 pb-2 ${className}`}>
      <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400">
        {tone && <span className={`size-2 ${tone}`} aria-hidden />}
        {label}
      </div>
      <div className="num mt-2 truncate font-display text-[1.75rem] leading-tight tracking-[-0.02em] sm:text-4xl">{value}</div>
      {sub && <div className="num mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">{sub}</div>}
    </div>
  )
}

const h1Cls = 'font-display text-4xl leading-[1.05] tracking-[-0.03em] first-letter:uppercase md:text-5xl'

/** Page title and actions. A non-string title (e.g. a PeriodPicker) brings its own heading. */
export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      {typeof title === 'string' ? <h1 className={h1Cls}>{title}</h1> : title}
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

/**
 * The page title as a button that opens a grid to jump elsewhere: `value` YYYY-MM picks a month (paging by year),
 * YYYY picks a year (paging by 12 years, the shown one in the third row).
 */
export function PeriodPicker({ title, value, onChange }: { title: string; value: string; onChange: (v: string) => void }) {
  const { t } = useApp()
  const p = usePopover()
  const months = value.length === 7
  const first = months ? Number(value.slice(0, 4)) : Number(value) - 7
  const [page, setPage] = useState(first)
  const step = months ? 1 : 12
  const now = months ? monthOf(today()) : today().slice(0, 4)
  const short = new Intl.DateTimeFormat(t.locale, { month: 'short' })
  const cells = Array.from({ length: 12 }, (_, i) =>
    months ? { v: `${page}-${String(i + 1).padStart(2, '0')}`, label: short.format(new Date(page, i, 1)) } : { v: String(page + i), label: String(page + i) },
  )
  return (
    <div ref={p.ref} className="relative" onKeyDown={p.onKeyDown}>
      <h1 className={h1Cls}>
        <button
          type="button"
          aria-expanded={p.open}
          onClick={() => {
            setPage(first)
            p.setOpen(!p.open)
          }}
          className="-mx-2 flex items-center gap-2 rounded-lg px-2 transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-accent dark:hover:bg-zinc-800/60"
        >
          {title}
          <CaretDown size={18} weight="bold" className={`text-zinc-500 transition-transform ${p.open ? 'rotate-180' : ''}`} />
        </button>
      </h1>
      {p.open && (
        <div className={`${popCls} top-full left-0 w-72 p-3`}>
          <div className="mb-2 flex items-center justify-between">
            <IconButton label={t.prev} onClick={() => setPage(page - step)}>
              <CaretLeft size={16} weight="bold" />
            </IconButton>
            <span className="num text-sm font-semibold">{months ? page : `${page} - ${page + 11}`}</span>
            <IconButton label={t.next} onClick={() => setPage(page + step)}>
              <CaretRight size={16} weight="bold" />
            </IconButton>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {cells.map((c) => (
              <button
                key={c.v}
                type="button"
                autoFocus={c.v === value}
                aria-pressed={c.v === value}
                onClick={() => {
                  onChange(c.v)
                  p.setOpen(false)
                }}
                className={`num h-10 rounded-lg text-sm capitalize transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent ${
                  c.v === value ? 'bg-accent text-accent-fg' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                } ${c.v === now ? 'font-bold underline underline-offset-4' : ''}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Previous / today / next. `onToday` is left out while the current period is already shown, which greys the button out. */
export function PeriodNav({ onPrev, onNext, onToday }: { onPrev: () => void; onNext: () => void; onToday?: () => void }) {
  const { t } = useApp()
  return (
    <div className="flex divide-x divide-ink/25 ring-1 ring-ink ring-inset">
      <IconButton label={t.prev} onClick={onPrev}>
        <CaretLeft size={18} weight="bold" />
      </IconButton>
      <button
        type="button"
        disabled={!onToday}
        onClick={onToday}
        className="h-10 min-w-14 px-3 text-sm font-semibold text-zinc-900 transition hover:bg-ink/5 active:scale-95 focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:font-medium disabled:text-zinc-500 dark:text-zinc-100 dark:disabled:text-zinc-500"
      >
        {t.today}
      </button>
      <IconButton label={t.next} onClick={onNext}>
        <CaretRight size={18} weight="bold" />
      </IconButton>
    </div>
  )
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-xs text-sm text-zinc-600 dark:text-zinc-400">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/**
 * Bottom sheet on phones, centred dialog on desktop. Children mount only while open, so forms reset.
 * The field marked data-autofocus gets the focus: React's autoFocus fires while the dialog is still closed, and
 * showModal would hand it to the close button.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const down = useRef<EventTarget | null>(null)
  const { t } = useApp()
  useEffect(() => {
    const d = ref.current!
    if (open && !d.open) {
      d.showModal()
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className="sheet"
      // React bubbles a stacked sheet's close up to this one: only its own closes it.
      onClose={(e) => e.target === e.currentTarget && onClose()}
      // Only a click that also started on the backdrop closes: a text selection dragged out of a field must not.
      onPointerDown={(e) => (down.current = e.target)}
      onClick={(e) => e.target === ref.current && down.current === ref.current && onClose()}
    >
      {/* The body is the only scroller: it shrinks to what the dialog's max-height leaves after the header and border. */}
      {open && (
        <>
          <header className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
            <h2 className="font-display text-2xl leading-tight tracking-[-0.01em]">{title}</h2>
            <IconButton label={t.cancel} onClick={onClose}>
              <X size={18} />
            </IconButton>
          </header>
          <div className="min-h-0 overflow-y-auto px-5 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">{children}</div>
        </>
      )}
    </dialog>
  )
}

/** Category icon on a soft tint of its colour; a plain dot for categories without an icon. */
export function CatIcon({ c, size = 'md' }: { c?: Category; size?: 'sm' | 'md' }) {
  const color = c?.color ?? '#a1a1aa'
  const I = c?.icon ? ICONS[c.icon] : undefined
  return (
    <span className={`grid shrink-0 place-items-center ${size === 'md' ? 'size-9' : 'size-7'}`} style={{ background: `${color}22`, color }} aria-hidden>
      {I ? <I size={size === 'md' ? 18 : 15} weight="duotone" /> : <span className="size-3 rounded-full" style={{ background: color }} />}
    </span>
  )
}

/** How many transactions use each category id. */
export const useCategoryUsage = () =>
  useLiveQuery(async () => {
    const n = new Map<string, number>()
    for (const id of (await db.txs.orderBy('categoryId').keys()) as string[]) n.set(id, (n.get(id) ?? 0) + 1)
    return n
  })

/** Average monthly income over the last 12 months: the yardstick for how "big" an amount is. */
export function useMonthlyIncome() {
  const now = monthOf(today())
  return useLiveQuery(
    async () => avgMonthlyIncome(await db.txs.where('date').between(`${shiftMonth(now, -11)}-01`, `${now}-31`, true, true).toArray()),
    [now],
    0,
  )
}

/**
 * Signed amount, tinted from the normal text colour towards its kind's colour by how big it is
 * relative to monthly income. Investment expenses get their own colour: money moved, not lost.
 */
export function Amount({ amount, kind, bucket, income, className = '' }: { amount: number; kind: Kind; bucket?: Bucket | null; income: number; className?: string }) {
  const { money } = useApp()
  const tone = kind === 'income' ? 'income' : bucket === 'investments' ? 'investments' : 'expense'
  return (
    <span className={`num ${className}`} style={{ color: `color-mix(in oklab, var(--color-${tone}) ${tint(amount, income)}%, currentColor)` }}>
      {kind === 'income' ? '+' : '−'}
      {money(amount)}
    </span>
  )
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="group flex items-start gap-4 text-left focus-visible:outline-none">
      <span className="grid flex-1 gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        {hint && <span className="text-xs text-zinc-600 dark:text-zinc-400">{hint}</span>}
      </span>
      <span
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent ${
          checked ? 'bg-accent' : 'bg-zinc-300 dark:bg-zinc-700'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 size-5 rounded-full shadow-sm transition-transform ${checked ? 'translate-x-5 bg-accent-fg' : 'bg-white dark:bg-zinc-300'}`} />
      </span>
    </button>
  )
}

/** Text that cross-fades to a new value in place: the old one fades out as the new one fades in. */
export function Roll({ text, className = '' }: { text: string; className?: string }) {
  const [items, setItems] = useState([{ text, key: 0 }])
  if (items[0].text !== text) setItems([{ text, key: items[0].key + 1 }, items[0]])
  return (
    <span className={`inline-grid ${className}`}>
      {items.map((it, i) => (
        <span
          key={it.key}
          aria-hidden={i > 0}
          className={`min-w-0 truncate [grid-area:1/1] ${i ? 'roll-out' : items.length > 1 ? 'roll-in' : ''}`}
          onAnimationEnd={i ? () => setItems((xs) => xs.slice(0, 1)) : undefined}
        >
          {it.text}
        </span>
      ))}
    </span>
  )
}

export interface Slice {
  id: string
  name: string
  color: string
  amount: number
}

/**
 * Donut chart; `children` sit in the hole. Hovering a slice reports it and fades the others.
 * The chart itself is memoized and the fading is plain CSS: re-rendering it on hover would cut its entry animation short.
 */
export function Donut({
  data,
  active,
  onActive,
  tooltip,
  children,
}: {
  data: Slice[]
  active?: string | null
  onActive?: (id: string | null) => void
  tooltip?: (d: Slice) => ReactNode
  children: ReactNode
}) {
  const scope = `donut-${useId().replace(/\W/g, '')}`
  const report = useRef(onActive)
  const tip = useRef(tooltip)
  useEffect(() => {
    report.current = onActive
    tip.current = tooltip
  })
  const hasTip = !!tooltip
  const on = data.findIndex((d) => d.id === active)
  const chart = useMemo(
    () => (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="name"
            innerRadius="64%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            stroke="var(--card)"
            strokeWidth={2}
            animationDuration={700}
            animationEasing="ease-out"
            onMouseEnter={(_, i) => report.current?.(data[i]?.id ?? null)}
            onMouseLeave={() => report.current?.(null)}
          >
            {data.map((d, i) => (
              <Cell key={d.id} fill={d.color} className={`slice-${i} outline-none transition-[opacity,filter] duration-200`} />
            ))}
          </Pie>
          {hasTip && (
            <Tooltip
              wrapperStyle={{ zIndex: 10 }}
              isAnimationActive={false}
              content={({ active: shown, payload }) => {
                const d = payload?.[0]?.payload as Slice | undefined
                return shown && d ? (
                  <div className="anim-fade bg-panel px-3 py-2 text-sm shadow-[4px_4px_0] ring-1 shadow-ink/10 ring-ink">{tip.current?.(d)}</div>
                ) : null
              }}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
    ),
    [data, hasTip],
  )
  return (
    <div className={`${scope} relative mx-auto aspect-square w-full max-w-56`}>
      {on >= 0 && <style>{`.${scope} [class*="slice-"]:not(.slice-${on}) { opacity: 0.3; filter: blur(1px) }`}</style>}
      {chart}
      <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">{children}</div>
    </div>
  )
}

/** Fades and slightly blurs a row while another item of its chart is hovered. */
export const fade = (active: string | null | undefined, id: string) =>
  `transition-[opacity,filter] duration-200 ${active && active !== id ? 'opacity-35 blur-[1px]' : ''}`

/** Donut of category shares, with the ranked list below as its legend. Pass `active`/`onActive` to share the hover with other views. */
export function CategoryBars({
  rows,
  active,
  onActive,
}: {
  rows: { id: string; amount: number; share: number }[]
  active?: string | null
  onActive?: (id: string | null) => void
}) {
  const { cat, money, t } = useApp()
  const [own, setOwn] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const hover = onActive ? (active ?? null) : own
  const setHover = onActive ?? setOwn
  const max = rows[0]?.amount ?? 0
  const total = rows.reduce((n, r) => n + r.amount, 0)
  const pct = new Intl.NumberFormat(t.locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const data = useMemo(() => rows.map((r) => ({ ...r, name: cat.get(r.id)?.name ?? '?', color: cat.get(r.id)?.color ?? '#a1a1aa' })), [rows, cat])
  return (
    <div className="grid gap-6">
      <Donut
        data={data}
        active={hover}
        onActive={setHover}
        tooltip={(d) => (
          <>
            <div className="flex items-center gap-2 font-medium">
              <span className="size-2.5 rounded-sm" style={{ background: d.color }} aria-hidden />
              {d.name}
            </div>
            <div className="num mt-0.5 text-zinc-600 dark:text-zinc-400">
              {money(d.amount)} · {pct.format(d.amount / total)}
            </div>
          </>
        )}
      >
        <span className="text-xs text-zinc-600 dark:text-zinc-400">{t.sum}</span>
        <span className="num font-display tracking-[-0.02em] text-2xl leading-tight">{money(total, true)}</span>
      </Donut>
      <ul className="grid gap-3">
        {(all ? rows : rows.slice(0, LIST_MAX)).map((r, i) => {
          const c = cat.get(r.id)
          return (
            <li key={r.id} className={`flex items-center gap-3 ${i >= LIST_MAX ? 'anim-fade-up' : ''} ${fade(hover, r.id)}`}>
              <CatIcon c={c} size="sm" />
              <div className="grid min-w-0 flex-1 gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{c?.name ?? '?'}</span>
                  <span className="num shrink-0">
                    {money(r.amount)}
                    <span className="ml-2 inline-block w-14 text-right text-zinc-500 dark:text-zinc-400">{pct.format(r.share)}</span>
                  </span>
                </div>
                <div className="anim-grow h-1.5 origin-left" style={{ width: `${Math.max(2, (r.amount / max) * 100)}%`, background: c?.color ?? '#a1a1aa' }} />
              </div>
            </li>
          )
        })}
      </ul>
      {rows.length > LIST_MAX && <ShowMore open={all} hidden={rows.length - LIST_MAX} onToggle={() => setAll(!all)} className="-mt-3" />}
    </div>
  )
}

/** Category rows shown before the list is expanded. */
const LIST_MAX = 5

/** "Show N more" / "Show less" under a list cut to its first rows. */
export function ShowMore({ open, hidden, onToggle, className = '' }: { open: boolean; hidden: number; onToggle: () => void; className?: string }) {
  const { t } = useApp()
  return (
    <Button variant="ghost" aria-expanded={open} onClick={onToggle} className={`justify-self-center ${className}`}>
      {open ? t.showLess : t.showMore(hidden)}
      <CaretDown size={14} weight="bold" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
    </Button>
  )
}
