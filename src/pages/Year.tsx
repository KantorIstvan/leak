import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BUCKETS, db } from '../db'
import { byMonth, ranked, summarize, type Summary } from '../lib'
import { Card, CategoryBars, Empty, PageHeader, PeriodNav, Stat, useApp } from '../ui'

export function YearPage({ year, setYear, openMonth }: { year: number; setYear: (y: number) => void; openMonth: (m: string) => void }) {
  const { t, money, cats } = useApp()
  const txs = useLiveQuery(() => db.txs.where('date').between(`${year}-01-01`, `${year}-12-31`, true, true).toArray(), [year])

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

  const months = byMonth(txs, year)
  const total = summarize(txs)
  const active = months.filter((m) => m.income || m.expense).length || 1
  const monthName = (i: number, style: 'short' | 'long') => new Intl.DateTimeFormat(t.locale, { month: style }).format(new Date(year, i, 1))
  const key = (i: number) => `${year}-${String(i + 1).padStart(2, '0')}`
  const ids = (kind: 'income' | 'expense') => new Set(cats.filter((c) => c.kind === kind).map((c) => c.id))

  const data = months.map((m, i) => ({ i, name: monthName(i, 'short'), income: m.income / 100, expense: m.expense / 100 }))

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
        <div className="-ml-2 h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} barCategoryGap="22%" onClick={(e) => e?.activeIndex != null && openMonth(key(Number(e.activeIndex)))}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--chart-ink)', fontSize: 12 }} interval={0} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={64}
                tick={{ fill: 'var(--chart-ink)', fontSize: 12 }}
                tickFormatter={(v: number) => money(v * 100, true)}
              />
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
              <Bar dataKey="expense" fill="var(--color-expense)" radius={[4, 4, 0, 0]} className="cursor-pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
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
                  className={`cursor-pointer border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                    m.income || m.expense ? '' : 'text-zinc-400 dark:text-zinc-600'
                  }`}
                >
                  <td className="py-2 pr-4 font-medium first-letter:uppercase">{monthName(i, 'long')}</td>
                  <Row s={m} />
                </tr>
              ))}
              <tr className="border-t-2 border-zinc-200 font-medium dark:border-zinc-700">
                <td className="py-2 pr-4">{t.avg}</td>
                <Row s={divide(total, active)} />
              </tr>
              <tr className="font-semibold">
                <td className="py-2 pr-4">{t.sum}</td>
                <Row s={total} />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
