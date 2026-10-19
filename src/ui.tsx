import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { CalendarBlank, CaretDown, CaretLeft, CaretRight, Check, MagnifyingGlass, X } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { db, type Bucket, type Category, type Kind, type Settings } from './db'
import type { Dict } from './i18n'
import { ICONS } from './icons'
import { avgMonthlyIncome, groupAmount, monthOf, shiftMonth, tint, today } from './lib'

// Shape rules: buttons & inputs rounded-lg, cards & sheets rounded-2xl, chips rounded-full.

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

// --- Primitives -----------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-strong',
  secondary:
    'bg-white text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800',
  ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
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
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium whitespace-nowrap transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${VARIANTS[variant]} ${className}`}
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
      className="grid size-10 place-items-center rounded-lg text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 active:scale-95 focus-visible:outline-2 focus-visible:outline-accent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
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
  'anim-pop absolute z-20 mt-2 rounded-xl bg-white p-1 shadow-xl ring-1 shadow-zinc-900/10 ring-zinc-200 dark:bg-zinc-900 dark:shadow-black/40 dark:ring-zinc-700'

/** Field-looking trigger button shared by the custom pickers. */
export const triggerCls =
  'flex items-center gap-2 rounded-lg bg-white px-3 text-left ring-1 ring-zinc-300 transition hover:ring-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:bg-zinc-950 dark:ring-zinc-700 dark:hover:ring-zinc-500'

/** Dropdown with a styled option list instead of the OS <select>. */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  icon,
  align = 'left',
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  icon?: ReactNode
  align?: 'left' | 'right'
}) {
  const p = usePopover()
  return (
    <div ref={p.ref} className="relative" onKeyDown={p.onKeyDown}>
      <button type="button" aria-haspopup="listbox" aria-expanded={p.open} aria-label={label} onClick={() => p.setOpen(!p.open)} className={`${triggerCls} h-10 text-sm`}>
        {icon}
        <span className="whitespace-nowrap">{options.find((o) => o.value === value)?.label}</span>
        <CaretDown size={14} weight="bold" className={`shrink-0 text-zinc-500 transition-transform ${p.open ? 'rotate-180' : ''}`} />
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
              className={`num grid aspect-square place-items-center rounded-full text-sm transition focus-visible:outline-2 focus-visible:outline-accent ${
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
  'h-11 w-full rounded-lg bg-white px-3 text-base text-zinc-900 ring-1 ring-zinc-300 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-accent sm:text-sm dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700 dark:placeholder:text-zinc-500'

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
  `flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent ${
    on ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
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
    <div role="radiogroup" aria-label={label} className="inline-flex w-fit max-w-full overflow-x-auto rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800/70">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-md px-3 text-sm font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-accent ${
            o.value === value
              ? 'bg-white text-zinc-900 shadow-sm shadow-zinc-900/5 dark:bg-zinc-700 dark:text-white'
              : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Card({ title, hint, action, children, className = '' }: { title?: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white p-5 ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:ring-zinc-800 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
            {hint && <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{hint}</p>}
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
    <div className={`rounded-2xl bg-white p-4 ring-1 ring-zinc-200/80 sm:p-5 dark:bg-zinc-900 dark:ring-zinc-800 ${className}`}>
      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        {tone && <span className={`size-2 rounded-full ${tone}`} aria-hidden />}
        {label}
      </div>
      <div className="num mt-1.5 truncate text-xl font-semibold tracking-tight sm:text-2xl">{value}</div>
      {sub && <div className="num mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{sub}</div>}
    </div>
  )
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight first-letter:uppercase md:text-3xl">{title}</h1>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

export function PeriodNav({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  const { t } = useApp()
  return (
    <div className="flex rounded-lg ring-1 ring-zinc-200 dark:ring-zinc-800">
      <IconButton label={t.prev} onClick={onPrev}>
        <CaretLeft size={18} weight="bold" />
      </IconButton>
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

/** Bottom sheet on phones, centred dialog on desktop. Children mount only while open, so forms reset. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const down = useRef<EventTarget | null>(null)
  const { t } = useApp()
  useEffect(() => {
    const d = ref.current!
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      // Only a click that also started on the backdrop closes: a text selection dragged out of a field must not.
      onPointerDown={(e) => (down.current = e.target)}
      onClick={(e) => e.target === ref.current && down.current === ref.current && onClose()}
    >
      {open && (
        <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
          <header className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <IconButton label={t.cancel} onClick={onClose}>
              <X size={18} />
            </IconButton>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}

/** Category icon on a soft tint of its colour; a plain dot for categories without an icon. */
export function CatIcon({ c, size = 'md' }: { c?: Category; size?: 'sm' | 'md' }) {
  const color = c?.color ?? '#a1a1aa'
  const I = c?.icon ? ICONS[c.icon] : undefined
  return (
    <span className={`grid shrink-0 place-items-center rounded-lg ${size === 'md' ? 'size-9' : 'size-7'}`} style={{ background: `${color}22`, color }} aria-hidden>
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

/** Chip list of the categories of one kind, most used first so the usual picks sit up front. */
export function CategoryPicker({ kind, value, onChange, error }: { kind: Kind; value: string | null; onChange: (id: string) => void; error?: string }) {
  const { t, cats } = useApp()
  const usage = useCategoryUsage()
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.category}</legend>
      <div className="flex min-h-9 flex-wrap gap-2">
        {usage &&
          cats
          .filter((c) => c.kind === kind)
          .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.name.localeCompare(b.name))
          .map((c) => {
            const on = c.id === value
            const I = c.icon ? ICONS[c.icon] : undefined
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(c.id)}
                className={`flex h-9 items-center gap-2 rounded-full px-3 text-sm transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent ${
                  on
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                {I ? (
                  <I size={16} weight="duotone" style={{ color: c.color }} aria-hidden />
                ) : (
                  <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
                )}
                {c.name}
              </button>
            )
          })}
      </div>
      {error && <span className="anim-fade text-xs font-medium text-rose-700 dark:text-rose-400">{error}</span>}
    </fieldset>
  )
}

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
                  <div className="anim-fade rounded-lg bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">{tip.current?.(d)}</div>
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
        <span className="num text-lg font-semibold tracking-tight">{money(total, true)}</span>
      </Donut>
      <ul className="grid gap-3">
        {rows.map((r) => {
          const c = cat.get(r.id)
          return (
            <li key={r.id} className={`flex items-center gap-3 ${fade(hover, r.id)}`}>
              <CatIcon c={c} size="sm" />
              <div className="grid min-w-0 flex-1 gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{c?.name ?? '?'}</span>
                  <span className="num shrink-0">
                    {money(r.amount)}
                    <span className="ml-2 inline-block w-14 text-right text-zinc-500 dark:text-zinc-400">{pct.format(r.share)}</span>
                  </span>
                </div>
                <div className="anim-grow h-1.5 origin-left rounded-full" style={{ width: `${Math.max(2, (r.amount / max) * 100)}%`, background: c?.color ?? '#a1a1aa' }} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
