import { BUCKETS, type Bucket, type Goal, type RatioPeriod, type Tx } from './db'

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

/** Charge dates owed by a subscription: one per month after `lastMonth` whose day has come by `today`, day clamped to month length. */
export function dueDates(lastMonth: string, today: string, day: number) {
  const dates: string[] = []
  for (let m = shiftMonth(lastMonth, 1); m <= monthOf(today); m = shiftMonth(m, 1)) {
    const [y, mo] = m.split('-').map(Number)
    const date = `${m}-${String(Math.min(day, new Date(y, mo, 0).getDate())).padStart(2, '0')}`
    if (date <= today) dates.push(date)
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

// --- Monthly score --------------------------------------------------------

/** The split a month was planned with: the first earlier split still in force then, else the current one. */
export const ratiosFor = (current: Record<Bucket, number>, history: RatioPeriod[] | null | undefined, month: string) =>
  history?.find((h) => month <= h.until)?.ratios ?? current

/**
 * The history after changing the split during `month`: the old split stays with every month before it.
 * A second change in the same month keeps the first record, as the splits in between never covered a whole month.
 */
export function withRatioChange(current: Record<Bucket, number>, history: RatioPeriod[] | null | undefined, month: string): RatioPeriod[] {
  const until = shiftMonth(month, -1)
  const h = history ?? []
  return h.some((p) => p.until >= until) ? h : [...h, { until, ratios: current }]
}

export type Tier = 'healthy' | 'coping' | 'vulnerable'

/**
 * 0-100, half how well the month kept its own split, half whether needs + wants stayed under income
 * (indicator 1 of the Financial Health Network's FinHealth Score, whose tiers this uses). Investing is not spending:
 * the saving rate is income minus needs and wants, as Eurostat defines it. Null without income.
 */
export function monthScore(s: Summary, ratios: Record<Bucket, number>): { score: number; tier: Tier; rate: number } | null {
  if (s.income <= 0) return null
  const goal = (b: Bucket) => (s.income * ratios[b]) / 100
  const saved = s.income - s.buckets.needs - s.buckets.wants
  // Share of a bucket's spending that fit its budget.
  const fit = (b: Bucket) => (s.buckets[b] <= goal(b) ? 1 : goal(b) / s.buckets[b])
  const kept = goal('investments') ? Math.max(0, Math.min(1, saved / goal('investments'))) : Number(saved >= 0)
  const plan = ((fit('needs') + fit('wants') + kept) / 3) * 100
  const rate = saved / s.income
  // FinHealth's "spending about equal to income" = 50; keeping a fifth (the 50/30/20 savings share) = 100.
  const balance = Math.max(0, Math.min(100, 50 + 250 * rate))
  const score = Math.round((plan + balance) / 2)
  return { score, tier: score >= 80 ? 'healthy' : score >= 40 ? 'coping' : 'vulnerable', rate }
}

export type Insight = { weight: number } & (
  | { kind: 'spike'; categoryId: string; amount: number; avg: number; better?: number } // better: the score had it stayed at its average
  | { kind: 'drop'; categoryId: string; amount: number; avg: number }
  | { kind: 'leak'; categoryId: string; count: number; amount: number }
  | { kind: 'biggest'; categoryId: string; note: string; amount: number; share: number }
  | { kind: 'streak'; months: number }
  | { kind: 'best' }
  | { kind: 'subs'; amount: number; share: number }
  | { kind: 'goal'; name: string; months: number }
)

/**
 * What stood out in a month, most notable first (weight is roughly the share of income it is about), at most `limit`.
 * Only facts about this month's own transactions against the user's previous months: nothing the charts already show.
 */
export function insights(o: {
  month: string
  txs: Tx[]
  prev: Tx[] // up to 12 months before `month`
  ratiosAt: (month: string) => Record<Bucket, number>
  subCharges: Set<string> // ids of this month's subscription charges
  goals: Goal[]
  closed: boolean // the month is over: drops, streaks and what-ifs need the whole month
  recent: boolean // the current or the last finished month: goal estimates are about now
  limit?: number
}): Insight[] {
  const { month, txs, prev, closed } = o
  const sum = summarize(txs)
  if (!sum.income) return []
  const out: Insight[] = []
  const of = (n: number) => n / sum.income

  // Per category: this month's spending and its average over the previous 3 months that had any spending.
  const spent = (list: Tx[]) => {
    const m = new Map<string, Tx[]>()
    for (const t of list) if (t.kind === 'expense') m.set(t.categoryId, [...(m.get(t.categoryId) ?? []), t])
    return m
  }
  const now = spent(txs)
  const back = prev.filter((t) => t.date >= `${shiftMonth(month, -3)}-01`)
  const backMonths = new Set(back.filter((t) => t.kind === 'expense').map((t) => monthOf(t.date))).size
  // In whole currency units, like the year view's averages.
  const avgOf = (id: string) =>
    backMonths ? Math.round(back.reduce((n, t) => n + (t.kind === 'expense' && t.categoryId === id ? t.amount : 0), 0) / backMonths / 100) * 100 : 0
  const total = (list: Tx[]) => list.reduce((n, t) => n + t.amount, 0)
  const score = closed ? monthScore(sum, o.ratiosAt(month))?.score : undefined

  const spikes = new Set<string>()
  for (const [id, list] of now) {
    const amount = total(list)
    const avg = avgOf(id)
    if (avg > 0 && amount >= 1.5 * avg && of(amount - avg) >= 0.03) {
      spikes.add(id)
      let better: number | undefined
      if (score !== undefined) {
        // The same month with this category back at its average, the excess taken off the bucket it mostly went to.
        const bucket = (list[0].bucket ?? 'needs') as Bucket
        const what = { ...sum, buckets: { ...sum.buckets, [bucket]: sum.buckets[bucket] - (amount - avg) } }
        const s = monthScore(what, o.ratiosAt(month))!.score
        if (s - score >= 2) better = s
      }
      out.push({ kind: 'spike', categoryId: id, amount, avg, better, weight: of(amount - avg) })
    } else if (closed && of(avg) >= 0.03 && amount <= 0.7 * avg) {
      out.push({ kind: 'drop', categoryId: id, amount, avg, weight: of(avg - amount) * 0.8 })
    }
    // Many small wants purchases: the leaks the app is named after.
    if (list.length >= 6 && list[0].bucket === 'wants' && list.every((t) => of(t.amount) <= 0.02))
      out.push({ kind: 'leak', categoryId: id, count: list.length, amount, weight: of(amount) + 0.02 })
  }
  // Categories that had an average but nothing at all this month.
  if (closed)
    for (const id of new Set(back.filter((t) => t.kind === 'expense').map((t) => t.categoryId)))
      if (!now.has(id) && of(avgOf(id)) >= 0.03) out.push({ kind: 'drop', categoryId: id, amount: 0, avg: avgOf(id), weight: of(avgOf(id)) * 0.8 })

  // The biggest one-off: not a subscription, not a usual monthly cost like rent, not already a spike.
  const big = txs
    .filter((t) => t.kind === 'expense' && !o.subCharges.has(t.id) && avgOf(t.categoryId) < 0.5 * t.amount)
    .sort((a, b) => b.amount - a.amount)[0]
  if (big && !spikes.has(big.categoryId) && big.amount >= 0.2 * sum.expense)
    out.push({ kind: 'biggest', categoryId: big.categoryId, note: big.note, amount: big.amount, share: big.amount / sum.expense, weight: of(big.amount) })

  if (closed && score !== undefined) {
    const byMonthKey = new Map<string, Tx[]>()
    for (const t of prev) byMonthKey.set(monthOf(t.date), [...(byMonthKey.get(monthOf(t.date)) ?? []), t])
    const kept = (m: string, s: Summary) => s.income > 0 && (s.income - s.buckets.needs - s.buckets.wants) * 100 >= s.income * o.ratiosAt(m).investments
    let streak = 0
    for (let m = month, s = sum; kept(m, s); m = shiftMonth(m, -1), s = summarize(byMonthKey.get(m) ?? [])) streak++
    if (streak >= 3) out.push({ kind: 'streak', months: streak, weight: 0.06 + 0.01 * streak })
    const others = [...byMonthKey]
      .filter(([m]) => m.slice(0, 4) === month.slice(0, 4))
      .map(([m, list]) => monthScore(summarize(list), o.ratiosAt(m))?.score)
      .filter((x) => x !== undefined)
    if (others.length >= 3 && others.every((x) => score > x)) out.push({ kind: 'best', weight: 0.12 })
  }

  const subs = total(txs.filter((t) => o.subCharges.has(t.id)))
  if (of(subs) >= 0.03) out.push({ kind: 'subs', amount: subs, share: subs / sum.expense, weight: of(subs) * 0.5 })

  // At this month's pace, when the closest unfinished goal is reached (profit, as the goals page estimates).
  const profit = sum.income - sum.expense
  const goal = o.goals.filter((g) => g.saved < g.target).sort((a, b) => a.target - a.saved - (b.target - b.saved))[0]
  if (o.recent && goal && profit > 0) out.push({ kind: 'goal', name: goal.name, months: Math.ceil((goal.target - goal.saved) / profit), weight: 0.03 })

  return out.sort((a, b) => b.weight - a.weight).slice(0, o.limit ?? 3)
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
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Filters and sorts transactions. Text matches the note, the category name, a #tag, or the amount
 * ("4700", "4 700" and "4700,5" all find 4 700).
 */
export function queryTxs(txs: Tx[], q: TxQuery, catName: (id: string) => string): Tx[] {
  const words = fold(q.text).split(/\s+/).filter(Boolean)
  const digits = q.text.replace(/[\s ]/g, '').replace(',', '.')
  const isNumber = /^\d+(\.\d+)?$/.test(digits)
  const hit = (tx: Tx) => {
    if (!words.length) return true
    if (isNumber && String(tx.amount / 100).startsWith(digits)) return true
    const hay = fold(`${tx.note} ${catName(tx.categoryId)} ${(tx.tags ?? []).map((g) => `#${g}`).join(' ')}`)
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

/** A tag as typed -> as stored: "#Balaton 2026 " -> "balaton-2026". Empty if nothing is left. */
export const cleanTag = (raw: string) => raw.trim().replace(/^#+/, '').trim().toLowerCase().replace(/\s+/g, '-')

/** Tags compare accent-folded: "nyaralás" and "nyaralas" are one tag. */
export const sameTag = (a: string, b: string) => fold(a) === fold(b)

/** The tags used in `txs`, the most spent on first (then the most used), each as first written. */
export function tagTotals(txs: Tx[]) {
  const by = new Map<string, { tag: string; amount: number; count: number }>()
  for (const tx of txs)
    for (const tag of tx.tags ?? []) {
      const s = by.get(fold(tag)) ?? by.set(fold(tag), { tag, amount: 0, count: 0 }).get(fold(tag))!
      s.count++
      if (tx.kind === 'expense') s.amount += tx.amount
    }
  return [...by.values()].sort((a, b) => b.amount - a.amount || b.count - a.count || a.tag.localeCompare(b.tag))
}

// --- Subscriptions --------------------------------------------------------

/** A subscription is up for "still using it?" a year after it was last confirmed, or after a year of charges if never. */
export const reviewDue = (reviewed: string | null | undefined, month: string, chargedYearAgo: boolean) =>
  reviewed ? reviewed <= shiftMonth(month, -12) : chargedYearAgo

// --- Year recap -----------------------------------------------------------

export interface Recap {
  income: number
  saved: number // income minus needs and wants, as the score counts it
  hit: number // months that reached their savings target
  counted: number // months with income
  top?: { id: string; amount: number; share: number } // the category spent on most
  regular?: { note: string; count: number; amount: number } // the expense logged most often
  tag?: { tag: string; amount: number; count: number }
}

/** What a year came to, for the recap on the year page. */
export function yearRecap(txs: Tx[], year: number, ratiosAt: (month: string) => Record<Bucket, number>): Recap {
  const months = byMonth(txs, year)
  const sum = summarize(txs)
  const key = (i: number) => `${year}-${String(i + 1).padStart(2, '0')}`
  const withIncome = months.map((s, i) => [s, key(i)] as const).filter(([s]) => s.income > 0)
  const hit = withIncome.filter(([s, m]) => (s.income - s.buckets.needs - s.buckets.wants) * 100 >= s.income * ratiosAt(m).investments).length

  const spent = txs.filter((t) => t.kind === 'expense')
  const cats = new Map<string, number>()
  for (const t of spent) cats.set(t.categoryId, (cats.get(t.categoryId) ?? 0) + t.amount)
  const [topId, topAmount] = [...cats].sort((a, b) => b[1] - a[1])[0] ?? []

  // Notes compared folded, shown as last written: "lidl" and "Lidl" are the same shop.
  const notes = new Map<string, { note: string; count: number; amount: number }>()
  for (const t of spent) {
    const k = fold(t.note.trim())
    if (!k) continue
    const n = notes.get(k) ?? notes.set(k, { note: '', count: 0, amount: 0 }).get(k)!
    n.note = t.note.trim()
    n.count++
    n.amount += t.amount
  }
  const regular = [...notes.values()].sort((a, b) => b.count - a.count || b.amount - a.amount)[0]

  return {
    income: sum.income,
    saved: sum.income - sum.buckets.needs - sum.buckets.wants,
    hit,
    counted: withIncome.length,
    top: topId === undefined ? undefined : { id: topId, amount: topAmount, share: topAmount / sum.expense },
    regular: regular && regular.count >= 3 ? regular : undefined,
    tag: tagTotals(txs).find((x) => x.amount > 0),
  }
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

// --- Desktop sign-in ------------------------------------------------------

/** Where Clerk sends the browser after a desktop Google/GitHub sign-in; the OS hands this link to Leak. */
export const SSO_CALLBACK = 'leakbudget://sso-callback'

/**
 * Clerk's return link, with the nonce that redeems the sign-in (none for a brand-new account, which is finished as a
 * sign-up). Null for any other link: anyone can open Leak with one.
 */
export function ssoReturn(link: string): { nonce: string | null } | null {
  if (link.split('?')[0].replace(/\/$/, '') !== SSO_CALLBACK) return null
  return { nonce: new URL(link).searchParams.get('rotating_token_nonce') }
}
