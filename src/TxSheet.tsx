import { useId, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { add, remove, update } from './cloud'
import { BUCKETS, db, type Bucket, type Kind, type Tx } from './db'
import { DatePicker } from './DatePicker'
import { parseAmount, suggestNote, toInput } from './lib'
import { BUCKET_BG, Button, CategoryPicker, ConfirmButton, Field, Form, inputCls, MoneyInput, Segmented, useApp } from './ui'

export function TxForm({ tx, defaultDate, onDone }: { tx?: Tx; defaultDate: string; onDone: () => void }) {
  const { t, cat } = useApp()
  const [kind, setKind] = useState<Kind>(tx?.kind ?? 'expense')
  const [amount, setAmount] = useState(tx ? toInput(tx.amount) : '')
  const [note, setNote] = useState(tx?.note ?? '')
  const [date, setDate] = useState(tx?.date ?? defaultDate)
  const [categoryId, setCategoryId] = useState<string | null>(tx?.categoryId ?? null)
  const [bucket, setBucket] = useState<Bucket>(tx?.bucket ?? 'needs')
  // The bucket follows the category's default; the picker only shows for exceptions.
  const [customBucket, setCustomBucket] = useState(!!tx?.bucket && tx.bucket !== cat.get(tx.categoryId)?.bucket)
  const [errors, setErrors] = useState<{ amount?: string; category?: string }>({})
  // Earlier notes complete the description inline: the rest shows faded after the caret, Tab takes it.
  // ponytail: reads every tx per open form, fine for a personal ledger; aggregate notes if it ever lags
  const txs = useLiveQuery(() => db.txs.toArray())
  const hint = txs && suggestNote(txs, note, kind)
  const ghost = hint?.note.slice(note.length) ?? ''
  const hintId = useId()

  function pickKind(k: Kind) {
    setKind(k)
    setCategoryId(null)
  }

  function pickCategory(id: string) {
    setCategoryId(id)
    const c = cat.get(id)
    if (c?.kind === 'expense') setBucket(c.bucket)
  }

  function acceptHint() {
    if (!hint) return
    setNote(hint.note)
    if (!categoryId && cat.get(hint.categoryId)) pickCategory(hint.categoryId)
  }

  async function submit() {
    const minor = parseAmount(amount)
    const errs = { amount: minor ? undefined : t.amountInvalid, category: categoryId ? undefined : t.categoryRequired }
    setErrors(errs)
    if (!minor || !categoryId || !date) return
    const data = { kind, amount: minor, note: note.trim(), date, categoryId, bucket: kind === 'income' ? null : bucket }
    if (tx) await update('txs', [tx.id], data)
    else await add('txs', [data])
    onDone()
  }

  return (
    <Form onSubmit={submit}>
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
        <MoneyInput className="text-lg! font-semibold" autoFocus value={amount} onChange={setAmount} aria-invalid={!!errors.amount} />
      </Field>

      <DatePicker label={t.date} value={date} onChange={setDate} />

      <Field label={t.note}>
        <div className="relative">
          <input
            className={`peer ${inputCls}`}
            placeholder={t.notePlaceholder}
            autoComplete="off"
            aria-describedby={ghost ? hintId : undefined}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              const el = e.currentTarget
              const atEnd = el.selectionStart === note.length && el.selectionEnd === note.length
              const take = (e.key === 'Tab' && !e.shiftKey) || (e.key === 'ArrowRight' && atEnd)
              // A note wider than the box scrolls the ghost out of sight: never complete blind.
              if (ghost && take && !e.ctrlKey && !e.altKey && !e.metaKey && el.scrollWidth <= el.clientWidth) {
                e.preventDefault()
                acceptHint()
              }
            }}
          />
          {hint && ghost && (
            <>
              {/* Shown only while the field has focus; the typed part is an invisible spacer so the rest lines up after it. */}
              <div aria-hidden className="pointer-events-none absolute inset-0 hidden items-center overflow-hidden px-3 text-base whitespace-pre peer-focus:flex sm:text-sm">
                <span className="invisible">{note}</span>
                <span className="pointer-events-auto mr-2 cursor-pointer text-zinc-500" onMouseDown={(e) => e.preventDefault()} onClick={acceptHint}>
                  {ghost}
                </span>
                <kbd className="ml-auto shrink-0 rounded-md px-1.5 py-0.5 font-sans text-xs font-medium text-zinc-500 ring-1 ring-zinc-300 pointer-coarse:hidden dark:text-zinc-400 dark:ring-zinc-700">
                  Tab
                </kbd>
              </div>
              <span id={hintId} className="sr-only">
                Tab: {hint.note}
              </span>
            </>
          )}
        </div>
      </Field>

      <CategoryPicker kind={kind} value={categoryId} onChange={pickCategory} error={errors.category} />

      {kind === 'expense' && categoryId && (
        <div className="anim-fade grid gap-2">
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
              await remove('txs', [tx.id])
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
