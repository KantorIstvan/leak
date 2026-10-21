import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BUCKETS, db } from '../db'
import { byMonth, ranked, summarize, type Summary } from '../lib'
import { BUCKET_BG, Card, CategoryBars, Donut, Empty, fade, PageHeader, PeriodNav, Stat, useApp } from '../ui'

export function YearPage({ year, setYear, openMonth }: { year: number; setYear: (y: number) => void; openMonth: (m: string) => void }) {
  const { t, s, money, cats } = useApp()
  const txs = useLiveQuery(() => db.txs.where('date').between(`${year}-01-01`, `${year}-12-31`, true, true).toArray(), [year])
  // The month hovered in the bar chart: the months table keeps its row sharp and fades the rest.
  const [hoverMonth, setHoverMonth] = useState<number | null>(null)
  const open = useRef(openMonth)
  useEffect(() => {
    open.current = openMonth
  })
  const months = useMemo(() => (txs ? byMonth(txs, year) : []), [txs, year])
  const key = (i: number) => `${year}-${String(i + 1).padStart(2, '0')}`

  // Memoized like the donuts: re-rendering the chart on every hover would restart its bar animation.
  const chart = useMemo(() => {
    const short = new Intl.DateTimeFormat(t.locale, { month: 'short' })
    const data = months.map((m, i) => ({ i, name: short.format(new Date(year, i, 1)), income: m.income / 100, expense: m.expense / 100 }))
    const month = (i: number) => `${year}-${String(i + 1).padStart(2, '0')}`
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          barGap={2}
          barCategoryGap="22%"
          onClick={(e) => e?.activeIndex != null && open.current(month(Number(e.activeIndex)))}
          onMouseMove={(e) => setHoverMonth(e?.activeTooltipIndex != null ? Number(e.activeTooltipIndex) : null)}
          onMouseLeave={() => setHoverMonth(null)}
        >
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--chart-ink)', fontSize: 12 }} interval="equidistantPreserveStart" />
          <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: 'var(--chart-ink)', fontSize: 12 }} tickFormatter={(v: number) => money(v * 100, true)} />
          <Tooltip
            cursor={{ fill: 'var(--chart-grid)', opacity: 0.5, className: 'cursor-pointer' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-lg bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                  <div className="mb-1 font-medium">{label}</div>
                  {payload.map((p) => (
                    <div key={String(p.dataKey)} className="num flex items-center gap-2">
                      <span className={`size-2.5 rounded-sm ${p.dataKey === 'income' ? 'bg-income' : 'bg-expense'}`} aria-hidden />
                      <span className="text-zinc-600 dark:text-zinc-400">{p.dataKey === 'income' ? t.income : t.expenses}</span>
                      <span className="ml-auto pl-4 font-medium">{money(Number(p.value) * 100)}</span>
                    </div>
                  ))}
                </div>
              ) : null
            }
          />
          <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} className="cursor-pointer" />
          {/* Same hatch as .bg-expense in colour-blind mode, so the two bars differ by more than colour. */}
          <defs>
            <pattern id="expense-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="5" fill="var(--color-expense)" />
              <rect width="1.5" height="5" fill="var(--card)" />
            </pattern>
          </defs>
          <Bar dataKey="expense" fill={s.colorblind ? 'url(#expense-hatch)' : 'var(--color-expense)'} radius={[4, 4, 0, 0]} className="cursor-pointer" />
        </BarChart>
      </ResponsiveContainer>
    )
  }, [months, year, t, money, s.colorblind])

  const header = (
    <PageHeader title={String(year)}>
      <PeriodNav onPrev={() => setYear(year - 1)} onNext={() => setYear(year + 1)} />
    </PageHeader>
  )
  if (!txs) return header
  if (!txs.length)
    return (
      <>
        {header}
        <Empty title={t.emptyYear} />
      </>
    )

  const total = summarize(txs)
  const active = months.filter((m) => m.income || m.expense).length || 1
  const monthName = (i: number) => new Intl.DateTimeFormat(t.locale, { month: 'long' }).format(new Date(year, i, 1))
  const ids = (kind: 'income' | 'expense') => new Set(cats.filter((c) => c.kind === kind).map((c) => c.id))
  const hovered = hoverMonth === null ? null : String(hoverMonth)

  return (
    <>
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t.income} value={money(total.income)} tone="bg-income" />
        <Stat label={t.expenses} value={money(total.expense)} tone="bg-expense" />
        <Stat label={t.profit} value={money(total.income - total.expense)} />
        <Stat label={t.avgExpense} value={money(roundTo(total.expense / active))} />
      </div>

      <Card
        title={t.trend}
        className="mt-4"
        action={
          <div className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm bg-income" aria-hidden />
              {t.income}
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm bg-expense" aria-hidden />
              {t.expenses}
            </span>
          </div>
        }
      >
        <div className="-ml-2 h-64 sm:h-72">{chart}</div>
      </Card>

      <Card title={t.months} className="mt-4">
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="num w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-600 dark:text-zinc-400">
                <th className="pb-2 font-medium" />
                <Th>{t.income}</Th>
                <Th>{t.expenses}</Th>
                {BUCKETS.map((b) => (
                  <Th key={b}>{t.bucket[b]}</Th>
                ))}
                <Th>{t.profit}</Th>
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => (
                <tr
                  key={i}
                  onClick={() => openMonth(key(i))}
                  className={`cursor-pointer border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${fade(hovered, String(i))} ${
                    m.income || m.expense ? '' : 'text-zinc-400 dark:text-zinc-600'
                  }`}
                >
                  <td className="py-2 pr-4 font-medium first-letter:uppercase">{monthName(i)}</td>
                  <Row s={m} />
                </tr>
              ))}
              <tr className={`border-t-2 border-zinc-200 font-medium dark:border-zinc-700 ${fade(hovered, 'avg')}`}>
                <td className="py-2 pr-4">{t.avg}</td>
                <Row s={divide(total, active)} />
              </tr>
              <tr className={`font-semibold ${fade(hovered, 'sum')}`}>
                <td className="py-2 pr-4">{t.sum}</td>
                <Row s={total} />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {total.expense > 0 && (
          <Card title={t.ratios}>
            <BucketSplit s={total} />
          </Card>
        )}
        {total.expense > 0 && (
          <Card title={t.expenseCategories}>
            <CategoryBars rows={ranked(total.byCategory, ids('expense'), total.expense)} />
          </Card>
        )}
        {total.income > 0 && (
          <Card title={t.incomeCategories}>
            <CategoryBars rows={ranked(total.byCategory, ids('income'), total.income)} />
          </Card>
        )}
      </div>
    </>
  )
}

/** Donut of how the year's spending split across the buckets, each against its target share. */
function BucketSplit({ s }: { s: Summary }) {
  const { t, money, s: settings } = useApp()
  const [hover, setHover] = useState<string | null>(null)
  const pct = new Intl.NumberFormat(t.locale, { style: 'percent', maximumFractionDigits: 1 })
  const data = useMemo(
    () => BUCKETS.filter((b) => s.buckets[b] > 0).map((b) => ({ id: b, name: t.bucket[b], color: `var(--color-${b})`, amount: s.buckets[b] })),
    [s, t],
  )
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
              {money(d.amount)} · {pct.format(d.amount / s.expense)}
            </div>
          </>
        )}
      >
        <span className="text-xs text-zinc-600 dark:text-zinc-400">{t.expenses}</span>
        <span className="num text-lg font-semibold tracking-tight">{money(s.expense, true)}</span>
      </Donut>
      <ul className="grid gap-3">
        {BUCKETS.map((b) => (
          <li key={b} className={`flex items-center gap-3 text-sm ${fade(hover, b)}`}>
            <span className={`size-2.5 shrink-0 rounded-sm ${BUCKET_BG[b]}`} aria-hidden />
            <span className="flex-1 truncate">{t.bucket[b]}</span>
            <span className="num shrink-0">
              {money(s.buckets[b])}
              <span className="ml-2 inline-block w-14 text-right font-medium">{pct.format(s.expense ? s.buckets[b] / s.expense : 0)}</span>
              <span className="ml-2 inline-block w-20 text-right text-zinc-500 dark:text-zinc-400">{t.targetShare(`${settings.ratios[b]}%`)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const Th = ({ children }: { children: React.ReactNode }) => <th className="pb-2 pl-4 text-right font-medium">{children}</th>

function Row({ s }: { s: Summary }) {
  const { money } = useApp()
  const cells = [s.income, s.expense, ...BUCKETS.map((b) => s.buckets[b]), s.income - s.expense]
  return cells.map((v, i) => (
    <td key={i} className={`py-2 pl-4 text-right whitespace-nowrap ${i === cells.length - 1 && v < 0 ? 'text-rose-700 dark:text-rose-400' : ''}`}>
      {money(v)}
    </td>
  ))
}

function divide(s: Summary, n: number): Summary {
  const d = (v: number) => roundTo(v / n)
  return {
    income: d(s.income),
    expense: d(s.expense),
    buckets: { needs: d(s.buckets.needs), wants: d(s.buckets.wants), investments: d(s.buckets.investments) },
    byCategory: new Map(),
  }
}

/** Averages are shown in whole currency units (fillér/cents dropped). */
const roundTo = (minor: number) => Math.round(minor / 100) * 100
