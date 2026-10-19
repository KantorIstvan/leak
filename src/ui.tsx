import { createContext, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { CaretLeft, CaretRight, X } from '@phosphor-icons/react'
import type { Bucket, Category, Settings } from './db'
import type { Dict } from './i18n'

// Shape rules: buttons & inputs rounded-lg, cards & sheets rounded-2xl, chips rounded-full.

// --- App context ----------------------------------------------------------

export interface AppCtx {
  s: Settings
  t: Dict
  money: (minor: number, compact?: boolean) => string
  cats: Category[]
  cat: Map<number, Category>
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

export function Button({ variant = 'secondary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium whitespace-nowrap transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${VARIANTS[variant]} ${className}`}
      {...p}
    />
  )
}

export function IconButton({ label, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid size-10 place-items-center rounded-lg text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 active:scale-95 focus-visible:outline-2 focus-visible:outline-accent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      {...p}
    >
      {children}
    </button>
  )
}

/** Two-step delete: first click arms, second click (within 4s) confirms. */
export function ConfirmButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const { t } = useApp()
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(id)
  }, [armed])
  return (
    <Button variant="danger" onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? t.confirmDelete : label}
    </Button>
  )
}

export const inputCls =
  'h-11 w-full rounded-lg bg-white px-3 text-base text-zinc-900 ring-1 ring-zinc-300 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-accent sm:text-sm dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700 dark:placeholder:text-zinc-500'

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid content-start gap-2">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-zinc-600 dark:text-zinc-400">{hint}</span>}
      {error && <span className="text-xs font-medium text-rose-700 dark:text-rose-400">{error}</span>}
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
  const { t } = useApp()
  useEffect(() => {
    const d = ref.current!
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
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

/** Ranked category list with share bars. */
export function CategoryBars({ rows }: { rows: { id: number; amount: number; share: number }[] }) {
  const { cat, money, t } = useApp()
  const max = rows[0]?.amount ?? 0
  const pct = new Intl.NumberFormat(t.locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <ul className="grid gap-3">
      {rows.map((r) => {
        const c = cat.get(r.id)
        return (
          <li key={r.id} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{c?.name ?? '?'}</span>
              <span className="num shrink-0">
                {money(r.amount)}
                <span className="ml-2 inline-block w-14 text-right text-zinc-500 dark:text-zinc-400">{pct.format(r.share)}</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, (r.amount / max) * 100)}%`, background: c?.color ?? '#a1a1aa' }} />
          </li>
        )
      })}
    </ul>
  )
}
