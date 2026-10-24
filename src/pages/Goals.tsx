import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from '@phosphor-icons/react'
import { add, remove, update } from '../cloud'
import { db, type Goal } from '../db'
import { byMonth, parseAmount, summarize, toInput } from '../lib'
import { Button, cardCls, ConfirmButton, Empty, Field, Form, inputCls, MoneyInput, PageHeader, Sheet, useApp } from '../ui'

export function GoalsPage() {
  const { t, money } = useApp()
  const year = new Date().getFullYear()
  const goals = useLiveQuery(() => db.goals.toArray())
  const txs = useLiveQuery(() => db.txs.where('date').between(`${year}-01-01`, `${year}-12-31`, true, true).toArray())
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)

  // Average monthly profit over months that have data this year.
  let avgProfit = 0
  if (txs) {
    const active = byMonth(txs, year).filter((m) => m.income || m.expense).length
    const s = summarize(txs)
    avgProfit = active ? (s.income - s.expense) / active : 0
  }

  return (
    <>
      <PageHeader title={t.goalsTitle}>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus size={16} weight="bold" />
          {t.newGoal}
        </Button>
      </PageHeader>
      <p className="-mt-3 mb-6 max-w-[65ch] text-sm text-zinc-600 dark:text-zinc-400">{t.goalsHint}</p>

      {goals && !goals.length && <Empty title={t.emptyGoals} />}

      <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
        {goals?.map((g) => {
          const left = Math.max(0, g.target - g.saved)
          const pct = g.target ? Math.min(100, (g.saved / g.target) * 100) : 0
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setEditing(g)}
              className={`${cardCls} min-w-0 pt-4 pb-2 text-left transition hover:bg-ink/[0.03] focus-visible:outline-2 focus-visible:outline-accent`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="truncate font-display text-[1.375rem] leading-tight font-medium">{g.name}</h2>
                <span className="num shrink-0 text-sm text-zinc-600 dark:text-zinc-400">{Math.round(pct)}%</span>
              </div>
              <div className="num mt-3 font-display tracking-[-0.02em] text-3xl leading-tight">
                {money(g.saved)} <span className="font-sans text-base tracking-normal text-zinc-500 dark:text-zinc-400">/ {money(g.target)}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden bg-line">
                <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {left === 0 ? t.reached : avgProfit > 0 ? `${t.left(money(left))}, ${t.monthsToGo(Math.ceil(left / avgProfit))}` : t.noEstimate}
              </p>
            </button>
          )
        })}
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? t.newGoal : t.editGoal}>
        {editing && <GoalForm goal={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  )
}

function GoalForm({ goal, onDone }: { goal?: Goal; onDone: () => void }) {
  const { t } = useApp()
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? toInput(goal.target) : '')
  const [saved, setSaved] = useState(goal ? toInput(goal.saved) : '')
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})

  async function submit() {
    const tgt = parseAmount(target)
    // Empty, "0" and "0,00" all mean nothing saved yet.
    const sv = /^[\s0.,]*$/.test(saved) ? 0 : parseAmount(saved)
    const errs = { name: name.trim() ? undefined : t.nameRequired, target: tgt ? undefined : t.amountInvalid, saved: sv === null ? t.amountInvalid : undefined }
    setErrors(errs)
    if (!name.trim() || !tgt || sv === null) return
    const data = { name: name.trim(), target: tgt, saved: sv }
    if (goal) await update('goals', [goal.id], data)
    else await add('goals', [data])
    onDone()
  }

  return (
    <Form onSubmit={submit}>
      <Field label={t.name} error={errors.name}>
        <input className={inputCls} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.target} error={errors.target}>
          <MoneyInput value={target} onChange={setTarget} />
        </Field>
        <Field label={t.saved} error={errors.saved}>
          <MoneyInput value={saved} onChange={setSaved} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {goal ? (
          <ConfirmButton
            label={t.delete}
            onConfirm={async () => {
              await remove('goals', [goal.id])
              onDone()
            }}
          />
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            {t.cancel}
          </Button>
          <Button variant="primary" type="submit">
            {t.save}
          </Button>
        </div>
      </div>
    </Form>
  )
}
