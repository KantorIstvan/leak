// What a year came to, in enough detail for the year story (pages/Story.tsx): every part is optional and its
// scene is skipped when the data is not there. Pure functions, tested in story.test.ts.
import type { Bucket, Category, Goal, Sub, Tx } from './db'
import { byMonth, earned, fold, hitTarget, monthScore, summarize, tagTotals, today } from './lib'

const isSpending = (t: Tx) => t.kind === 'expense' && t.bucket !== 'investments'

export interface StoryMonth {
  income: number
  spent: number // needs and wants
  score: number | null // null without income
}

export interface Story {
  year: number
  income: number
  spent: number
  kept: number // income − spent; can be negative
  keptShare: number // of income; 0 without income
  invested: number
  txCount: number
  months: StoryMonth[] // 12
  best?: number // month index with the highest score (ties: more kept)
  hardest?: number // lowest score, only when it differs from best
  hit: number // months that invested their target share
  counted: number // months with income
  categories: { id: string; amount: number; share: number; count: number }[] // spending, desc
  top?: { id: string; amount: number; share: number; count: number; month: number } // the biggest, with its busiest month
  weekdays: number[] // spending by day of week, Monday first
  topWeekday?: number
  hours?: number[] // spending by part of day: night (0-6), morning (6-12), afternoon (12-18), evening (18-24); when most txs carry a createdAt
  days: Map<string, number> // YYYY-MM-DD → spent, days with spending only
  activeDays: number
  costliestDay?: { date: string; amount: number; count: number }
  streak?: { from: string; to: string; days: number } // longest run of days without spending, within the logged span
  regular?: { note: string; count: number; amount: number }
  subs?: { count: number; yearly: number; priciest: { name: string; yearly: number } } // from this year's charges, as the subs' names
  abroad?: { count: number; amount: number; currencies: string[] }
  tags: { tag: string; amount: number; count: number }[] // top 3 by amount
  goals?: { saved: number; target: number; reached: number; count: number }
  vsLast?: { income: number; spent: number; kept: number; prevIncome: number; prevSpent: number; prevKept: number }
}

export interface StoryInput {
  txs: Tx[] // the year's
  prevTxs?: Tx[] // the year before's
  subs?: Sub[]
  goals?: Goal[]
  cats: Category[]
  year: number
  ratiosAt: (month: string) => Record<Bucket, number>
  fromSavings?: ReadonlySet<string>
  now?: string // today, YYYY-MM-DD; the running year counts streaks only up to it
}

const dayKey = (year: number, m: number, d: number) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const daysIn = (year: number, m: number) => new Date(Date.UTC(year, m, 0)).getUTCDate()

/** Monday-first weekday index of a YYYY-MM-DD date. */
export const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7

export function yearStory(o: StoryInput): Story {
  const { txs, year, fromSavings } = o
  const now = o.now ?? today()
  const sum = summarize(txs, fromSavings)
  const income = earned(sum)
  const spent = sum.buckets.needs + sum.buckets.wants
  const monthSums = byMonth(txs, year, fromSavings)
  const key = (i: number) => `${year}-${String(i + 1).padStart(2, '0')}`
  const months: StoryMonth[] = monthSums.map((s, i) => {
    const sc = monthScore(s, o.ratiosAt(key(i)))
    return { income: earned(s), spent: s.buckets.needs + s.buckets.wants, score: sc ? sc.score : null }
  })
  const withIncome = monthSums.map((s, i) => [s, i] as const).filter(([s]) => earned(s) > 0)
  const hit = withIncome.filter(([s, i]) => hitTarget(s, o.ratiosAt(key(i)))).length
  const keptOf = (i: number) => (months[i].income ? (months[i].income - months[i].spent) / months[i].income : 0)
  let best: number | undefined
  let hardest: number | undefined
  for (const [, i] of withIncome) {
    const sc = months[i].score!
    if (best === undefined || sc > months[best].score! || (sc === months[best].score && keptOf(i) > keptOf(best))) best = i
    if (hardest === undefined || sc < months[hardest].score! || (sc === months[hardest].score && keptOf(i) < keptOf(hardest))) hardest = i
  }
  if (hardest === best) hardest = undefined

  const spending = txs.filter(isSpending)
  const byCat = new Map<string, { amount: number; count: number; months: number[] }>()
  for (const t of spending) {
    const c = byCat.get(t.categoryId) ?? byCat.set(t.categoryId, { amount: 0, count: 0, months: Array(12).fill(0) }).get(t.categoryId)!
    c.amount += t.amount
    c.count++
    c.months[Number(t.date.slice(5, 7)) - 1] += t.amount
  }
  const categories = [...byCat]
    .map(([id, c]) => ({ id, amount: c.amount, share: spent ? c.amount / spent : 0, count: c.count }))
    .sort((a, b) => b.amount - a.amount)
  const first = categories[0]
  const top = first && { ...first, month: byCat.get(first.id)!.months.reduce((b, v, i, a) => (v > a[b] ? i : b), 0) }

  const weekdays = Array<number>(7).fill(0)
  for (const t of spending) weekdays[weekdayOf(t.date)] += t.amount
  const topWeekday = spent ? weekdays.indexOf(Math.max(...weekdays)) : undefined

  const stamped = spending.filter((t) => t.createdAt)
  let hours: number[] | undefined
  if (spending.length && stamped.length >= spending.length * 0.6) {
    hours = [0, 0, 0, 0]
    for (const t of stamped) hours[Math.floor(new Date(t.createdAt!).getHours() / 6)] += t.amount
  }

  const days = new Map<string, number>()
  const dayCount = new Map<string, number>()
  for (const t of spending) {
    days.set(t.date, (days.get(t.date) ?? 0) + t.amount)
    dayCount.set(t.date, (dayCount.get(t.date) ?? 0) + 1)
  }
  let costliestDay: Story['costliestDay']
  for (const [date, amount] of days) if (!costliestDay || amount > costliestDay.amount) costliestDay = { date, amount, count: dayCount.get(date)! }

  // The longest quiet run between the first logged day and the last day the year has had.
  let streak: Story['streak']
  const dates = txs.map((t) => t.date).sort()
  if (dates.length) {
    const last = now.startsWith(String(year)) ? now : `${year}-12-31`
    let run = 0
    let runFrom = ''
    const close = (to: string) => {
      if (run > (streak?.days ?? 0)) streak = { from: runFrom, to, days: run }
    }
    let prev = ''
    for (let m = 1; m <= 12; m++)
      for (let d = 1; d <= daysIn(year, m); d++) {
        const k = dayKey(year, m, d)
        if (k < dates[0] || k > last) continue
        if (days.has(k)) {
          if (run) close(prev)
          run = 0
        } else {
          if (!run) runFrom = k
          run++
        }
        prev = k
      }
    if (run) close(prev)
    if (streak && streak.days < 2) streak = undefined
  }

  const notes = new Map<string, { note: string; count: number; amount: number }>()
  for (const t of spending) {
    const k = fold(t.note.trim())
    if (!k) continue
    const n = notes.get(k) ?? notes.set(k, { note: '', count: 0, amount: 0 }).get(k)!
    n.note = t.note.trim()
    n.count++
    n.amount += t.amount
  }
  const reg = [...notes.values()].sort((a, b) => b.count - a.count || b.amount - a.amount)[0]
  const regular = reg && reg.count >= 3 ? reg : undefined

  // Subscriptions: what their charges came to this year, found by name (a charge's note is the sub's name).
  let subs: Story['subs']
  if (o.subs?.length) {
    const names = new Map(o.subs.map((s) => [fold(s.name), s.name]))
    const paid = new Map<string, number>()
    for (const t of txs) {
      const name = t.kind === 'expense' ? names.get(fold(t.note.trim())) : undefined
      if (name) paid.set(name, (paid.get(name) ?? 0) + t.amount)
    }
    if (paid.size) {
      const [name, yearly] = [...paid].sort((a, b) => b[1] - a[1])[0]
      subs = { count: paid.size, yearly: [...paid.values()].reduce((a, b) => a + b, 0), priciest: { name, yearly } }
    }
  }

  const foreign = txs.filter((t) => t.kind === 'expense' && t.origCurrency)
  const abroad = foreign.length
    ? { count: foreign.length, amount: foreign.reduce((a, t) => a + t.amount, 0), currencies: [...new Set(foreign.map((t) => t.origCurrency!))].sort() }
    : undefined

  const tags = tagTotals(txs)
    .filter((x) => x.amount > 0)
    .slice(0, 3)

  const goals = o.goals?.length
    ? {
        saved: o.goals.reduce((a, g) => a + g.saved, 0),
        target: o.goals.reduce((a, g) => a + g.target, 0),
        reached: o.goals.filter((g) => g.target > 0 && g.saved >= g.target).length,
        count: o.goals.length,
      }
    : undefined

  let vsLast: Story['vsLast']
  if (o.prevTxs?.length) {
    const p = summarize(o.prevTxs, fromSavings)
    const prevIncome = earned(p)
    const prevSpent = p.buckets.needs + p.buckets.wants
    vsLast = { income, spent, kept: income - spent, prevIncome, prevSpent, prevKept: prevIncome - prevSpent }
  }

  return {
    year,
    income,
    spent,
    kept: income - spent,
    keptShare: income ? (income - spent) / income : 0,
    invested: sum.buckets.investments,
    txCount: txs.length,
    months,
    best,
    hardest,
    hit,
    counted: withIncome.length,
    categories,
    top,
    weekdays,
    topWeekday,
    hours,
    days,
    activeDays: days.size,
    costliestDay,
    streak,
    regular,
    subs,
    abroad,
    tags,
    goals,
    vsLast,
  }
}

/** Whether the story should be offered now: from 20 December for the running year, all January for the one before. */
export function storyDue(now = today()): number | null {
  const y = Number(now.slice(0, 4))
  const md = now.slice(5)
  if (md >= '12-20') return y
  if (md <= '01-31') return y - 1
  return null
}

/** Remembered per device: the latest year whose story was offered or opened. */
const SEEN = 'leak.storySeen'
export const storySeen = () => (typeof localStorage === 'undefined' ? 0 : Number(localStorage.getItem(SEEN)) || 0)
export const markStorySeen = (year: number) => localStorage.setItem(SEEN, String(Math.max(year, storySeen())))
