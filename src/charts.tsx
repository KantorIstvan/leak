import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDownRight, ArrowUpRight, CaretRight } from '@phosphor-icons/react'
import { BUCKETS, db, type Bucket, type Tx } from './db'
import { ICONS } from './icons'
import { monthOf, shiftMonth, today, type BucketPlan, type Summary, type Tier } from './lib'
import { BUCKET_BG, Button, TIER_TEXT, useApp } from './ui'

// The phone charts. Drawn by hand instead of with Recharts: a finger has no hover, so each one is read by touching
// it (drag across, or tap a mark) and says what it shows in a line of text beside it. Marks are square, like the
// rest of the app, and sit on one scale per chart.

const labelCls = 'text-[11px] font-medium tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400'

/** Where along its width (0-1) a pointer is over the element. */
const along = (e: PointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect()
  return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
}

// --- Spending pace --------------------------------------------------------

const daysIn = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()

/** Spending added up day by day; [0] is 0, [d] what was spent by the end of day d. */
function cumulative(txs: Tx[], days: number) {
  const out = Array<number>(days + 1).fill(0)
  for (const tx of txs) if (tx.kind === 'expense') out[Math.min(days, Number(tx.date.slice(8, 10)))] += tx.amount
  for (let d = 1; d <= days; d++) out[d] += out[d - 1]
  return out
}

/** Stairs through the daily totals, in a 0-100 box (y down): a day's spending lands on its own day. */
function stairs(sums: number[], last: number, days: number, max: number, close = false) {
  const x = (d: number) => ((d - 1) / (days - 1)) * 100
  const y = (v: number) => 100 - (v / max) * 100
  let path = `M0 ${y(sums[1])}`
  for (let d = 2; d <= last; d++) path += `H${x(d)}V${y(sums[d])}`
  return close ? `${path}V100H0Z` : path
}

/**
 * The month's spending as it added up, over the month before as a dashed line: are you ahead of or behind your usual
 * pace. Drag across it to read any day; let go and it returns to today (or the month's last day).
 */
export function SpendPace({ month, txs }: { month: string; txs: Tx[] }) {
  const { t, money } = useApp()
  const before = shiftMonth(month, -1)
  const prevTxs = useLiveQuery(() => db.txs.where('date').between(`${before}-01`, `${before}-31`, true, true).toArray(), [before])
  const [scrub, setScrub] = useState<number | null>(null)
  const days = daysIn(month)
  const current = monthOf(today())
  // The line stops at today in the running month; a month still ahead has none.
  const last = month < current ? days : month === current ? Number(today().slice(8, 10)) : 0
  const sums = useMemo(() => cumulative(txs, days), [txs, days])
  const prev = useMemo(() => {
    if (!prevTxs?.some((tx) => tx.kind === 'expense')) return null
    const n = daysIn(before)
    const c = cumulative(prevTxs, n)
    // A longer month compares its last days with the shorter one's total.
    return Array.from({ length: days + 1 }, (_, d) => c[Math.min(d, n)])
  }, [prevTxs, before, days])
  const max = Math.max(sums[last], prev?.[days] ?? 0, 1)

  const day = Math.min(scrub ?? last, Math.max(last, 1))
  const spent = sums[Math.min(day, last)]
  const diff = prev ? spent - prev[day] : 0
  const [y, m] = month.split('-').map(Number)
  const dayName = new Intl.DateTimeFormat(t.locale, { month: 'short', day: 'numeric' }).format(new Date(y, m - 1, day))
  const short = (mo: string) => new Intl.DateTimeFormat(t.locale, { month: 'short' }).format(new Date(Number(mo.slice(0, 4)), Number(mo.slice(5, 7)) - 1, 1))
  const pos = (d: number, v: number): CSSProperties => ({ left: `${((d - 1) / (days - 1)) * 100}%`, top: `${100 - (v / max) * 100}%` })
  const pick = (e: PointerEvent<HTMLElement>) => setScrub(Math.round(along(e) * (days - 1)) + 1)
  const ticks = [1, 8, 15, 22, days]

  return (
    <div>
      <div>
        <div className={labelCls}>{dayName}</div>
        <div className="num mt-1 truncate font-display text-[1.75rem] leading-none tracking-[-0.02em]">{money(spent)}</div>
        {prev && diff !== 0 && (
          <p className="num mt-2 flex items-start gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            {diff < 0 ? <ArrowDownRight size={14} weight="bold" className="mt-px shrink-0 text-income" aria-hidden /> : <ArrowUpRight size={14} weight="bold" className="mt-px shrink-0 text-expense" aria-hidden />}
            {diff < 0 ? t.paceLess(money(-diff)) : t.paceMore(money(diff))}
          </p>
        )}
      </div>

      <div
        className="relative mt-4 h-32 touch-pan-y select-none"
        onPointerDown={pick}
        onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons > 0) && pick(e)}
        onPointerUp={() => setScrub(null)}
        onPointerLeave={() => setScrub(null)}
        onPointerCancel={() => setScrub(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          <line x1="0" x2="100" y1="50" y2="50" stroke="var(--chart-grid)" vectorEffect="non-scaling-stroke" />
          <line x1="0" x2="100" y1="0" y2="0" stroke="var(--chart-grid)" vectorEffect="non-scaling-stroke" />
          {prev && <path d={stairs(prev, days, days, max)} fill="none" stroke="var(--chart-ink)" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
          {last > 0 && (
            <>
              <path d={stairs(sums, last, days, max, true)} fill="var(--color-expense)" opacity="0.12" />
              <path d={stairs(sums, last, days, max)} fill="none" stroke="var(--color-expense)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </>
          )}
          <line x1="0" x2="100" y1="100" y2="100" stroke="var(--ink)" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="num absolute top-0 right-0 -translate-y-1/2 bg-panel pl-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">{money(max, true)}</span>
        {scrub !== null && <span className="absolute inset-y-0 w-px bg-ink/40" style={{ left: pos(day, 0).left }} aria-hidden />}
        {prev && scrub !== null && <span className="absolute size-2 -translate-1/2 bg-[var(--chart-ink)] ring-2 ring-panel" style={pos(day, prev[day])} aria-hidden />}
        {last > 0 && <span className="absolute size-2.5 -translate-1/2 bg-expense ring-2 ring-panel" style={pos(Math.min(day, last), spent)} aria-hidden />}
      </div>

      <div className="num relative mt-1.5 h-4 text-[11px] text-zinc-500 dark:text-zinc-400" aria-hidden>
        {ticks.map((d, i) => (
          <span key={d} className={`absolute ${i === 0 ? '' : i === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${((d - 1) / (days - 1)) * 100}%` }}>
            {d}
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="flex items-center gap-2 first-letter:uppercase">
          <span className="h-0.5 w-4 bg-expense" aria-hidden />
          {short(month)}
        </span>
        {prev && (
          <span className="flex items-center gap-2 first-letter:uppercase">
            <span className="h-0 w-4 border-t-2 border-dashed border-[var(--chart-ink)]" aria-hidden />
            {short(before)}
          </span>
        )}
      </div>
    </div>
  )
}

// --- Budget split as vessels ----------------------------------------------

/**
 * One measuring glass per bucket, filled to how much of its budget is used; the brim is the budget. Spending past it
 * stands above the brim in the expense colour.
 */
export function Vessels({ plans }: { plans: BucketPlan[] }) {
  const { t, money } = useApp()
  // Three columns on a narrow phone: a long amount falls back to its short form instead of being cut.
  const fit = (minor: number) => (money(minor).length > 10 ? money(minor, true) : money(minor))
  return (
    <ul className="grid grid-cols-3 gap-3">
      {plans.map((b) => {
        const used = b.goal ? b.actual / b.goal : b.actual ? 2 : 0
        const over = Math.min(1, Math.max(0, used - 1)) // of the room above the brim
        return (
          <li key={b.bucket} className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <span className={`size-2 shrink-0 ${BUCKET_BG[b.bucket]}`} aria-hidden />
              <span className="truncate">{t.bucket[b.bucket]}</span>
            </div>
            {/* 28px of headroom above the brim for what went over, then the glass itself. */}
            <div className="relative mt-2 h-36" aria-hidden>
              <div className="absolute inset-x-0 top-7 bottom-0 border-x border-b border-ink">
                {[25, 50, 75].map((p) => (
                  <span key={p} className="absolute left-0 h-px w-2 bg-ink/40" style={{ bottom: `${p}%` }} />
                ))}
                <div className={`anim-rise absolute inset-x-0 bottom-0 origin-bottom ${BUCKET_BG[b.bucket]}`} style={{ height: `${Math.min(1, used) * 100}%` }} />
              </div>
              {over > 0 && <div className="anim-rise absolute inset-x-0 bottom-[calc(100%-1.75rem+2px)] origin-bottom bg-expense" style={{ height: `calc(${over} * (1.75rem - 2px))` }} />}
              <span className="num absolute top-0 right-0 text-[11px] text-zinc-500 dark:text-zinc-400">{Math.round(used * 100)}%</span>
            </div>
            <div className="num mt-2 truncate text-[15px] font-medium">{fit(b.actual)}</div>
            <div className="num truncate text-xs text-zinc-500 dark:text-zinc-400">{t.goalOf(fit(b.goal))}</div>
            <div className={`num text-xs ${b.left < 0 ? 'font-medium text-expense' : 'text-zinc-600 dark:text-zinc-400'}`}>{b.left < 0 ? t.over(fit(-b.left)) : t.left(fit(b.left))}</div>
          </li>
        )
      })}
    </ul>
  )
}

// --- The year, month by month ---------------------------------------------

/**
 * Twelve columns on one scale: income rises from the middle line, expenses hang below it, and a square marks what
 * was left over. Tap or drag to pick a month; its figures, bucket split and score read out above, with a way in.
 */
export function YearBars({
  year,
  months,
  scores,
  openMonth,
}: {
  year: number
  months: Summary[]
  scores: ({ score: number; tier: Tier } | null)[]
  openMonth: (m: string) => void
}) {
  const { t, money } = useApp()
  const hasData = (i: number) => months[i].income > 0 || months[i].expense > 0
  const [picked, setPicked] = useState<number | null>(null)
  // Until one is picked: this month in the running year, else the last month with anything in it.
  const fallback = year === Number(today().slice(0, 4)) ? Number(today().slice(5, 7)) - 1 : Math.max(0, months.findLastIndex((_, i) => hasData(i)))
  const on = picked ?? fallback
  const m = months[on]
  const max = Math.max(1, ...months.map((x) => Math.max(x.income, x.expense)))
  const name = (i: number, month: 'long' | 'narrow') => new Intl.DateTimeFormat(t.locale, { month }).format(new Date(year, i, 1))
  const key = (i: number) => `${year}-${String(i + 1).padStart(2, '0')}`
  const spentIn = BUCKETS.filter((b) => m.buckets[b] > 0)
  const score = scores[on]
  // What was left, as a share of the half it sits in: above the line when kept, below when overspent.
  const net = (i: number) => (months[i].income - months[i].expense) / max
  const line = months.map((_, i) => (hasData(i) ? `${((i + 0.5) / 12) * 100},${50 - net(i) * 50}` : null)).filter(Boolean).join(' ')

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="min-w-0 truncate font-display text-xl leading-tight first-letter:uppercase">{name(on, 'long')}</h3>
        {score && (
          <span className="num shrink-0 text-xs text-zinc-600 dark:text-zinc-400">
            {t.scoreShort} <span className={`text-sm font-semibold ${TIER_TEXT[score.tier]}`}>{score.score}</span>
          </span>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        {[
          { label: t.income, value: m.income, mark: <span className="size-2 bg-income" aria-hidden /> },
          { label: t.expenses, value: m.expense, mark: <span className="size-2 bg-expense" aria-hidden /> },
          { label: t.profit, value: m.income - m.expense, mark: <span className="size-2 bg-ink ring-2 ring-panel" aria-hidden /> },
        ].map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className={`${labelCls} flex items-center gap-1.5 truncate tracking-[0.08em]!`}>
              {f.mark}
              <span className="truncate">{f.label}</span>
            </dt>
            <dd className={`num mt-1 truncate text-[15px] font-medium ${f.value < 0 ? 'text-expense' : ''}`}>{money(f.value).length > 10 ? money(f.value, true) : money(f.value)}</dd>
          </div>
        ))}
      </dl>

      <div className="relative mt-5 flex h-52 touch-pan-y select-none" onPointerMove={(e) => e.pointerType !== 'mouse' && e.buttons > 0 && setPicked(Math.min(11, Math.floor(along(e) * 12)))}>
        {months.map((x, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${name(i, 'long')}: ${t.income} ${money(x.income)}, ${t.expenses} ${money(x.expense)}`}
            aria-pressed={i === on}
            onClick={() => setPicked(i)}
            className={`relative min-w-0 flex-1 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${i === on ? 'bg-ink/[0.07]' : ''}`}
          >
            <span className="anim-rise absolute bottom-[calc(50%+1px)] left-1/2 w-[58%] max-w-5 origin-bottom -translate-x-1/2 bg-income" style={{ height: `calc(${(x.income / max) * 50}% - 1px)` }} />
            <span className="anim-drop absolute top-[calc(50%+1px)] left-1/2 w-[58%] max-w-5 origin-top -translate-x-1/2 bg-expense" style={{ height: `calc(${(x.expense / max) * 50}% - 1px)` }} />
          </button>
        ))}
        <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-ink" aria-hidden />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
          <polyline points={line} fill="none" stroke="var(--ink)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        {months.map((_, i) => hasData(i) && <span key={i} className="pointer-events-none absolute size-1.5 -translate-1/2 bg-ink ring-2 ring-panel" style={{ left: `${((i + 0.5) / 12) * 100}%`, top: `${50 - net(i) * 50}%` }} aria-hidden />)}
      </div>
      <div className="mt-1.5 flex text-center text-[11px]" aria-hidden>
        {months.map((_, i) => (
          <span key={i} className={`flex-1 uppercase ${i === on ? 'font-semibold text-zinc-900 dark:text-zinc-100' : hasData(i) ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-400 dark:text-zinc-600'}`}>
            {name(i, 'narrow')}
          </span>
        ))}
      </div>
      {/* The scores sit under their months, on the chart's own columns. */}
      {scores.some(Boolean) && (
        <div className="mt-3 flex items-center border-t border-line pt-2 text-center" aria-label={t.scoreShort}>
          {scores.map((x, i) => (
            <span key={i} className={`num flex-1 text-[11px] font-medium ${x ? TIER_TEXT[x.tier] : 'text-zinc-400 dark:text-zinc-600'}`}>
              {x?.score ?? '·'}
            </span>
          ))}
        </div>
      )}

      {spentIn.length > 0 && (
        <div className="mt-5">
          <div className="flex h-2 gap-0.5">
            {spentIn.map((b) => (
              <span key={b} className={BUCKET_BG[b]} style={{ flexGrow: m.buckets[b], flexBasis: 0 }} />
            ))}
          </div>
          <ul className="num mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            {spentIn.map((b) => (
              <li key={b} className="flex items-center gap-1.5">
                <span className={`size-2 ${BUCKET_BG[b]}`} aria-hidden />
                {t.bucket[b]} <span className="text-zinc-900 dark:text-zinc-100">{money(m.buckets[b])}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasData(on) && (
        <Button className="mt-5 w-full" onClick={() => openMonth(key(on))}>
          <span className="truncate">{t.openMonth(name(on, 'long'))}</span>
          <CaretRight size={14} weight="bold" className="shrink-0" />
        </Button>
      )}
    </div>
  )
}

// --- Share against target -------------------------------------------------

/** Each bucket's share of the spending as a bar, with a tick where its target share is. */
export function TargetBars({ s, ratios }: { s: Summary; ratios: Record<Bucket, number> }) {
  const { t, money } = useApp()
  const pct = new Intl.NumberFormat(t.locale, { style: 'percent', maximumFractionDigits: 1 })
  return (
    <ul className="grid gap-5" aria-label={t.shareOfSpend}>
      {BUCKETS.map((b) => {
        const share = s.expense ? s.buckets[b] / s.expense : 0
        return (
          <li key={b}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <span className={`size-2 ${BUCKET_BG[b]}`} aria-hidden />
                {t.bucket[b]}
              </span>
              <span className="num">
                <span className="font-medium">{pct.format(share)}</span> <span className="text-zinc-500 dark:text-zinc-400">{t.targetShare(`${ratios[b]}%`)}</span>
              </span>
            </div>
            <div className="relative mt-2.5 h-2 bg-line">
              <div className={`anim-grow h-full origin-left ${BUCKET_BG[b]}`} style={{ width: `${share * 100}%` }} />
              <span className="absolute -top-1.5 h-5 w-0.5 -translate-x-1/2 bg-ink ring-2 ring-panel" style={{ left: `${ratios[b]}%` }} aria-hidden />
            </div>
            <div className="num mt-2 text-xs text-zinc-600 dark:text-zinc-400">{money(s.buckets[b])}</div>
          </li>
        )
      })}
    </ul>
  )
}

// --- Categories as a treemap ----------------------------------------------

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Squarified treemap (Bruls, Huizing, van Wijk): rectangles for `values` (largest first) filling W x H, kept near square. */
export function squarify(values: number[], W: number, H: number): Rect[] {
  const total = values.reduce((n, v) => n + v, 0)
  if (!total) return []
  const areas = values.map((v) => (v / total) * W * H)
  const out: Rect[] = []
  let [x, y, w, h] = [0, 0, W, H]
  const sum = (row: number[]) => row.reduce((n, v) => n + v, 0)
  // The worst aspect ratio in a row laid along `side`.
  const worst = (row: number[], side: number) => {
    const s = sum(row)
    return Math.max((side * side * Math.max(...row)) / (s * s), (s * s) / (side * side * Math.min(...row)))
  }
  const lay = (row: number[]) => {
    const s = sum(row)
    if (w >= h) {
      const rw = s / h
      let yy = y
      for (const a of row) {
        out.push({ x, y: yy, w: rw, h: a / rw })
        yy += a / rw
      }
      x += rw
      w -= rw
    } else {
      const rh = s / w
      let xx = x
      for (const a of row) {
        out.push({ x: xx, y, w: a / rh, h: rh })
        xx += a / rh
      }
      y += rh
      h -= rh
    }
  }
  let row: number[] = []
  for (let i = 0; i < areas.length; ) {
    const side = Math.min(w, h)
    if (!row.length || worst([...row, areas[i]], side) <= worst(row, side)) row.push(areas[i++])
    else {
      lay(row)
      row = []
    }
  }
  if (row.length) lay(row)
  return out
}

/** Tiles drawn before the rest fold into "Other". */
const TILES = 7
const ASPECT = 1.6
const GAP = 3 // px between tiles; the outer edges stay flush with the card
const OTHER = '~other'

/** What a tile shows when its id is not a category (a subscription, a bucket). */
export interface TileInfo {
  name: string
  color: string
  icon?: (typeof ICONS)[string]
  hint?: string // the whole story as a tooltip
}

/** What fits in a tile this many pixels big: the name and share, or just the icon. */
const tier = (w: number, h: number) => (w >= 72 && h >= 48 ? 'm' : w >= 26 && h >= 26 ? 's' : 'xs')

/**
 * Category shares as tiles whose area is the amount. Tap one to single it out (the lists that share `active` follow);
 * tap it again to let go. A mouse singles out the tile it is over instead, like the donut's slices. Small categories
 * fold into one "Other" tile, which is not tappable. Laid out in whole pixels, so every gap is the same width.
 */
export function Treemap({
  rows,
  active,
  onActive,
  info,
}: {
  rows: { id: string; amount: number; share: number }[]
  active?: string | null
  onActive: (id: string | null) => void
  info?: (id: string) => TileInfo | undefined
}) {
  const { t, cat, money } = useApp()
  const pct = new Intl.NumberFormat(t.locale, { style: 'percent', maximumFractionDigits: 0 })
  const pointer = useRef('') // what pressed last: a mouse click must not also toggle what its hover already shows
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.round(el.getBoundingClientRect().width)))
    ro.observe(el)
    setW(Math.round(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])
  const H = Math.round(W / ASPECT)
  const tiles = useMemo(() => {
    if (!W) return []
    const top = rows.slice(0, TILES)
    const rest = rows.slice(TILES)
    const all = rest.length > 1 ? [...top, { id: OTHER, amount: rest.reduce((n, r) => n + r.amount, 0), share: rest.reduce((n, r) => n + r.share, 0) }] : rows.slice(0, TILES + 1)
    all.sort((a, b) => b.amount - a.amount)
    return squarify(all.map((r) => r.amount), W, H).map((r, i) => {
      // Snap both edges to whole pixels, then open the gap on the inner side only, so neighbours share one line.
      const [x0, y0, x1, y1] = [Math.round(r.x), Math.round(r.y), Math.round(r.x + r.w), Math.round(r.y + r.h)]
      const x = x0 ? x0 + GAP : 0
      const y = y0 ? y0 + GAP : 0
      return { ...all[i], x, y, w: Math.max(0, x1 - x), h: Math.max(0, y1 - y) }
    })
  }, [rows, W, H])
  return (
    <div ref={box} className="relative w-full" style={{ aspectRatio: ASPECT }}>
      {tiles.map(({ id, amount, share, x, y, w, h }) => {
        const c = info?.(id) ?? cat.get(id)
        const color = id === OTHER ? '#a1a1aa' : (c?.color ?? '#a1a1aa')
        const I = id === OTHER ? ICONS.DotsThree : c ? ('icon' in c && typeof c.icon === 'string' ? ICONS[c.icon] : (c as TileInfo).icon) : undefined
        const name = id === OTHER ? t.otherCats : (c?.name ?? '?')
        const size = tier(w, h)
        const on = active === id
        const pos: CSSProperties = { left: x, top: y, width: w, height: h }
        const inner = (
          <span
            className="relative flex size-full flex-col overflow-hidden text-left transition-[background-color] duration-200"
            style={{ background: `color-mix(in oklab, ${color} ${on ? 44 : 28}%, var(--panel))`, boxShadow: `inset 0 2px 0 ${color}` }}
          >
            {size === 'm' ? (
              <span className="flex size-full flex-col justify-end gap-1 p-2.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  {I && <I size={15} weight="duotone" style={{ color }} className="shrink-0" aria-hidden />}
                  <span className="truncate text-xs leading-tight font-medium">{name}</span>
                </span>
                <span className="num truncate text-[11px] leading-none text-zinc-600 dark:text-zinc-400">{pct.format(share)}</span>
              </span>
            ) : size === 's' && I ? (
              <span className="grid size-full place-items-center pt-0.5">
                <I size={Math.min(18, Math.max(14, Math.min(w, h) / 3))} weight="duotone" style={{ color }} aria-hidden />
              </span>
            ) : null}
          </span>
        )
        return id === OTHER ? (
          <div key={id} className={`absolute transition-opacity duration-200 ${active ? 'opacity-35' : ''}`} style={pos} title={`${name}, ${pct.format(share)}, ${money(amount)}`}>
            {inner}
          </div>
        ) : (
          <button
            key={id}
            type="button"
            aria-label={(c as TileInfo | undefined)?.hint ?? `${name}, ${money(amount)}, ${pct.format(share)}`}
            title={(c as TileInfo | undefined)?.hint ?? `${name} · ${money(amount)} · ${pct.format(share)}`}
            aria-pressed={on}
            onPointerDown={(e) => (pointer.current = e.pointerType)}
            onPointerEnter={(e) => e.pointerType === 'mouse' && onActive(id)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && onActive(null)}
            onClick={() => {
              if (pointer.current !== 'mouse') onActive(on ? null : id)
              pointer.current = ''
            }}
            className={`absolute transition-opacity duration-200 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${active && !on ? 'opacity-35' : ''}`}
            style={pos}
          >
            {inner}
          </button>
        )
      })}
    </div>
  )
}

// --- Subscriptions across the month ---------------------------------------

export interface Charge {
  id: string
  name: string
  day: number
  amount: number // in the base currency
  color: string
}

/**
 * This month as a ruler with a stem at every charge day, as tall as the charge is big. What is already charged is
 * faded; a line marks today. Tap a stem to single out its subscription.
 */
export function ChargeDays({ charges, active, onActive }: { charges: Charge[]; active?: string | null; onActive: (id: string | null) => void }) {
  const { t, money } = useApp()
  const days = daysIn(monthOf(today()))
  const now = Number(today().slice(8, 10))
  const max = Math.max(1, ...charges.map((c) => c.amount))
  const ahead = charges.filter((c) => Math.min(c.day, days) > now)
  const picked = charges.find((c) => c.id === active)
  const x = (day: number) => ((Math.min(day, days) - 0.5) / days) * 100
  // Charges on the same day stand side by side.
  const nth = new Map<string, number>()
  const perDay = new Map<number, number>()
  for (const c of [...charges].sort((a, b) => b.amount - a.amount)) {
    const d = Math.min(c.day, days)
    nth.set(c.id, perDay.get(d) ?? 0)
    perDay.set(d, (perDay.get(d) ?? 0) + 1)
  }
  const ticks = [1, 8, 15, 22, days]
  return (
    <div>
      <p className="num text-sm text-zinc-700 dark:text-zinc-300">
        {picked ? `${picked.name} · ${t.chargedOn(picked.day)} · ${money(picked.amount)}` : ahead.length ? t.subsAhead(money(ahead.reduce((n, c) => n + c.amount, 0))) : t.subsDone}
      </p>
      <div className="relative mt-4 h-28">
        <span className="absolute inset-x-0 bottom-0 h-px bg-ink" aria-hidden />
        {Array.from({ length: days }, (_, i) => (
          <span key={i} className="absolute bottom-0 h-1.5 w-px bg-ink/30" style={{ left: `${x(i + 1)}%` }} aria-hidden />
        ))}
        <span className="absolute inset-y-0 w-px border-l border-dashed border-ink/50" style={{ left: `${x(now)}%` }} aria-hidden />
        <span className={`absolute top-0 bg-panel px-1 text-[11px] leading-none text-zinc-500 dark:text-zinc-400 ${now > days / 2 ? '-translate-x-full' : ''}`} style={{ left: `${x(now)}%` }} aria-hidden>
          {t.today}
        </span>
        {charges.map((c) => {
          const day = Math.min(c.day, days)
          return (
            <button
              key={c.id}
              type="button"
              aria-label={`${c.name}, ${t.chargedOn(c.day)}, ${money(c.amount)}`}
              aria-pressed={active === c.id}
              onClick={() => onActive(active === c.id ? null : c.id)}
              className={`absolute bottom-0 flex h-[calc(100%-1rem)] w-7 -translate-x-1/2 flex-col items-center justify-end transition-opacity duration-200 focus-visible:outline-2 focus-visible:outline-accent ${
                active ? (active === c.id ? '' : 'opacity-25') : day <= now ? 'opacity-40' : ''
              }`}
              style={{ left: `calc(${x(day)}% + ${(nth.get(c.id) ?? 0) * 9}px)` }}
            >
              <span className="size-3 shrink-0 ring-2 ring-panel" style={{ background: c.color }} />
              <span className="anim-rise w-0.5 origin-bottom" style={{ background: c.color, height: `${20 + (c.amount / max) * 60}%` }} />
            </button>
          )
        })}
      </div>
      <div className="num relative mt-1.5 h-4 text-[11px] text-zinc-500 dark:text-zinc-400" aria-hidden>
        {ticks.map((d) => (
          <span key={d} className="absolute -translate-x-1/2" style={{ left: `${x(d)}%` }}>
            {d}
          </span>
        ))}
      </div>
    </div>
  )
}
