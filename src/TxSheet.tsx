import { useEffect, useId, useMemo, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { add, remove, update } from './cloud'
import { BUCKETS, db, type Bucket, type Kind, type Tx } from './db'
import { DatePicker } from './DatePicker'
import { convert, parseRate, rate, type Quote } from './fx'
import { cleanTag, fold, parseAmount, sameTag, suggestNote, tagTotals, toInput } from './lib'
import { BUCKET_BG, Button, CategoryPicker, ConfirmButton, CurrencySelect, Field, Form, inputCls, MoneyInput, popCls, Segmented, useApp } from './ui'

/** The rate from `from` into `to` on `day`, 'loading' until it is in; null for the same currency. */
function useQuote(from: string, to: string, day: string) {
  const key = `${from}|${to}|${day}`
  const [got, setGot] = useState<{ key: string; quote: Quote | 'failed' } | null>(null)
  useEffect(() => {
    if (from === to) return
    let live = true
    rate(from, to, day).then(
      (quote) => live && setGot({ key, quote }),
      () => live && setGot({ key, quote: 'failed' }),
    )
    return () => {
      live = false
    }
  }, [from, to, day, key])
  return from === to ? null : got?.key === key ? got.quote : 'loading'
}

export function TxForm({ tx, defaultDate, onDone }: { tx?: Tx; defaultDate: string; onDone: () => void }) {
  const { t, s, cat, money } = useApp()
  const paid = tx?.origCurrency && tx.origAmount ? { currency: tx.origCurrency, amount: tx.origAmount } : null // what a foreign tx cost in its currency
  const [kind, setKind] = useState<Kind>(tx?.kind ?? 'expense')
  const [currency, setCurrency] = useState(paid?.currency ?? s.currency)
  const [amount, setAmount] = useState(tx ? toInput(paid?.amount ?? tx.amount) : '')
  const rateText = (r: number) => new Intl.NumberFormat(t.locale, { maximumSignificantDigits: 6, useGrouping: false }).format(r)
  // A rate typed by hand (or the one a saved foreign tx was converted at); null follows the day's published rate.
  const [ownRate, setOwnRate] = useState<string | null>(paid ? rateText(tx!.amount / paid.amount) : null)
  const [note, setNote] = useState(tx?.note ?? '')
  const [tags, setTags] = useState<string[]>(tx?.tags ?? [])
  const [tagText, setTagText] = useState('')
  const [date, setDate] = useState(tx?.date ?? defaultDate)
  const foreign = currency !== s.currency
  const quote = useQuote(currency, s.currency, date)
  const dayRate = typeof quote === 'object' && quote ? quote.rate : null
  const effRate = ownRate === null ? dayRate : parseRate(ownRate)
  const minorNow = parseAmount(amount)
  const preview = foreign && minorNow && effRate ? convert(minorNow, effRate) : null
  const [categoryId, setCategoryId] = useState<string | null>(tx?.categoryId ?? null)
  const [bucket, setBucket] = useState<Bucket>(tx?.bucket ?? 'needs')
  // The bucket follows the category's default; the picker only shows for exceptions.
  const [customBucket, setCustomBucket] = useState(!!tx?.bucket && tx.bucket !== cat.get(tx.categoryId)?.bucket)
  const [errors, setErrors] = useState<{ amount?: string; category?: string; rate?: string }>({})
  // Earlier notes complete the description inline: the rest shows faded after the caret, Tab takes it.
  // ponytail: reads every tx per open form, fine for a personal ledger; aggregate notes if it ever lags
  const txs = useLiveQuery(() => db.txs.toArray())
  const hint = txs && suggestNote(txs, note, kind)
  const ghost = hint?.note.slice(note.length) ?? ''
  const hintId = useId()
  const tagListId = useId()
  const knownTags = useMemo(() => tagTotals(txs ?? []).map((x) => x.tag), [txs])
  // Earlier tags not on this tx yet that contain what is typed, in our own list (the OS <datalist> ignores the theme).
  const [tagOpen, setTagOpen] = useState(false)
  const [tagAt, setTagAt] = useState(-1) // -1: nothing highlighted, so Enter adds what is typed
  const tagHints = knownTags.filter((g) => !tags.some((x) => sameTag(x, g)) && fold(g).includes(fold(cleanTag(tagText))))
  const pickTag = tagOpen ? tagHints[tagAt] : undefined
  /** The tags with what is still typed in the field added. */
  const withTyped = () => {
    const typed = cleanTag(tagText)
    return typed && !tags.some((g) => sameTag(g, typed)) ? [...tags, typed] : tags
  }
  /** Adds `g` (already clean) unless it is there, and empties the field. */
  function addTag(g: string) {
    if (g && !tags.some((x) => sameTag(x, g))) setTags([...tags, g])
    setTagText('')
    setTagOpen(false)
    setTagAt(-1)
  }

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

  // A new day or currency means a new published rate, so a hand-typed one no longer applies.
  function pickDate(d: string) {
    setDate(d)
    setOwnRate(null)
  }

  function pickCurrency(c: string) {
    setCurrency(c)
    setOwnRate(null)
  }

  async function submit() {
    const minor = parseAmount(amount)
    // Saved before the rate came in: wait for it (it is cached, so usually there already).
    const r = !foreign ? 1 : ownRate !== null ? parseRate(ownRate) : (await rate(currency, s.currency, date).catch(() => null))?.rate
    const base = minor && r ? convert(minor, r) : null
    const errs = {
      amount: minor && (base || !r) ? undefined : t.amountInvalid,
      rate: r ? undefined : t.rateInvalid,
      category: categoryId ? undefined : t.categoryRequired,
    }
    setErrors(errs)
    if (!base || !categoryId || !date) return
    const allTags = withTyped()
    const data = {
      kind,
      amount: base,
      // A base-currency tx sends no original amount, unless it clears one it had.
      ...(foreign ? { origAmount: minor, origCurrency: currency } : paid && { origAmount: null, origCurrency: null }),
      note: note.trim(),
      // No tags send no field, unless it clears ones the tx had.
      ...(allTags.length ? { tags: allTags } : tx?.tags?.length && { tags: null }),
      date,
      categoryId,
      bucket: kind === 'income' ? null : bucket,
    }
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

      {/* The currency sits beside the field, not inside its <label>: a click on its list would focus the amount. */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Field label={t.amount} error={errors.amount}>
            <MoneyInput className="text-lg! font-semibold" data-autofocus value={amount} onChange={setAmount} aria-invalid={!!errors.amount} />
          </Field>
        </div>
        <div className="pt-7">
          <CurrencySelect compact label={t.paidIn} value={currency} onChange={pickCurrency} />
        </div>
      </div>

      <DatePicker label={t.date} value={date} onChange={pickDate} />

      {foreign && (
        <div className="anim-fade grid gap-2">
          <Field
            label={t.rate(currency, s.currency)}
            error={errors.rate}
            hint={
              ownRate !== null
                ? t.rateOwn
                : quote === 'failed'
                  ? t.rateFailed
                  : typeof quote === 'object' && quote
                    ? t.rateOf(new Intl.DateTimeFormat(t.locale, { dateStyle: 'medium' }).format(new Date(`${quote.date}T00:00`)))
                    : t.rateLoading
            }
          >
            <input
              inputMode="decimal"
              autoComplete="off"
              className={`${inputCls} num`}
              placeholder={quote === 'loading' ? t.rateLoading : undefined}
              value={ownRate ?? (dayRate ? rateText(dayRate) : '')}
              onChange={(e) => setOwnRate(e.target.value)}
              aria-invalid={!!errors.rate}
            />
          </Field>
          <div className="flex min-h-6 items-center justify-between gap-3 text-sm">
            <span className="num font-medium">{preview && t.converted(money(preview))}</span>
            {ownRate !== null && quote !== 'failed' && (
              <button
                type="button"
                onClick={() => setOwnRate(null)}
                className="font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                {t.rateDay}
              </button>
            )}
          </div>
        </div>
      )}

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

      <div className="grid gap-2">
        <label htmlFor={tagListId + 'in'} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {t.tags}
        </label>
        <div className="relative flex flex-wrap items-center gap-1.5 border-b border-ink px-1 py-1.5 focus-within:bg-ink/5">
          {tags.map((g) => (
            <button
              key={g}
              type="button"
              aria-label={t.removeTag(g)}
              onClick={() => setTags(tags.filter((x) => x !== g))}
              className="flex h-7 items-center gap-1 bg-ink/10 px-2 text-sm font-medium transition hover:bg-ink/20 active:scale-95 focus-visible:outline-2 focus-visible:outline-accent"
            >
              #{g}
              <X size={12} weight="bold" aria-hidden />
            </button>
          ))}
          <input
            id={tagListId + 'in'}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={tagOpen && tagHints.length > 0}
            aria-controls={tagListId}
            aria-activedescendant={pickTag ? `${tagListId}-${tagAt}` : undefined}
            autoComplete="off"
            className="h-8 min-w-32 flex-1 bg-transparent px-2 text-base text-zinc-900 placeholder:text-zinc-500 focus:outline-none sm:text-sm dark:text-zinc-100"
            placeholder={tags.length ? undefined : t.tagsPlaceholder}
            value={tagText}
            onChange={(e) => {
              setTagText(e.target.value)
              setTagOpen(true)
              setTagAt(-1)
            }}
            onClick={() => setTagOpen(true)}
            onBlur={() => addTag(cleanTag(tagText))}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                setTagOpen(true)
                setTagAt(e.key === 'ArrowDown' ? Math.min(tagAt + 1, tagHints.length - 1) : Math.max(tagAt - 1, -1))
              } else if (e.key === 'Escape' && tagOpen && tagHints.length) {
                // Esc closes the list, not the dialog the field sits in.
                e.preventDefault()
                e.stopPropagation()
                setTagOpen(false)
              } else if ((e.key === 'Enter' || e.key === ',') && (pickTag || tagText.trim())) {
                e.preventDefault()
                addTag(pickTag ?? cleanTag(tagText))
              }
              if (e.key === 'Backspace' && !tagText && tags.length) setTags(tags.slice(0, -1))
            }}
          />
          {tagOpen && tagHints.length > 0 && (
            <ul id={tagListId} role="listbox" aria-label={t.tags} className={`${popCls} inset-x-0 top-full max-h-60 overflow-y-auto`}>
              {tagHints.map((g, i) => (
                <li
                  key={g}
                  id={`${tagListId}-${i}`}
                  role="option"
                  aria-selected={i === tagAt}
                  ref={i === tagAt ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                  onPointerMove={() => setTagAt(i)}
                  onMouseDown={(e) => e.preventDefault()} // keep focus in the field, so its blur does not add the half-typed text
                  onClick={() => addTag(g)}
                  className={`cursor-pointer px-3 py-2 text-sm ${i === tagAt ? 'bg-ink/5 shadow-[inset_2px_0_0_var(--color-ink)]' : ''}`}
                >
                  #{g}
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">{t.tagsHint}</span>
      </div>

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
