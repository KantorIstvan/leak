import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from '@phosphor-icons/react'
import { BUCKETS, db, type Bucket, type Sub, type Tx } from '../db'
import { dueDates, monthOf, parseAmount, shiftMonth, today, toInput } from '../lib'
import { Button, CatIcon, CategoryPicker, ConfirmButton, Empty, DayOfMonthPicker, Field, inputCls, MoneyInput, PageHeader, Segmented, Sheet, Stat, useApp } from '../ui'

/** Turns every subscription charge owed up to the current month into a real transaction. */
export async function syncSubs() {
  const current = monthOf(today())
  // One rw transaction, so overlapping calls (StrictMode, focus) never double-charge.
  await db.transaction('rw', [db.subs, db.txs, db.categories], async () => {
    for (const sub of await db.subs.toArray()) {
      const dates = dueDates(sub.lastMonth, current, sub.day)
      if (!dates.length) continue
      const bucket = sub.bucket ?? (await db.categories.get(sub.categoryId))?.bucket ?? 'needs'
      await db.txs.bulkAdd(dates.map((date) => ({ date, amount: sub.amount, kind: 'expense', categoryId: sub.categoryId, bucket, note: sub.name }) as Tx))
      await db.subs.update(sub.id, { lastMonth: current })
    }
  })
}

export function SubsPage() {
  const { t, money, cat } = useApp()
  const subs = useLiveQuery(() => db.subs.toArray())
  const [editing, setEditing] = useState<Sub | 'new' | null>(null)
  const total = subs?.reduce((n, s) => n + s.amount, 0) ?? 0

  return (
    <>
      <PageHeader title={t.subsTitle}>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus size={16} weight="bold" />
          {t.newSub}
        </Button>
      </PageHeader>
      <p className="-mt-3 mb-6 max-w-[65ch] text-sm text-zinc-600 dark:text-zinc-400">{t.subsHint}</p>

      {subs && !subs.length && <Empty title={t.emptySubs} />}

      {!!subs?.length && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Stat label={t.perMonth} value={money(total)} sub={t.perYear(money(total * 12))} tone="bg-expense" />
          <ul className="grid content-start rounded-2xl bg-white p-3 ring-1 ring-zinc-200/80 lg:col-span-2 dark:bg-zinc-900 dark:ring-zinc-800">
            {[...subs]
              .sort((a, b) => a.day - b.day)
              .map((s) => {
                const c = cat.get(s.categoryId)
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(s)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-accent dark:hover:bg-zinc-800/60"
                    >
                      <CatIcon c={c} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="block truncate text-xs text-zinc-600 dark:text-zinc-400">{[c?.name, t.bucket[s.bucket ?? c?.bucket ?? 'needs'], t.chargedOn(s.day)].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="num shrink-0 text-sm font-semibold">{money(s.amount)}</span>
                    </button>
                  </li>
                )
              })}
          </ul>
        </div>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? t.newSub : t.editSub}>
        {editing && <SubForm sub={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  )
}

function SubForm({ sub, onDone }: { sub?: Sub; onDone: () => void }) {
  const { t, cats, cat } = useApp()
  const options = cats.filter((c) => c.kind === 'expense')
  const [name, setName] = useState(sub?.name ?? '')
  const [amount, setAmount] = useState(sub ? toInput(sub.amount) : '')
  const [day, setDay] = useState(sub?.day ?? 1)
  const [categoryId, setCategoryId] = useState(sub?.categoryId ?? (options.find((c) => c.name === 'Streaming') ?? options[0])?.id)
  const [bucket, setBucket] = useState<Bucket>(sub?.bucket ?? (categoryId ? cat.get(categoryId)?.bucket : undefined) ?? 'needs')
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})

  function pickCategory(id: number) {
    setCategoryId(id)
    setBucket(cat.get(id)?.bucket ?? bucket)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const minor = parseAmount(amount)
    setErrors({ name: name.trim() ? undefined : t.nameRequired, amount: minor ? undefined : t.amountInvalid })
    if (!name.trim() || !minor || !categoryId) return
    const data = { name: name.trim(), amount: minor, day, categoryId, bucket }
    if (sub) await db.subs.update(sub.id, data)
    // A new subscription is charged starting this month.
    else await db.subs.add({ ...data, lastMonth: shiftMonth(monthOf(today()), -1) } as Sub)
    await syncSubs()
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <Field label={t.name} error={errors.name}>
        <input className={inputCls} autoFocus placeholder="Spotify, YouTube Premium…" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.monthlyAmount} error={errors.amount}>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <DayOfMonthPicker label={t.chargeDay} value={day} onChange={setDay} format={t.chargedOn} />
      </div>
      <CategoryPicker kind="expense" value={categoryId ?? null} onChange={pickCategory} />
      <div className="grid gap-2">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.bucketLabel}</span>
        <Segmented label={t.bucketLabel} value={bucket} onChange={setBucket} options={BUCKETS.map((b) => ({ value: b, label: t.bucket[b] }))} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {sub ? (
          <ConfirmButton
            label={t.cancelSub}
            onConfirm={async () => {
              await db.subs.delete(sub.id) // past charges stay recorded
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
    </form>
  )
}
