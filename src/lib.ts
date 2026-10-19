import { BUCKETS, type Bucket, type Tx } from './db'

// --- Money ----------------------------------------------------------------
// Amounts are stored as integer minor units (x100) to avoid float drift.

// 100 billion in any currency: far beyond a personal ledger, and sums of many stay exact integers.
const MAX_AMOUNT = 1e13

/** "4 700", "4700,5", "12.99" -> minor units. Null if not a positive amount (or an absurdly large one). */
export function parseAmount(input: string): number | null {
  const s = input.replace(/[\s ]/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const v = Math.round(Number(s) * 100)
  return v > 0 && v <= MAX_AMOUNT ? v : null
}

/** Minor units -> editable string ("4 700", "12.5"). */
export const toInput = (minor: number) => groupAmount(String(minor / 100))

const symbolOf = (code: string, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value

const symbols = new Map<string, string>()

/**
 * Shortest recognisable symbol for a currency (Ft, €, zł), from Unicode CLDR data only: the UI locale first,
 * then the currency's home locale (ISO 4217 codes start with the country). No CLDR symbol -> the ISO code, as banks show it.
 */
export function currencySymbol(code: string, locale: string) {
  const key = `${code}|${locale}`
  let sym = symbols.get(key)
  if (sym === undefined) {
    sym = symbolOf(code, locale)
    if (!sym || sym === code) {
      let home: string | undefined
      try {
        home = symbolOf(code, new Intl.Locale('und', { region: code.slice(0, 2) }).maximize().toString())
      } catch {
        // not a country prefix (e.g. XAU, EUR) -> skip
      }
      sym = home || code
    }
    symbols.set(key, sym)
  }
  return sym
}

// Building a NumberFormat costs ~13x more than using one, and every rendered amount needs one.
const formats = new Map<string, Intl.NumberFormat>()

export function formatMoney(minor: number, currency: string, locale: string, compact = false) {
  const fraction = minor % 100 !== 0 && !compact ? 2 : 0
  const key = `${locale}|${currency}|${compact}|${fraction}`
  let format = formats.get(key)
  if (!format)
    formats.set(
      key,
      (format = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        notation: compact ? 'compact' : 'standard',
        minimumFractionDigits: fraction,
        maximumFractionDigits: compact ? 1 : fraction,
      })),
    )
  return format
    .formatToParts(minor / 100)
    .map((p) => (p.type === 'currency' ? currencySymbol(currency, locale) : p.value))
    .join('')
}

// --- Dates ----------------------------------------------------------------

/** Local date as YYYY-MM-DD (toISOString would shift to UTC). */
export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "2026-08" style month key. */
export const monthOf = (date: string) => date.slice(0, 7)

/** True for a YYYY-MM-DD that is a real calendar day ("2026-02-30" is not; Postgres would reject it). */
export function isDay(s: unknown): s is string {
  const m = typeof s === 'string' && /^([1-9]\d{3})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

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
  byCategory: Map<string, number>
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
export function ranked(byCategory: Map<string, number>, ids: Set<string>, total: number) {
  return [...byCategory]
    .filter(([id]) => ids.has(id))
    .map(([id, amount]) => ({ id, amount, share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

// --- Amount tint ----------------------------------------------------------

/** Average income over the months that had any, so one missing payday does not skew it. */
export function avgMonthlyIncome(txs: Tx[]) {
  const months = new Set<string>()
  let total = 0
  for (const t of txs) {
    if (t.kind !== 'income') continue
    total += t.amount
    months.add(monthOf(t.date))
  }
  return months.size ? total / months.size : 0
}

/**
 * How strongly to tint an amount (0-100 %), relative to what the user earns in a month.
 * sqrt keeps small amounts faintly visible while a full month's income saturates.
 * No income known yet -> full tint, as there is nothing to compare against.
 */
export function tint(amount: number, monthlyIncome: number) {
  if (monthlyIncome <= 0) return 100
  return Math.round(8 + 92 * Math.min(1, Math.sqrt(amount / monthlyIncome)))
}

// --- Amount input ---------------------------------------------------------

/**
 * Typing aid: keeps digits and one decimal separator, groups the whole part by thousands with spaces
 * ("100000000" -> "100 000 000"). Extra decimals are kept so parseAmount can reject them instead of
 * silently truncating "1.000" to 1.
 */
export function groupAmount(raw: string) {
  const s = raw.replace(/[^\d.,]/g, '')
  const i = s.search(/[.,]/)
  const whole = (i < 0 ? s : s.slice(0, i)).replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return i < 0 ? whole : `${whole || '0'}${s[i]}${s.slice(i + 1).replace(/[.,]/g, '')}`
}

// --- Colour ---------------------------------------------------------------

/** h 0-360, s and v 0-1 -> "#rrggbb". */
export function hsvToHex(h: number, s: number, v: number) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255)
  }
  return '#' + [f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** "#rrggbb" -> [h, s, v]. Null if not a 6-digit hex colour. */
export function hexToHsv(hex: string): [number, number, number] | null {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  const h = !d ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, max ? d / max : 0, max]
}

// --- Transaction search ---------------------------------------------------

export type TxSort = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'category' | 'note'

export interface TxQuery {
  text: string
  kind: 'all' | Tx['kind']
  buckets: Bucket[] // empty = any
  categories: string[] // empty = any
  min: number | null // minor units
  max: number | null
  from: string // YYYY-MM-DD, '' = open
  to: string
  sort: TxSort
}

export const EMPTY_QUERY: TxQuery = { text: '', kind: 'all', buckets: [], categories: [], min: null, max: null, from: '', to: '', sort: 'date-desc' }

/** Number of active filters (search text and sort excluded). */
export const filterCount = (q: TxQuery) =>
  [q.kind !== 'all', q.buckets.length, q.categories.length, q.min !== null, q.max !== null, q.from, q.to].filter(Boolean).length

/** Lowercase, accents stripped: "Kávé" matches "kave". */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Filters and sorts transactions. Text matches the note, the category name, or the amount
 * ("4700", "4 700" and "4700,5" all find 4 700).
 */
export function queryTxs(txs: Tx[], q: TxQuery, catName: (id: string) => string): Tx[] {
  const words = fold(q.text).split(/\s+/).filter(Boolean)
  const digits = q.text.replace(/[\s ]/g, '').replace(',', '.')
  const isNumber = /^\d+(\.\d+)?$/.test(digits)
  const hit = (tx: Tx) => {
    if (!words.length) return true
    if (isNumber && String(tx.amount / 100).startsWith(digits)) return true
    const hay = fold(`${tx.note} ${catName(tx.categoryId)}`)
    return words.every((w) => hay.includes(w))
  }
  const list = txs.filter(
    (tx) =>
      (q.kind === 'all' || tx.kind === q.kind) &&
      (!q.buckets.length || (tx.bucket !== null && q.buckets.includes(tx.bucket))) &&
      (!q.categories.length || q.categories.includes(tx.categoryId)) &&
      (q.min === null || tx.amount >= q.min) &&
      (q.max === null || tx.amount <= q.max) &&
      (!q.from || tx.date >= q.from) &&
      (!q.to || tx.date <= q.to) &&
      hit(tx),
  )
  // Same day: most recently logged first.
  const byDate = (a: Tx, b: Tx) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0) || b.id.localeCompare(a.id)
  const sorts: Record<TxSort, (a: Tx, b: Tx) => number> = {
    'date-desc': byDate,
    'date-asc': (a, b) => -byDate(a, b),
    'amount-desc': (a, b) => b.amount - a.amount || byDate(a, b),
    'amount-asc': (a, b) => a.amount - b.amount || byDate(a, b),
    category: (a, b) => catName(a.categoryId).localeCompare(catName(b.categoryId)) || byDate(a, b),
    note: (a, b) => (a.note || catName(a.categoryId)).localeCompare(b.note || catName(b.categoryId)) || byDate(a, b),
  }
  return list.sort(sorts[q.sort])
}

/**
 * Inline completion for the description field: the most used earlier note of this kind that
 * starts with what was typed (ties: most recent), as last written, with the category it was last logged under.
 */
export function suggestNote(txs: Tx[], typed: string, kind: Tx['kind']): { note: string; categoryId: string } | undefined {
  const q = fold(typed)
  if (!q.trim()) return
  const later = (a: Tx, b: Tx) => a.date.localeCompare(b.date) || (a.createdAt ?? 0) - (b.createdAt ?? 0)
  const seen = new Map<string, { tx: Tx; n: number }>()
  for (const tx of txs) {
    const key = fold(tx.note.trim())
    if (tx.kind !== kind || !key.startsWith(q)) continue
    const s = seen.get(key)
    if (!s) seen.set(key, { tx, n: 1 })
    else {
      s.n++
      if (later(tx, s.tx) > 0) s.tx = tx
    }
  }
  const best = [...seen.values()].sort((a, b) => b.n - a.n || later(b.tx, a.tx))[0]
  return best && { note: best.tx.note.trim(), categoryId: best.tx.categoryId }
}
