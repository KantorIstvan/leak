import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from '@phosphor-icons/react'
import { db, type Kind, type Tx } from '../db'
import { plan, ranked, shiftMonth, summarize } from '../lib'
import { BUCKET_BG, Button, Card, CategoryBars, Empty, PageHeader, PeriodNav, Segmented, Stat, useApp } from '../ui'

export function MonthPage({ month, setMonth, onAdd, onEdit }: { month: string; setMonth: (m: string) => void; onAdd: () => void; onEdit: (tx: Tx) => void }) {
  const { t, s, money, cats } = useApp()
  const [filter, setFilter] = useState<'all' | Kind>('all')
  const txs = useLiveQuery(() => db.txs.where('date').between(`${month}-01`, `${month}-31`, true, true).toArray(), [month])

  const [y, m] = month.split('-').map(Number)
  const title = new Intl.DateTimeFormat(t.locale, { year: 'numeric', month: 'long' }).format(new Date(y, m - 1, 1))

  const header = (
    <PageHeader title={title}>
      <PeriodNav onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
      <span className="hidden md:contents">
        <Button variant="primary" onClick={onAdd}>
          <Plus size={16} weight="bold" />
          {t.add}
        </Button>
      </span>
    </PageHeader>
  )

  if (!txs) return header

  const sum = summarize(txs)
  const remaining = sum.income - sum.expense
  const pct = (n: number) => (sum.income ? `${Math.round((n / sum.income) * 100)}%` : '')
  const expenseIds = new Set(cats.filter((c) => c.kind === 'expense').map((c) => c.id))
  const list = txs.filter((tx) => filter === 'all' || tx.kind === filter).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)

  return (
    <>
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat
          className="col-span-2 lg:col-span-1"
          label={t.remaining}
          value={money(remaining)}
          sub={sum.income ? t.ofIncome(pct(remaining)) : undefined}
        />
        <Stat label={t.income} value={money(sum.income)} tone="bg-income" />
        <Stat label={t.expenses} value={money(sum.expense)} sub={sum.income ? t.ofIncome(pct(sum.expense)) : undefined} tone="bg-expense" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title={t.plan} hint={t.planHint} className="lg:col-span-2">
          {sum.income ? (
            <ul className="grid gap-5">
              {plan(sum, s.ratios).map((b) => {
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
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div className={`h-full rounded-full ${b.left < 0 ? 'bg-expense' : BUCKET_BG[b.bucket]}`} style={{ width: `${fill}%` }} />
                    </div>
                    <div className="num mt-1.5 flex justify-between gap-3 text-xs text-zinc-600 dark:text-zinc-400">
                      <span className={b.left < 0 ? 'font-medium text-rose-700 dark:text-rose-400' : ''}>
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

        <Card
          title={t.transactions}
          className="lg:col-span-3 lg:row-span-2"
          action={
            <Segmented
              label={t.transactions}
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: t.all },
                { value: 'expense', label: t.expenses },
                { value: 'income', label: t.income },
              ]}
            />
          }
        >
          {list.length ? (
            <TxList txs={list} onEdit={onEdit} />
          ) : (
            <Empty
              title={t.emptyMonth}
              hint={t.emptyMonthHint}
              action={
                <Button variant="primary" onClick={onAdd}>
                  <Plus size={16} weight="bold" />
                  {t.add}
                </Button>
              }
            />
          )}
        </Card>

        {sum.expense > 0 && (
          <Card title={t.byCategory} className="lg:col-span-2">
            <CategoryBars rows={ranked(sum.byCategory, expenseIds, sum.expense)} />
          </Card>
        )}
      </div>
    </>
  )
}

function TxList({ txs, onEdit }: { txs: Tx[]; onEdit: (tx: Tx) => void }) {
  const { t, cat, money } = useApp()
  const day = new Intl.DateTimeFormat(t.locale, { month: 'short', day: 'numeric' })
  return (
    <ul className="-mx-2 grid">
      {txs.map((tx) => {
        const c = cat.get(tx.categoryId)
        const income = tx.kind === 'income'
        return (
          <li key={tx.id}>
            <button
              type="button"
              onClick={() => onEdit(tx)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-accent dark:hover:bg-zinc-800/60"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: `${c?.color ?? '#a1a1aa'}22` }} aria-hidden>
                <span className="size-3 rounded-full" style={{ background: c?.color ?? '#a1a1aa' }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{tx.note || c?.name}</span>
                <span className="block truncate text-xs text-zinc-600 dark:text-zinc-400">
                  {[tx.note && c?.name, tx.bucket && t.bucket[tx.bucket]].filter(Boolean).join(' · ') || t.kind.income}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`num block text-sm font-semibold `}>
                  {income ? '+' : '−'}
                  {money(tx.amount)}
                </span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">{day.format(new Date(tx.date + 'T00:00'))}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
