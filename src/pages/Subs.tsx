import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from '@phosphor-icons/react'
import { add, chargeId, remove, syncSubs, undoable, update } from '../cloud'
import { BUCKETS, db, type Bucket, type Category, type Sub } from '../db'
import { convert, rate } from '../fx'
import { formatMoney, monthOf, parseAmount, reviewDue, shiftMonth, today, toInput } from '../lib'
import { CategoryPicker } from './Categories'
import { Button, Card, cardCls, CatIcon, ConfirmButton, CurrencySelect, Donut, Empty, DayOfMonthPicker, fade, Field, Form, inputCls, MoneyInput, PageHeader, Roll, Segmented, Sheet, useApp } from '../ui'

/** Today's rate into `base` for each of `codes`; one that is loading or unavailable is missing. */
function useRates(codes: string[], base: string) {
  const [rates, setRates] = useState(new Map<string, number>())
  const key = [...new Set(codes)].filter((c) => c !== base).sort().join(',')
  useEffect(() => {
    let live = true
    const wanted = key ? key.split(',') : []
    Promise.all(wanted.map((c) => rate(c, base).then((q) => [c, q.rate] as const, () => null))).then((rs) => live && setRates(new Map(rs.filter((r) => r !== null))))
    return () => {
      live = false
    }
  }, [key, base])
  return rates
}

export function SubsPage() {
  const { t, s: settings, money, cat } = useApp()
  const subs = useLiveQuery(() => db.subs.toArray())
  const [editing, setEditing] = useState<Sub | 'new' | null>(null)
  // Hovering a slice fades the other slices and rows; hovering a row only shows that subscription's yearly price.
  const [slice, setSlice] = useState<string | null>(null)
  const [row, setRow] = useState<string | null>(null)
  const hover = slice ?? row
  const foreign = (subs ?? []).filter((s) => s.currency && s.currency !== settings.currency)
  const rates = useRates(
    foreign.map((s) => s.currency!),
    settings.currency,
  )
  // A foreign price counts at today's rate; while that is unknown, as nothing.
  const inBase = useCallback(
    (s: Sub) => (s.currency && s.currency !== settings.currency ? (convert(s.amount, rates.get(s.currency) ?? 0) ?? 0) : s.amount),
    [rates, settings.currency],
  )
  const total = subs?.reduce((n, s) => n + inBase(s), 0) ?? 0
  const slices = useMemo(
    () =>
      (subs ?? [])
        .map((s) => ({ id: s.id, name: s.name, amount: inBase(s), color: cat.get(s.categoryId)?.color ?? '#a1a1aa' }))
        .sort((a, b) => b.amount - a.amount),
    [subs, cat, inBase],
  )
  const hovered = subs?.find((s) => s.id === hover)
  const current = monthOf(today())
  // Up for review: confirmed a year ago, or never confirmed and charged a year ago (found by the charge's fixed id).
  const due = useLiveQuery(async () => {
    const yearAgo = shiftMonth(monthOf(today()), -12)
    const all = await db.subs.toArray()
    const charged = await db.txs.bulkGet(await Promise.all(all.map((sub) => chargeId(sub.id, yearAgo))))
    return all.filter((sub, i) => reviewDue(sub.reviewed, monthOf(today()), !!charged[i]))
  }) ?? []
  const price = (s: Sub, minor: number) => (s.currency && s.currency !== settings.currency ? formatMoney(minor, s.currency, t.locale) : money(minor))

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

      {due.length > 0 && (
        <Card title={t.reviewTitle} hint={t.reviewHint} className="anim-fade mb-8">
          <ul className="grid">
            {due.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-0">
                <CatIcon c={cat.get(s.categoryId)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.name}</span>
                  <span className="num block text-xs text-zinc-600 dark:text-zinc-400">{t.perYear(price(s, s.amount * 12))}</span>
                </span>
                <div className="flex items-center gap-2">
                  <ConfirmButton label={t.cancelSub} onConfirm={() => remove('subs', [s.id])} />
                  <Button onClick={() => update('subs', [s.id], { reviewed: current })}>{t.reviewKeep}</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
              {foreign.length > 0 && <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t.atTodaysRate}</div>}
            </div>
            <Donut data={slices} active={slice} onActive={setSlice}>
              <Roll text={hovered?.name ?? t.perYearLabel} className="max-w-32 justify-items-center text-xs text-zinc-600 dark:text-zinc-400" />
              <Roll text={money((hovered ? inBase(hovered) : total) * 12, true)} className="num justify-items-center font-display tracking-[-0.02em] text-2xl leading-tight" />
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
                      <SubAmount amount={s.amount} currency={s.currency} yearly={hover === s.id} />
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

/** Monthly price, in the currency it is billed in, that rolls over to the yearly one while its row is hovered. */
function SubAmount({ amount, currency, yearly }: { amount: number; currency?: string | null; yearly: boolean }) {
  const { t, s, money } = useApp()
  const show = (minor: number) => (currency && currency !== s.currency ? formatMoney(minor, currency, t.locale) : money(minor))
  return (
    <span className="grid shrink-0 justify-items-end">
      <Roll text={show(yearly ? amount * 12 : amount)} className="num justify-items-end text-sm font-semibold" />
      <Roll text={yearly ? t.yearShort : t.monthShort} className="justify-items-end text-xs text-zinc-500 dark:text-zinc-400" />
    </span>
  )
}

function SubForm({ sub, onDone }: { sub?: Sub; onDone: () => void }) {
  const { t, s, cats, cat } = useApp()
  const options = cats.filter((c) => c.kind === 'expense')
  const [name, setName] = useState(sub?.name ?? '')
  const [amount, setAmount] = useState(sub ? toInput(sub.amount) : '')
  const [currency, setCurrency] = useState(sub?.currency ?? s.currency)
  const [day, setDay] = useState(sub?.day ?? 1)
  const [categoryId, setCategoryId] = useState(sub?.categoryId ?? (options.find((c) => c.name === 'Streaming') ?? options[0])?.id)
  const [bucket, setBucket] = useState<Bucket>(sub?.bucket ?? (categoryId ? cat.get(categoryId)?.bucket : undefined) ?? 'needs')
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})

  function pickCategory(c: Category) {
    setCategoryId(c.id)
    setBucket(c.bucket)
  }

  async function submit() {
    const minor = parseAmount(amount)
    setErrors({ name: name.trim() ? undefined : t.nameRequired, amount: minor ? undefined : t.amountInvalid, category: categoryId ? undefined : t.categoryRequired })
    if (!name.trim() || !minor || !categoryId) return
    // A base-currency price sends no currency, unless it clears one set before.
    const data = { name: name.trim(), amount: minor, day, categoryId, bucket, ...(currency !== s.currency ? { currency } : sub?.currency && { currency: null }) }
    // The charges the save makes undo with it.
    await undoable({ what: sub ? 'edit' : 'add', table: 'subs', n: 1 }, async () => {
      if (sub) await update('subs', [sub.id], data)
      // A new subscription is charged starting this month, once its day has come.
      else await add('subs', [{ ...data, lastMonth: shiftMonth(monthOf(today()), -1) }])
      await syncSubs()
    })
    onDone()
  }

  return (
    <Form onSubmit={submit}>
      <Field label={t.name} error={errors.name}>
        <input className={inputCls} data-autofocus placeholder="Spotify, YouTube Premium…" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* The currency sits beside the field, not inside its <label>: a click on its list would focus the amount. */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Field label={t.monthlyAmount} error={errors.amount}>
              <MoneyInput value={amount} onChange={setAmount} />
            </Field>
          </div>
          <div className="pt-7">
            <CurrencySelect compact label={t.billedIn} value={currency} onChange={setCurrency} />
          </div>
        </div>
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
