import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowsClockwise, CheckCircle, Drop, Equals, Fire, Plus, Receipt, Target, TrendDown, TrendUp, Trophy, XCircle } from '@phosphor-icons/react'
import { db, type Kind, type Tx } from '../db'
import { insights, monthOf, monthScore, plan, ranked, ratiosFor, shiftMonth, summarize, today, type Summary } from '../lib'
import { chargeId } from '../cloud'
import { BUCKET_BG, Button, TIER_TEXT, Card, CatIcon, CategoryBars, PageHeader, PeriodNav, PeriodPicker, Segmented, Stat, useApp } from '../ui'
import { TxBrowser } from '../TxBrowser'

export function MonthPage({ month, setMonth, onAdd, onEdit }: { month: string; setMonth: (m: string) => void; onAdd: () => void; onEdit: (tx: Tx) => void }) {
  const { t, s, money, cats } = useApp()
  const txs = useLiveQuery(() => db.txs.where('date').between(`${month}-01`, `${month}-31`, true, true).toArray(), [month])
  // The category hovered in the donut; the transaction list highlights its rows.
  const [hover, setHover] = useState<string | null>(null)
  const sum = useMemo(() => txs && summarize(txs), [txs])
  const [pick, setPick] = useState<Kind>('expense')
  // Falls back to whichever side has money; the switch only shows when both do.
  const kind = !sum?.income ? 'expense' : !sum.expense ? 'income' : pick
  // Memoized so a hover re-render hands the donut the same data and does not restart its animation.
  const byCategory = useMemo(
    () => (sum ? ranked(sum.byCategory, new Set(cats.filter((c) => c.kind === kind).map((c) => c.id)), sum[kind]) : []),
    [sum, cats, kind],
  )

  const [y, m] = month.split('-').map(Number)
  const title = new Intl.DateTimeFormat(t.locale, { year: 'numeric', month: 'long' }).format(new Date(y, m - 1, 1))

  const header = (
    <PageHeader title={<PeriodPicker title={title} value={month} onChange={setMonth} />}>
      <PeriodNav
        onPrev={() => setMonth(shiftMonth(month, -1))}
        onNext={() => setMonth(shiftMonth(month, 1))}
        onToday={month === monthOf(today()) ? undefined : () => setMonth(monthOf(today()))}
      />
      <span className="hidden md:contents">
        <Button variant="primary" onClick={onAdd}>
          <Plus size={16} weight="bold" />
          {t.add}
        </Button>
      </span>
    </PageHeader>
  )

  if (!txs || !sum) return header

  const remaining = sum.income - sum.expense
  const pct = (n: number) => (sum.income ? `${Math.round((n / sum.income) * 100)}%` : '')
  // The split this month was planned with: changing it later does not rewrite past months.
  const ratios = ratiosFor(s.ratios, s.ratioHistory, month)
  // Most used up first: the one closest to (or furthest over) its limit leads.
  const limits = cats
    .filter((c) => c.kind === 'expense' && c.limit)
    .map((c) => ({ c, spent: sum.byCategory.get(c.id) ?? 0, limit: c.limit! }))
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit)

  return (
    <>
      {header}

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3 lg:gap-x-10">
        <Stat
          className="col-span-2 lg:col-span-1"
          label={t.remaining}
          value={money(remaining)}
          sub={sum.income ? t.ofIncome(pct(remaining)) : undefined}
        />
        <Stat label={t.income} value={money(sum.income)} tone="bg-income" />
        <Stat label={t.expenses} value={money(sum.expense)} sub={sum.income ? t.ofIncome(pct(sum.expense)) : undefined} tone="bg-expense" />
      </div>

      {/* The transactions span all rows; the 1fr row takes their extra height, so the cards above keep their own. */}
      <div className={`mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-5 ${limits.length ? 'lg:grid-rows-[auto_auto_auto_1fr]' : 'lg:grid-rows-[auto_auto_1fr]'}`}>
        <ScoreCard month={month} txs={txs} sum={sum} />

        <Card title={t.plan} hint={t.planHint} className="lg:col-span-2">
          {sum.income ? (
            <ul className="grid gap-5">
              {plan(sum, ratios).map((b) => {
                const fill = b.goal ? Math.min(100, (b.actual / b.goal) * 100) : 100
                return (
                  <li key={b.bucket}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <span className={`size-2.5 rounded-sm ${BUCKET_BG[b.bucket]}`} aria-hidden />
                        {t.bucket[b.bucket]}
                      </span>
                      <span className="num">
                        {money(b.actual)} <span className="text-zinc-500 dark:text-zinc-400">{t.goalOf(money(b.goal))}</span>
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden bg-line">
                      <div className={`h-full ${b.left < 0 ? 'bg-expense' : BUCKET_BG[b.bucket]}`} style={{ width: `${fill}%` }} />
                    </div>
                    <div className="num mt-1.5 flex justify-between gap-3 text-xs text-zinc-600 dark:text-zinc-400">
                      <span className={b.left < 0 ? 'font-medium text-expense' : ''}>
                        {b.left < 0 ? t.over(money(-b.left)) : t.left(money(b.left))}
                      </span>
                      <span>
                        {pct(b.actual) || '0%'} / {b.ratio}%
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{t.noIncome}</p>
          )}
        </Card>

        {limits.length > 0 && (
          <Card title={t.limits} hint={t.limitsHint} className="lg:col-span-2">
            <ul className="grid gap-4">
              {limits.map(({ c, spent, limit }) => (
                <li key={c.id} className="flex items-center gap-3">
                  <CatIcon c={c} size="sm" />
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate">{c.name}</span>
                      <span className="num shrink-0">
                        {money(spent)} <span className="text-zinc-500 dark:text-zinc-400">{t.goalOf(money(limit))}</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden bg-line">
                      <div className={`anim-grow h-full origin-left ${spent > limit ? 'bg-expense' : ''}`} style={{ width: `${Math.min(100, (spent / limit) * 100)}%`, background: spent > limit ? undefined : c.color }} />
                    </div>
                    <span className={`num text-xs ${spent > limit ? 'font-medium text-expense' : 'text-zinc-600 dark:text-zinc-400'}`}>
                      {spent > limit ? t.over(money(spent - limit)) : t.left(money(limit - spent))}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title={t.transactions} className={`lg:col-span-3 lg:row-start-1 lg:col-start-3 ${limits.length ? 'lg:row-span-4' : 'lg:row-span-3'}`}>
          <TxBrowser key={month} txs={txs} month={month} onAdd={onAdd} onEdit={onEdit} highlight={hover} />
        </Card>

        {sum[kind] > 0 && (
          <Card
            title={t.byCategory}
            className="lg:col-span-2 lg:self-start"
            action={
              sum.income > 0 &&
              sum.expense > 0 && (
                <Segmented
                  label={t.kindLabel}
                  value={kind}
                  onChange={setPick}
                  options={[
                    { value: 'expense', label: t.expenses },
                    { value: 'income', label: t.income },
                  ]}
                />
              )
            }
          >
            <CategoryBars rows={byCategory} active={hover} onActive={setHover} />
          </Card>
        )}
      </div>
    </>
  )
}

/** The month's score, once it is over, with the reasons behind it and how it is calculated. */
function ScoreCard({ month, txs, sum }: { month: string; txs: Tx[]; sum: Summary }) {
  const { t, s, money, cats } = useApp()
  const ratiosAt = (m: string) => ratiosFor(s.ratios, s.ratioHistory, m)
  const ratios = ratiosAt(month)
  const context = useLiveQuery(async () => {
    const [prev, subs, goals] = await Promise.all([
      db.txs.where('date').between(`${shiftMonth(month, -12)}-01`, `${shiftMonth(month, -1)}-31`, true, true).toArray(),
      db.subs.toArray(),
      db.goals.toArray(),
    ])
    return { prev, goals, subCharges: new Set(await Promise.all(subs.map((sub) => chargeId(sub.id, month)))) }
  }, [month])
  const current = monthOf(today())
  const closed = month < current
  const result = closed ? monthScore(sum, ratios) : null
  const pct = new Intl.NumberFormat(t.locale, { style: 'percent', maximumFractionDigits: 0 })
  const times = new Intl.NumberFormat(t.locale, { maximumFractionDigits: 1 })
  const name = (id: string) => cats.find((c) => c.id === id)?.name ?? t.uncategorized

  const lines: { icon: keyof typeof Icon; text: string }[] = []
  if (sum.income) {
    const saved = sum.income - sum.buckets.needs - sum.buckets.wants
    lines.push({
      icon: saved * 100 >= sum.income * ratios.investments ? 'ok' : 'bad',
      text: saved >= 0 ? t.scoreSaved(pct.format(saved / sum.income), `${ratios.investments}%`) : t.scoreOverspent(pct.format(-saved / sum.income)),
    })
    // Limits are the user's own, not part of the score's method: shown, not scored.
    for (const c of cats) {
      const spent = sum.byCategory.get(c.id) ?? 0
      if (c.kind === 'expense' && c.limit && spent > c.limit) lines.push({ icon: 'bad', text: t.insLimit(c.name, money(spent - c.limit), money(c.limit)) })
    }
    const found = context ? insights({ month, txs, ...context, ratiosAt, closed, recent: month >= shiftMonth(current, -1) }) : []
    for (const i of found) {
      if (i.kind === 'spike') lines.push({ icon: 'spike', text: t.insSpike(name(i.categoryId), money(i.amount), times.format(i.amount / i.avg), money(i.avg), i.better) })
      if (i.kind === 'drop') lines.push({ icon: 'drop', text: t.insDrop(name(i.categoryId), money(i.amount), pct.format(1 - i.amount / i.avg), money(i.avg)) })
      if (i.kind === 'leak') lines.push({ icon: 'leak', text: t.insLeak(name(i.categoryId), i.count, money(i.amount)) })
      if (i.kind === 'biggest') lines.push({ icon: 'biggest', text: t.insBiggest(i.note || name(i.categoryId), money(i.amount), pct.format(i.share)) })
      if (i.kind === 'streak') lines.push({ icon: 'streak', text: t.insStreak(i.months) })
      if (i.kind === 'best') lines.push({ icon: 'best', text: t.insBest })
      if (i.kind === 'subs') lines.push({ icon: 'subs', text: t.insSubs(money(i.amount), pct.format(i.share)) })
      if (i.kind === 'goal') lines.push({ icon: 'goal', text: t.insGoal(i.name, i.months) })
    }
    if (context && !found.length) lines.push({ icon: 'calm', text: t.insNothing })
  }

  return (
    <Card title={t.score} className="lg:col-span-2">
      {result ? (
        <div className="mb-4 flex items-baseline gap-3">
          <span className={`num font-display tracking-[-0.02em] text-5xl leading-none ${TIER_TEXT[result.tier]}`}>{result.score}</span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">/ 100</span>
          <span className={`ml-auto text-sm font-medium ${TIER_TEXT[result.tier]}`}>{t.tier[result.tier]}</span>
        </div>
      ) : (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">{sum.income ? t.scorePending : t.scoreNoIncome}</p>
      )}
      {lines.length > 0 && (
        <ul className="grid gap-2 text-sm">
          {lines.map((l, i) => {
            const I = Icon[l.icon]
            return (
              <li key={i} className="flex gap-2">
                <I size={18} weight="fill" className={`mt-px shrink-0 ${tone[l.icon]}`} aria-hidden />
                <span className="num">{l.text}</span>
              </li>
            )
          })}
        </ul>
      )}
      <details className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-300">{t.scoreHow}</summary>
        <div className="mt-2 grid gap-2">
          {t.scoreMethod.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <p className="text-xs">{t.scoreSources}</p>
        </div>
      </details>
    </Card>
  )
}

// One icon per kind of line: green for what went well, red for what cost points, grey for plain facts.
const Icon = { ok: CheckCircle, bad: XCircle, spike: TrendUp, drop: TrendDown, leak: Drop, biggest: Receipt, streak: Fire, best: Trophy, subs: ArrowsClockwise, goal: Target, calm: Equals }
const tone: Record<keyof typeof Icon, string> = {
  ok: 'text-emerald-700 dark:text-emerald-400',
  bad: 'text-rose-700 dark:text-rose-400',
  spike: 'text-rose-700 dark:text-rose-400',
  drop: 'text-emerald-700 dark:text-emerald-400',
  leak: 'text-rose-700 dark:text-rose-400',
  biggest: 'text-zinc-500 dark:text-zinc-400',
  streak: 'text-emerald-700 dark:text-emerald-400',
  best: 'text-emerald-700 dark:text-emerald-400',
  subs: 'text-zinc-500 dark:text-zinc-400',
  goal: 'text-zinc-500 dark:text-zinc-400',
  calm: 'text-zinc-500 dark:text-zinc-400',
}
