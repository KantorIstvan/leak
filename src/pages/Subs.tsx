import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from '@phosphor-icons/react'
import { add, remove, syncSubs, update } from '../cloud'
import { BUCKETS, db, type Bucket, type Sub } from '../db'
import { monthOf, parseAmount, shiftMonth, today, toInput } from '../lib'
import { Button, cardCls, CatIcon, CategoryPicker, ConfirmButton, Donut, Empty, DayOfMonthPicker, fade, Field, Form, inputCls, MoneyInput, PageHeader, Roll, Segmented, Sheet, useApp } from '../ui'

export function SubsPage() {
  const { t, money, cat } = useApp()
  const subs = useLiveQuery(() => db.subs.toArray())
  const [editing, setEditing] = useState<Sub | 'new' | null>(null)
  // Hovering a slice fades the other slices and rows; hovering a row only shows that subscription's yearly price.
  const [slice, setSlice] = useState<string | null>(null)
  const [row, setRow] = useState<string | null>(null)
  const hover = slice ?? row
  const total = subs?.reduce((n, s) => n + s.amount, 0) ?? 0
  const slices = useMemo(
    () => [...(subs ?? [])].sort((a, b) => b.amount - a.amount).map((s) => ({ id: s.id, name: s.name, amount: s.amount, color: cat.get(s.categoryId)?.color ?? '#a1a1aa' })),
    [subs, cat],
  )
  const hovered = subs?.find((s) => s.id === hover)

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
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-3">
          <section className={`${cardCls} grid content-start gap-6 pt-3`}>
            <div>
              <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400">
                <span className="size-2 bg-expense" aria-hidden />
                {t.perMonth}
              </div>
              <div className="num mt-2 truncate font-display tracking-[-0.02em] text-[1.75rem] leading-tight sm:text-4xl">{money(total)}</div>
              <div className="num mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{t.perYear(money(total * 12))}</div>
            </div>
            <Donut data={slices} active={slice} onActive={setSlice}>
              <Roll text={hovered?.name ?? t.perYearLabel} className="max-w-32 justify-items-center text-xs text-zinc-600 dark:text-zinc-400" />
              <Roll text={money((hovered?.amount ?? total) * 12, true)} className="num justify-items-center font-display tracking-[-0.02em] text-2xl leading-tight" />
            </Donut>
          </section>
          <ul className={`${cardCls} grid content-start pt-1 lg:col-span-2`}>
            {[...subs]
              .sort((a, b) => a.day - b.day)
              .map((s) => {
                const c = cat.get(s.categoryId)
                return (
                  <li key={s.id} className={`anim-fade-up border-b border-line last:border-0 ${fade(slice, s.id)}`}>
                    <button
                      type="button"
                      onClick={() => setEditing(s)}
                      onPointerEnter={() => setRow(s.id)}
                      onPointerLeave={() => setRow(null)}
                      onFocus={() => setRow(s.id)}
                      onBlur={() => setRow(null)}
                      className={`flex w-full items-center gap-3 px-2 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-accent ${
                        hover === s.id ? 'bg-ink/5' : ''
                      }`}
                    >
                      <CatIcon c={c} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="block truncate text-xs text-zinc-600 dark:text-zinc-400">{[c?.name, t.bucket[s.bucket ?? c?.bucket ?? 'needs'], t.chargedOn(s.day)].filter(Boolean).join(' · ')}</span>
                      </span>
                      <SubAmount amount={s.amount} yearly={hover === s.id} />
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

/** Monthly price that rolls over to the yearly one while its row is hovered. */
function SubAmount({ amount, yearly }: { amount: number; yearly: boolean }) {
  const { t, money } = useApp()
  return (
    <span className="grid shrink-0 justify-items-end">
      <Roll text={money(yearly ? amount * 12 : amount)} className="num justify-items-end text-sm font-semibold" />
      <Roll text={yearly ? t.yearShort : t.monthShort} className="justify-items-end text-xs text-zinc-500 dark:text-zinc-400" />
    </span>
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

  function pickCategory(id: string) {
    setCategoryId(id)
    setBucket(cat.get(id)?.bucket ?? bucket)
  }

  async function submit() {
    const minor = parseAmount(amount)
    setErrors({ name: name.trim() ? undefined : t.nameRequired, amount: minor ? undefined : t.amountInvalid, category: categoryId ? undefined : t.categoryRequired })
    if (!name.trim() || !minor || !categoryId) return
    const data = { name: name.trim(), amount: minor, day, categoryId, bucket }
    if (sub) await update('subs', [sub.id], data)
    // A new subscription is charged starting this month, once its day has come.
    else await add('subs', [{ ...data, lastMonth: shiftMonth(monthOf(today()), -1) }])
    await syncSubs()
    onDone()
  }

  return (
    <Form onSubmit={submit}>
      <Field label={t.name} error={errors.name}>
        <input className={inputCls} autoFocus placeholder="Spotify, YouTube Premium…" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.monthlyAmount} error={errors.amount}>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <DayOfMonthPicker label={t.chargeDay} value={day} onChange={setDay} format={t.chargedOn} />
      </div>
      <CategoryPicker kind="expense" value={categoryId ?? null} onChange={pickCategory} error={errors.category} />
      <div className="grid gap-2">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.bucketLabel}</span>
        <Segmented label={t.bucketLabel} value={bucket} onChange={setBucket} options={BUCKETS.map((b) => ({ value: b, label: t.bucket[b] }))} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {sub ? (
          <ConfirmButton
            label={t.cancelSub}
            onConfirm={async () => {
              await remove('subs', [sub.id]) // past charges stay recorded
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
