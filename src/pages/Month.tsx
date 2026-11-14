import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowsClockwise, CheckCircle, Drop, Equals, Fire, Plus, Receipt, Target, TrendDown, TrendUp, Trophy, XCircle } from '@phosphor-icons/react'
import { db, type Kind, type Tx } from '../db'
import { earned, hitTarget, insights, investedOf, monthOf, monthScore, savingsIncome, plan, ranked, ratiosFor, shiftMonth, summarize, today, type Summary } from '../lib'
import { chargeId } from '../cloud'
import { BUCKET_BG, Button, TIER_TEXT, Card, CatIcon, CategoryBars, PageHeader, PeriodNav, PeriodPicker, Segmented, Stat, useApp, usePhone } from '../ui'
import { SpendPace, Vessels } from '../charts'
import { TxBrowser } from '../TxBrowser'

export function MonthPage({ month, setMonth, onAdd, onEdit }: { month: string; setMonth: (m: string) => void; onAdd: () => void; onEdit: (tx: Tx) => void }) {
  const { t, s, money, cats } = useApp()
  const txs = useLiveQuery(() => db.txs.where('date').between(`${month}-01`, `${month}-31`, true, true).toArray(), [month])
  // The category hovered in the donut; the transaction list highlights its rows.
  const [hover, setHover] = useState<string | null>(null)
  const fromSavings = useMemo(() => savingsIncome(cats), [cats])
  const sum = useMemo(() => txs && summarize(txs, fromSavings), [txs, fromSavings])
  const [pick, setPick] = useState<Kind>('expense')
  const phone = usePhone()
  // The list shows all its rows: it can then run far below the left column, so the cards leave its foot.
  const [listAll, setListAll] = useState(false)
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

      {phone ? (
        // Phones lead with the one number the month is about, then the two it comes from on a single line.
        <section>
          <div className="text-[11px] font-medium tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400">{t.remaining}</div>
          <div className={`num mt-1.5 truncate font-display text-[2.75rem] leading-none tracking-[-0.03em] ${remaining < 0 ? 'text-expense' : ''}`}>{money(remaining)}</div>
          {sum.income > 0 && <div className="num mt-2 text-[13px] text-zinc-500 dark:text-zinc-400">{t.ofIncome(pct(remaining))}</div>}
          <dl className="mt-5 grid grid-cols-2 divide-x divide-line border-y border-line">
            {[
              { label: t.income, value: money(sum.income), tone: 'bg-income', sub: '' },
              { label: t.expenses, value: money(sum.expense), tone: 'bg-expense', sub: sum.income ? pct(sum.expense) : '' },
            ].map((f, i) => (
              <div key={f.label} className={`min-w-0 py-3 ${i ? 'pl-4' : 'pr-4'}`}>
                <dt className="flex items-center gap-2 text-[11px] font-medium tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400">
                  <span className={`size-2 shrink-0 ${f.tone}`} aria-hidden />
                  <span className="truncate">{f.label}</span>
                  {f.sub && <span className="num ml-auto tracking-normal">{f.sub}</span>}
                </dt>
                <dd className={`num mt-1.5 truncate font-display leading-tight tracking-[-0.02em] ${f.value.length > 11 ? 'text-lg' : 'text-[1.375rem]'}`}>{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : (
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
      )}

      {(() => {
        const cards: [string, ReactNode][] = [
          [
            'score',
            <ScoreCard key="score" month={month} txs={txs} sum={sum} fromSavings={fromSavings} />,
          ],
          [
            'plan',
            <Card key="plan" title={t.plan} hint={t.planHint}>
              {earned(sum) <= 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{t.noIncome}</p>
              ) : phone ? (
                <Vessels plans={plan(sum, ratios)} />
              ) : (
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
              )}
            </Card>,
          ],
        ]
        if (limits.length > 0)
          cards.push([
            'limits',
            <Card key="limits" title={t.limits} hint={t.limitsHint}>
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
            </Card>,
          ])
        if (sum[kind] > 0)
          cards.push([
            'category',
            <Card
              key="category"
              title={t.byCategory}
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
            </Card>,
          ])
        const pace = sum.expense > 0 && (
          <Card title={t.pace}>
            <SpendPace month={month} txs={txs} />
          </Card>
        )
        const list = (
          <Card title={t.transactions}>
            <TxBrowser key={month} txs={txs} month={month} onAdd={onAdd} onEdit={onEdit} highlight={hover} onShowAll={setListAll} />
          </Card>
        )
        return (
          <Balanced
            className="mt-8"
            left={pace}
            right={list}
            cards={cards}
            // Only new data, or the list opened to all its rows, splits again. Filters, a search and the
            // Expenses/Income switch never move the cards out from under the pointer.
            layoutKey={`${month}|${txs.length}|${limits.length}|${listAll}`}
            // Below lg one column: the plan right after the pace, the list last.
            narrowOrder={['plan', 'score', 'limits', 'category']}
          />
        )
      })()}
    </>
  )
}

/** The month's score, once it is over, with the reasons behind it and how it is calculated. */
function ScoreCard({ month, txs, sum, fromSavings }: { month: string; txs: Tx[]; sum: Summary; fromSavings: ReadonlySet<string> }) {
  const { t, s, money, cats } = useApp()
  const ratiosAt = (m: string) => ratiosFor(s.ratios, s.ratioHistory, m)
  const ratios = ratiosAt(month)
  const context = useLiveQuery(async () => {
    const [prev, subs, goals] = await Promise.all([
      // Every earlier month, not just a year: a streak can run longer than that.
      db.txs.where('date').below(`${month}-01`).toArray(),
      db.subs.toArray(),
      db.goals.toArray(),
    ])
    return { prev, goals, subCharges: new Set(await Promise.all(subs.map((sub) => chargeId(sub.id, month)))) }
  }, [month])
  const current = monthOf(today())
  const closed = month < current
  // Memoized: hovering the category chart re-renders the whole page, and this reads every earlier transaction.
  const found = useMemo(
    () => (context ? insights({ month, txs, ...context, fromSavings, ratiosAt: (m) => ratiosFor(s.ratios, s.ratioHistory, m), closed, recent: month >= shiftMonth(current, -1) }) : []),
    [context, month, txs, fromSavings, s.ratios, s.ratioHistory, closed, current],
  )
  const result = closed ? monthScore(sum, ratios) : null
  const pct = new Intl.NumberFormat(t.locale, { style: 'percent', maximumFractionDigits: 0 })
  const times = new Intl.NumberFormat(t.locale, { maximumFractionDigits: 1 })
  const name = (id: string) => cats.find((c) => c.id === id)?.name ?? t.uncategorized

  const lines: { icon: keyof typeof Icon; text: string }[] = []
  const income = earned(sum)
  if (income > 0) {
    // One line per half of the score: what the plan asked to invest, then spending against income.
    const invested = investedOf(sum)
    if (ratios.investments) lines.push({ icon: hitTarget(sum, ratios) ? 'ok' : 'bad', text: t.scoreInvested(pct.format(invested / income), `${ratios.investments}%`) })
    // Why that can be less than the Investments bar shows.
    if (sum.withdrawn) lines.push({ icon: 'calm', text: t.scoreWithdrawn(money(sum.withdrawn)) })
    else if (sum.buckets.investments > invested) lines.push({ icon: 'calm', text: t.scoreFromSavings(money(sum.buckets.investments), money(invested)) })
    const saved = income - sum.buckets.needs - sum.buckets.wants
    lines.push(
      saved >= 0
        ? { icon: saved * 5 >= income ? 'ok' : 'calm', text: t.scoreSaved(pct.format(saved / income)) }
        : { icon: 'bad', text: t.scoreOverspent(pct.format(-saved / income)) },
    )
    // Limits are the user's own, not part of the score's method: shown, not scored.
    for (const c of cats) {
      const spent = sum.byCategory.get(c.id) ?? 0
      if (c.kind === 'expense' && c.limit && spent > c.limit) lines.push({ icon: 'bad', text: t.insLimit(c.name, money(spent - c.limit), money(c.limit)) })
    }
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
    <Card title={t.score}>
      {result ? (
        <div className="mb-4 flex items-baseline gap-3">
          <span className={`num font-display tracking-[-0.02em] text-5xl leading-none ${TIER_TEXT[result.tier]}`}>{result.score}</span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">/ 100</span>
          <span className={`ml-auto text-sm font-medium ${TIER_TEXT[result.tier]}`}>{t.tier[result.tier]}</span>
        </div>
      ) : (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">{income > 0 ? t.scorePending : t.scoreNoIncome}</p>
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
      <details className="mt-4 text-sm text-zinc-600 max-md:mt-1 dark:text-zinc-400">
        <summary className="cursor-pointer font-medium text-zinc-700 max-md:py-3 dark:text-zinc-300">{t.scoreHow}</summary>
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

// Tailwind's lg: from here the month has two columns.
const wideQuery = typeof matchMedia === 'undefined' ? null : matchMedia('(min-width: 64rem)')
const onWideChange = (cb: () => void) => {
  wideQuery?.addEventListener('change', cb)
  return () => wideQuery?.removeEventListener('change', cb)
}
const useWide = () => useSyncExternalStore(onWideChange, () => !!wideQuery?.matches)

const GAP = 32 // gap-8

/**
 * Two columns that end level: `left` and `right` head them, and every card goes under whichever
 * split keeps the taller column shortest, so a short list early in the month gets cards beneath it
 * instead of an empty half page. The cards keep their order within a column.
 */
function Balanced({ left, right, cards, layoutKey, narrowOrder, className = '' }: { left: ReactNode; right: ReactNode; cards: [string, ReactNode][]; layoutKey: string; narrowOrder: string[]; className?: string }) {
  const wide = useWide()
  const box = useRef(new Map<string, HTMLElement>())
  const [rightIds, setRightIds] = useState<ReadonlySet<string>>(new Set())
  const bind = (id: string) => (el: HTMLElement | null) => void (el ? box.current.set(id, el) : box.current.delete(id))
  // A string, so the effect reruns when the set of cards changes, not on every new element.
  const idList = cards.map(([id]) => id).join()
  // The columns' width, so a resized window (or a collapsed sidebar) splits again; heights alone never trigger it.
  const grid = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = grid.current
    if (!el) return
    let timer = 0
    const ro = new ResizeObserver(([e]) => {
      clearTimeout(timer)
      timer = window.setTimeout(() => setWidth(Math.round(e.contentRect.width)), 150)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      clearTimeout(timer)
    }
  }, [wide])

  useLayoutEffect(() => {
    if (!wide) return
    const settle = () => {
      const h = (id: string) => box.current.get(id)?.offsetHeight ?? 0
      const order = idList ? idList.split(',') : []
      let best = { mask: 0, tall: Infinity, moved: Infinity }
      for (let mask = 0; mask < 1 << order.length; mask++) {
        let l = h('@left')
        let r = h('@right')
        let moved = 0
        order.forEach((id, i) => {
          if (mask & (1 << i)) {
            r += GAP + h(id)
            moved++
          } else l += (l ? GAP : 0) + h(id)
        })
        const tall = Math.max(l, r)
        // A split has to save real height to move a card off the left.
        if (tall < best.tall - 24 || (Math.abs(tall - best.tall) <= 24 && moved < best.moved)) best = { mask, tall, moved }
      }
      const next = new Set(order.filter((_, i) => best.mask & (1 << i)))
      setRightIds((prev) => (prev.size === next.size && [...next].every((id) => prev.has(id)) ? prev : next))
    }
    settle()
    // Charts size themselves after mount; measure once more when they have.
    const frame = requestAnimationFrame(settle)
    return () => cancelAnimationFrame(frame)
  }, [layoutKey, wide, idList, width])

  if (!wide) {
    const byId = new Map(cards)
    return (
      <div className={`grid gap-y-8 ${className}`}>
        {left}
        {narrowOrder.map((id) => byId.get(id))}
        {right}
      </div>
    )
  }
  const column = (side: 'left' | 'right') => cards.filter(([id]) => rightIds.has(id) === (side === 'right')).map(([id, card]) => (
    <div key={id} ref={bind(id)}>
      {card}
    </div>
  ))
  return (
    <div ref={grid} className={`grid grid-cols-5 items-start gap-x-10 ${className}`}>
      <div className="col-span-2 grid gap-y-8">
        {left && <div ref={bind('@left')}>{left}</div>}
        {column('left')}
      </div>
      <div className="col-span-3 grid gap-y-8">
        <div ref={bind('@right')}>{right}</div>
        {column('right')}
      </div>
    </div>
  )
}
