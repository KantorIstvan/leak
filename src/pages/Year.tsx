import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BUCKETS, db, type Bucket } from '../db'
import { byMonth, monthOf, monthScore, ranked, ratiosFor, savingsIncome, summarize, today, type Summary } from '../lib'
import { BUCKET_BG, TIER_TEXT, Button, Card, CategoryBars, Donut, Empty, fade, PageHeader, PeriodNav, PeriodPicker, Stat, useApp, useCatChart, usePhone } from '../ui'
import { ChartLineUp, House, Sparkle, type Icon } from '@phosphor-icons/react'
import { TargetBars, Treemap, YearBars } from '../charts'

export function YearPage({ year, setYear, openMonth, openStory }: { year: number; setYear: (y: number) => void; openMonth: (m: string) => void; openStory: () => void }) {
  const { t, s, money, cats } = useApp()
  const txs = useLiveQuery(() => db.txs.where('date').between(`${year}-01-01`, `${year}-12-31`, true, true).toArray(), [year])
  // The month hovered in the bar chart: the months table keeps its row sharp and fades the rest.
  const [hoverMonth, setHoverMonth] = useState<number | null>(null)
  const phone = usePhone()
  const open = useRef(openMonth)
  useEffect(() => {
    open.current = openMonth
  })
  const fromSavings = useMemo(() => savingsIncome(cats), [cats])
  const months = useMemo(() => (txs ? byMonth(txs, year, fromSavings) : []), [txs, year, fromSavings])
  const key = (i: number) => `${year}-${String(i + 1).padStart(2, '0')}`
  // Only finished months are scored, each with the split it was planned with.
  const scores = months.map((m, i) => (key(i) < monthOf(today()) ? monthScore(m, ratiosFor(s.ratios, s.ratioHistory, key(i))) : null))
  const scored = scores.filter((x) => x !== null)

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
          // Off the plot (over the month labels or the amount axis) Recharts reports no month: keep the last one until
          // the pointer leaves the chart, or the whole table would flash sharp while crossing those strips.
          onMouseMove={(e) => e?.activeTooltipIndex != null && setHoverMonth(Number(e.activeTooltipIndex))}
          onMouseLeave={() => setHoverMonth(null)}
        >
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--chart-ink)', fontSize: 12 }} interval="equidistantPreserveStart" />
          <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: 'var(--chart-ink)', fontSize: 12 }} tickFormatter={(v: number) => money(v * 100, true)} />
          {/* No slide: on WebKitGTK (the Linux app) the tooltip's transform transition puts the faded table rows on GPU
              layers, which draw them brighter and sharper until it ends, so they flashed when the pointer moved after a pause. */}
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: 'var(--chart-grid)', opacity: 0.5, className: 'cursor-pointer' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="bg-panel px-3 py-2 text-sm shadow-[4px_4px_0] ring-1 shadow-ink/10 ring-ink">
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
          <Bar dataKey="income" fill="var(--color-income)" className="cursor-pointer" />
          {/* Same hatch as .bg-expense in colour-blind mode, so the two bars differ by more than colour. */}
          <defs>
            <pattern id="expense-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="5" fill="var(--color-expense)" />
              <rect width="1.5" height="5" fill="var(--card)" />
            </pattern>
          </defs>
          <Bar dataKey="expense" fill={s.colorblind ? 'url(#expense-hatch)' : 'var(--color-expense)'} className="cursor-pointer" />
        </BarChart>
      </ResponsiveContainer>
    )
  }, [months, year, t, money, s.colorblind])

  const header = (
    <PageHeader title={<PeriodPicker title={String(year)} value={String(year)} onChange={(v) => setYear(Number(v))} />}>
      <PeriodNav
        onPrev={() => setYear(year - 1)}
        onNext={() => setYear(year + 1)}
        onToday={year === thisYear() ? undefined : () => setYear(thisYear())}
      />
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

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4 lg:gap-x-10">
        <Stat label={t.income} value={money(total.income)} tone="bg-income" />
        <Stat label={t.expenses} value={money(total.expense)} tone="bg-expense" />
        <Stat label={t.profit} value={money(total.income - total.expense)} />
        <Stat label={t.avgExpense} value={money(roundTo(total.expense / active))} />
      </div>

      {/* The story takes over from the old facts card: a finished year, or December, gets the band that opens it. */}
      {(year < thisYear() || today().slice(5, 7) === '12') && <StoryBand year={year} open={openStory} />}

      {/* Phones: one chart you touch stands in for the bar chart and the wide months table. */}
      {phone ? (
        <Card title={t.trend} className="mt-8">
          <YearBars key={year} year={year} months={months} scores={scores} openMonth={openMonth} />
        </Card>
      ) : (
      <>
      <Card
        title={t.trend}
        className="mt-8"
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

      <Card title={t.months} className="mt-8">
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="num w-full min-w-[700px] text-sm">
            <thead>
              <tr className="text-left text-[11px] tracking-[0.1em] text-zinc-500 uppercase dark:text-zinc-400">
                <th className="pb-2 font-medium" />
                <Th>{t.income}</Th>
                <Th>{t.expenses}</Th>
                {BUCKETS.map((b) => (
                  <Th key={b}>{t.bucket[b]}</Th>
                ))}
                <Th>{t.profit}</Th>
                <Th>{t.scoreShort}</Th>
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
                  <td className={`py-2 pl-4 text-right font-medium ${scores[i] ? TIER_TEXT[scores[i].tier] : ''}`}>{scores[i]?.score ?? '–'}</td>
                </tr>
              ))}
              <tr className={`border-t-2 border-zinc-200 font-medium dark:border-zinc-700 ${fade(hovered, 'avg')}`}>
                <td className="py-2 pr-4">{t.avg}</td>
                <Row s={divide(total, active)} />
                <td className="py-2 pl-4 text-right">{scored.length ? Math.round(scored.reduce((n, x) => n + x.score, 0) / scored.length) : '–'}</td>
              </tr>
              <tr className={`font-semibold ${fade(hovered, 'sum')}`}>
                <td className="py-2 pr-4">{t.sum}</td>
                <Row s={total} />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      </>
      )}

      <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-2 xl:grid-cols-3">
        {total.expense > 0 && (
          <Card title={t.ratios}>
            {phone ? <TargetBars s={total} ratios={s.ratios} /> : <BucketSplit s={total} />}
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

/** The year in a few facts: shown once it is over, or from December on. */
/** The band that opens the year story, in place of the old facts card. */
function StoryBand({ year, open }: { year: number; open: () => void }) {
  const { t } = useApp()
  return (
    <div className="anim-fade mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t-2 border-ink pt-4">
      <div className="min-w-0">
        <h2 className="font-display text-2xl leading-tight tracking-[-0.02em]">{t.recap(year)}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t.story.readyHint}</p>
      </div>
      <Button variant="primary" onClick={open}>
        <Sparkle size={16} weight="fill" />
        {t.story.open}
      </Button>
    </div>
  )
}

/** A bucket's icon, so its treemap tile and list row read like a category's. */
const BUCKET_ICON: Record<Bucket, Icon> = { needs: House, wants: Sparkle, investments: ChartLineUp }

/** Donut of how the year's spending split across the buckets, each against its target share. */
function BucketSplit({ s }: { s: Summary }) {
  const { t, money, s: settings } = useApp()
  const [hover, setHover] = useState<string | null>(null)
  const [chart] = useCatChart()
  const pct = new Intl.NumberFormat(t.locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const data = useMemo(
    () => BUCKETS.filter((b) => s.buckets[b] > 0).map((b) => ({ id: b, name: t.bucket[b], color: `var(--color-${b})`, amount: s.buckets[b] })),
    [s, t],
  )
  return (
    <div className="grid gap-6">
      {chart === 'treemap' ? (
        // The same total line as the category cards, so the three treemaps start on one line.
        <div className="grid gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-medium tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400">{t.sum}</span>
            <span className="num font-display text-2xl leading-none tracking-[-0.02em]">{money(s.expense)}</span>
          </div>
          <Treemap
            rows={[...data].sort((a, b) => b.amount - a.amount).map((d) => ({ id: d.id, amount: d.amount, share: d.amount / s.expense }))}
            active={hover}
            onActive={setHover}
            info={(id) => {
              const d = data.find((x) => x.id === id)
              const b = id as Bucket
              return d && { ...d, icon: BUCKET_ICON[b], hint: `${d.name}: ${money(d.amount)}, ${pct.format(d.amount / s.expense)}, ${t.targetShare(`${settings.ratios[b]}%`)}` }
            }}
          />
        </div>
      ) : (
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
        <span className="num font-display tracking-[-0.02em] text-2xl leading-tight">{money(s.expense, true)}</span>
      </Donut>
      )}
      {/* Under the treemap, the same ranked list as the two category cards beside it, so the three columns match. */}
      {chart === 'treemap' && (
        <ul className="grid gap-3">
          {[...data]
            .sort((a, b) => b.amount - a.amount)
            .map((d) => {
              const b = d.id as Bucket
              const I = BUCKET_ICON[b]
              return (
                <li key={b} className={`flex items-center gap-3 ${fade(hover, b)}`}>
                  <span className="grid size-7 shrink-0 place-items-center" style={{ background: `color-mix(in oklab, ${d.color} 14%, transparent)`, color: d.color }} aria-hidden>
                    <I size={15} weight="duotone" />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate">
                        {d.name}
                        <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">{t.targetShare(`${settings.ratios[b]}%`)}</span>
                      </span>
                      <span className="num shrink-0">
                        {money(d.amount)}
                        <span className="ml-2 inline-block w-14 text-right text-zinc-500 dark:text-zinc-400">{pct.format(d.amount / s.expense)}</span>
                      </span>
                    </div>
                    <div className="anim-grow h-1.5 origin-left" style={{ width: `${Math.max(2, (d.amount / data.reduce((m, x) => Math.max(m, x.amount), 0)) * 100)}%`, background: d.color }} />
                  </div>
                </li>
              )
            })}
        </ul>
      )}
      {chart !== 'treemap' && (
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
      )}
    </div>
  )
}

const Th = ({ children }: { children: React.ReactNode }) => <th className="pb-2 pl-4 text-right font-medium">{children}</th>

function Row({ s }: { s: Summary }) {
  const { money } = useApp()
  const cells = [s.income, s.expense, ...BUCKETS.map((b) => s.buckets[b]), s.income - s.expense]
  return cells.map((v, i) => (
    <td key={i} className={`py-2 pl-4 text-right whitespace-nowrap ${i === cells.length - 1 && v < 0 ? 'text-expense' : ''}`}>
      {money(v)}
    </td>
  ))
}

function divide(s: Summary, n: number): Summary {
  const d = (v: number) => roundTo(v / n)
  return {
    income: d(s.income),
    withdrawn: d(s.withdrawn),
    expense: d(s.expense),
    buckets: { needs: d(s.buckets.needs), wants: d(s.buckets.wants), investments: d(s.buckets.investments) },
    byCategory: new Map(),
  }
}


const thisYear = () => Number(today().slice(0, 4))

/** Averages are shown in whole currency units (fillér/cents dropped). */
const roundTo = (minor: number) => Math.round(minor / 100) * 100
