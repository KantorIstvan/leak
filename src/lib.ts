import { BUCKETS, type Bucket, type Tx } from './db'

// --- Money ----------------------------------------------------------------
// Amounts are stored as integer minor units (x100) to avoid float drift.

/** "4 700", "4700,5", "12.99" -> minor units. Null if not a positive amount. */
export function parseAmount(input: string): number | null {
  const s = input.replace(/[\s ]/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const v = Math.round(Number(s) * 100)
  return v > 0 ? v : null
}

/** Minor units -> editable string ("4700", "12.5"). */
export const toInput = (minor: number) => String(minor / 100)

export function formatMoney(minor: number, currency: string, locale: string, compact = false) {
  const fraction = minor % 100 !== 0 && !compact ? 2 : 0
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: fraction,
    maximumFractionDigits: compact ? 1 : fraction,
  }).format(minor / 100)
}

// --- Dates ----------------------------------------------------------------

/** Local date as YYYY-MM-DD (toISOString would shift to UTC). */
export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "2026-08" style month key. */
export const monthOf = (date: string) => date.slice(0, 7)

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Charge dates owed by a subscription: one per month after `lastMonth` up to `current`, day clamped to month length. */
export function dueDates(lastMonth: string, current: string, day: number) {
  const dates: string[] = []
  for (let m = shiftMonth(lastMonth, 1); m <= current; m = shiftMonth(m, 1)) {
    const [y, mo] = m.split('-').map(Number)
    dates.push(`${m}-${String(Math.min(day, new Date(y, mo, 0).getDate())).padStart(2, '0')}`)
  }
  return dates
}

// --- Summaries ------------------------------------------------------------

export interface Summary {
  income: number
  expense: number
  buckets: Record<Bucket, number>
  byCategory: Map<number, number>
}

export function summarize(txs: Tx[]): Summary {
  const s: Summary = { income: 0, expense: 0, buckets: { needs: 0, wants: 0, investments: 0 }, byCategory: new Map() }
  for (const t of txs) {
    s.byCategory.set(t.categoryId, (s.byCategory.get(t.categoryId) ?? 0) + t.amount)
    if (t.kind === 'income') {
      s.income += t.amount
    } else {
      s.expense += t.amount
      s.buckets[t.bucket ?? 'needs'] += t.amount
    }
  }
  return s
}

export interface BucketPlan {
  bucket: Bucket
  ratio: number
  goal: number
  actual: number
  left: number // negative = over budget
}

/** The 50/30/20 split: each bucket's share of the month's income vs what was spent. */
export function plan(s: Summary, ratios: Record<Bucket, number>): BucketPlan[] {
  return BUCKETS.map((bucket) => {
    const goal = Math.round((s.income * ratios[bucket]) / 100)
    return { bucket, ratio: ratios[bucket], goal, actual: s.buckets[bucket], left: goal - s.buckets[bucket] }
  })
}

/** 12 monthly summaries for a year (index 0 = January). */
export function byMonth(txs: Tx[], year: number): Summary[] {
  const months: Tx[][] = Array.from({ length: 12 }, () => [])
  for (const t of txs) {
    if (Number(t.date.slice(0, 4)) === year) months[Number(t.date.slice(5, 7)) - 1].push(t)
  }
  return months.map(summarize)
}

/** Category totals sorted desc, with share of the given total. */
export function ranked(byCategory: Map<number, number>, ids: Set<number>, total: number) {
  return [...byCategory]
    .filter(([id]) => ids.has(id))
    .map(([id, amount]) => ({ id, amount, share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount)
}
