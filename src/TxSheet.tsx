import { useState, type FormEvent } from 'react'
import { BUCKETS, db, type Bucket, type Kind, type Tx } from './db'
import { DatePicker } from './DatePicker'
import { parseAmount, toInput } from './lib'
import { BUCKET_BG, Button, ConfirmButton, Field, inputCls, Segmented, useApp } from './ui'

export function TxForm({ tx, defaultDate, onDone }: { tx?: Tx; defaultDate: string; onDone: () => void }) {
  const { t, cats, cat } = useApp()
  const [kind, setKind] = useState<Kind>(tx?.kind ?? 'expense')
  const [amount, setAmount] = useState(tx ? toInput(tx.amount) : '')
  const [note, setNote] = useState(tx?.note ?? '')
  const [date, setDate] = useState(tx?.date ?? defaultDate)
  const [categoryId, setCategoryId] = useState<number | null>(tx?.categoryId ?? null)
  const [bucket, setBucket] = useState<Bucket>(tx?.bucket ?? 'needs')
  // The bucket follows the category's default; the picker only shows for exceptions.
  const [customBucket, setCustomBucket] = useState(!!tx?.bucket && tx.bucket !== cat.get(tx.categoryId)?.bucket)
  const [errors, setErrors] = useState<{ amount?: string; category?: string }>({})

  const options = cats.filter((c) => c.kind === kind)

  function pickKind(k: Kind) {
    setKind(k)
    setCategoryId(null)
  }

  function pickCategory(id: number) {
    setCategoryId(id)
    const c = cat.get(id)
    if (c?.kind === 'expense') setBucket(c.bucket)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const minor = parseAmount(amount)
    const errs = { amount: minor ? undefined : t.amountInvalid, category: categoryId ? undefined : t.categoryRequired }
    setErrors(errs)
    if (!minor || !categoryId || !date) return
    const data = { kind, amount: minor, note: note.trim(), date, categoryId, bucket: kind === 'income' ? null : bucket }
    if (tx) await db.txs.update(tx.id, data)
    else await db.txs.add(data as Tx)
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <Segmented
        label={t.kind.expense}
        value={kind}
        onChange={pickKind}
        options={[
          { value: 'expense', label: t.kind.expense },
          { value: 'income', label: t.kind.income },
        ]}
      />

      <Field label={t.amount} error={errors.amount}>
        <input
          className={`${inputCls} num text-lg! font-semibold`}
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={!!errors.amount}
        />
      </Field>

      <DatePicker label={t.date} value={date} onChange={setDate} />

      <Field label={t.note}>
        <input className={inputCls} placeholder={t.notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.category}</legend>
        <div className="flex flex-wrap gap-2">
          {options.map((c) => {
            const on = c.id === categoryId
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => pickCategory(c.id)}
                className={`flex h-9 items-center gap-2 rounded-full px-3 text-sm transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent ${
                  on
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
                {c.name}
              </button>
            )
          })}
        </div>
        {errors.category && <span className="text-xs font-medium text-rose-700 dark:text-rose-400">{errors.category}</span>}
      </fieldset>

      {kind === 'expense' && categoryId && (
        <div className="grid gap-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.bucketLabel}</span>
          {customBucket ? (
            <Segmented label={t.bucketLabel} value={bucket} onChange={setBucket} options={BUCKETS.map((b) => ({ value: b, label: t.bucket[b] }))} />
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-2">
                <span className={`size-2.5 rounded-sm ${BUCKET_BG[bucket]}`} aria-hidden />
                {t.bucket[bucket]}
              </span>
              <button
                type="button"
                onClick={() => setCustomBucket(true)}
                className="font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                {t.change}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        {tx ? (
          <ConfirmButton
            label={t.delete}
            onConfirm={async () => {
              await db.txs.delete(tx.id)
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
