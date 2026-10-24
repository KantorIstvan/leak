import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, CheckSquare, FunnelSimple, Hash, PencilSimple, Plus, SortAscending, X } from '@phosphor-icons/react'
import { remove, undoable, update } from './cloud'
import { BUCKETS, db, type Bucket, type Kind, type Tx } from './db'
import { DatePicker } from './DatePicker'
import { cleanTag, EMPTY_QUERY, filterCount, formatMoney, parseAmount, queryTxs, sameTag, tagTotals, type TxQuery, type TxSort } from './lib'
import { ICONS } from './icons'
import {
  Amount, BUCKET_BG, Button, CatIcon, fade, CategoryPicker, chipCls, ConfirmButton, Empty, Field, inputCls, MoneyInput, SearchInput, Segmented, Select, Sheet, ShowMore, Switch, useApp, useMonthlyIncome,
} from './ui'

const SORTS: TxSort[] = ['date-desc', 'date-asc', 'amount-desc', 'amount-asc', 'category', 'note']
/** Rows shown before the list is expanded: about as tall as the month page's left column. */
const TX_MAX = 15
/** Tag chips shown above the list. */
const TAGS_MAX = 8

/** The month's transaction list with search, filters, sorting and multi-select bulk editing. */
export function TxBrowser({
  txs,
  month,
  onAdd,
  onEdit,
  highlight,
}: {
  txs: Tx[]
  month: string
  onAdd: () => void
  onEdit: (tx: Tx) => void
  highlight?: string | null // category whose rows stand out, the rest fade
}) {
  const { t, cat, money } = useApp()
  const [q, setQ] = useState<TxQuery>(EMPTY_QUERY)
  const [minText, setMinText] = useState('')
  const [maxText, setMaxText] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState<Set<string> | null>(null) // null = not selecting
  const [bulk, setBulk] = useState(false)
  const [allMonths, setAllMonths] = useState(false)
  const tags = useMemo(() => tagTotals(txs).slice(0, TAGS_MAX), [txs])
  // Searching one #tag also totals and lists it over every month: a trip or a renovation rarely fits in one.
  const words = q.text.trim().split(/\s+/)
  const tag = words.length === 1 && words[0].startsWith('#') ? cleanTag(words[0]) || null : null
  const everywhere = useLiveQuery(async () => {
    if (!tag) return undefined
    const tagged = await db.txs.filter((tx) => !!tx.tags?.some((g) => sameTag(g, tag))).toArray()
    const total = tagTotals(tagged).find((x) => sameTag(x.tag, tag))
    return total && { ...total, txs: tagged }
  }, [tag])
  const catName = (id: string) => cat.get(id)?.name ?? ''

  const query = { ...q, min: parseAmount(minText), max: parseAmount(maxText) }
  const list = queryTxs(txs, query, catName)
  const active = filterCount(query)
  const narrowed = active > 0 || q.text.trim() !== ''
  const picked = txs.filter((tx) => selected?.has(tx.id))
  const set = (p: Partial<TxQuery>) => setQ({ ...q, ...p })
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  const clear = () => {
    setQ({ ...EMPTY_QUERY, text: q.text, sort: q.sort })
    setMinText('')
    setMaxText('')
  }

  if (!txs.length)
    return (
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
    )

  const allOn = list.length > 0 && list.every((tx) => selected?.has(tx.id))
  const sums = list.reduce((s, tx) => ({ ...s, [tx.kind]: s[tx.kind] + tx.amount }), { income: 0, expense: 0 })

  return (
    <div className="grid gap-4">
      {selected ? (
        <div className="anim-fade flex flex-wrap items-center gap-2 rounded-xl bg-zinc-100 p-2 dark:bg-zinc-800/70">
          <button
            type="button"
            role="checkbox"
            aria-checked={allOn}
            onClick={() => setSelected(allOn ? new Set() : new Set(list.map((tx) => tx.id)))}
            className="flex h-9 items-center gap-2 rounded-lg px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Box on={allOn} />
            {t.selectAll}
          </button>
          <span className="num flex-1 text-sm text-zinc-600 dark:text-zinc-400">{t.selectedCount(picked.length)}</span>
          <Button variant="primary" disabled={!picked.length} onClick={() => setBulk(true)}>
            <PencilSimple size={16} />
            {t.bulkEdit}
          </Button>
          <Button variant="ghost" onClick={() => setSelected(null)}>
            {t.cancel}
          </Button>
        </div>
      ) : (
        <div className="anim-fade flex items-center gap-1 border-b border-ink">
          <div className="min-w-0 flex-1">
            <SearchInput className="h-10! border-b-0!" placeholder={t.searchTx} value={q.text} onChange={(text) => set({ text })} />
          </div>
          <Button
            variant="ghost"
            aria-label={t.filters}
            aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3! ${showFilters || active ? 'text-zinc-900! dark:text-zinc-100!' : ''}`}
          >
            <FunnelSimple size={16} weight={showFilters ? 'fill' : 'regular'} />
            <span className="max-sm:hidden">{t.filters}</span>
            {active > 0 && <span key={active} className="anim-pop num grid size-5 place-items-center rounded-full bg-accent text-xs text-accent-fg">{active}</span>}
          </Button>
          <Select
            compact
            align="right"
            label={t.sortLabel}
            icon={<SortAscending size={16} className="shrink-0 text-zinc-500" />}
            value={q.sort}
            onChange={(sort) => set({ sort })}
            options={SORTS.map((v) => ({ value: v, label: t.sorts[v] }))}
          />
          <Button variant="ghost" aria-label={t.select} className="px-3!" onClick={() => setSelected(new Set())}>
            <CheckSquare size={16} />
            <span className="max-sm:hidden">{t.select}</span>
          </Button>
        </div>
      )}

      {tags.length > 0 && !selected && (
        <div className="anim-fade -mt-1 flex flex-wrap gap-1.5" role="group" aria-label={t.tags}>
          {tags.map((x) => {
            const on = !!tag && sameTag(tag, x.tag)
            return (
              <button key={x.tag} type="button" aria-pressed={on} onClick={() => set({ text: on ? '' : `#${x.tag}` })} className={`${chipCls(on)} h-7! px-2.5!`}>
                <Hash size={13} weight="bold" aria-hidden />
                {x.tag}
              </button>
            )
          })}
        </div>
      )}

      {showFilters && !selected && (
        <div className="anim-pop grid gap-5 border-b border-line pb-5">
          <Segmented
            label={t.kindLabel}
            value={q.kind}
            onChange={(kind) => set({ kind, categories: [], buckets: kind === 'income' ? [] : q.buckets })}
            options={[
              { value: 'all', label: t.all },
              { value: 'expense', label: t.expenses },
              { value: 'income', label: t.income },
            ]}
          />
          {q.kind !== 'income' && (
            <FilterRow label={t.bucketLabel}>
              {BUCKETS.map((b) => (
                <button key={b} type="button" aria-pressed={q.buckets.includes(b)} onClick={() => set({ buckets: toggle(q.buckets, b) })} className={chipCls(q.buckets.includes(b))}>
                  <span className={`size-2 rounded-sm ${BUCKET_BG[b]}`} aria-hidden />
                  {t.bucket[b]}
                </button>
              ))}
            </FilterRow>
          )}
          <FilterRow label={t.category}>
            {[...cat.values()]
              .filter((c) => q.kind === 'all' || c.kind === q.kind)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => {
                const on = q.categories.includes(c.id)
                const I = c.icon ? ICONS[c.icon] : undefined
                return (
                  <button key={c.id} type="button" aria-pressed={on} onClick={() => set({ categories: toggle(q.categories, c.id) })} className={chipCls(on)}>
                    {I ? <I size={14} weight="duotone" style={{ color: c.color }} aria-hidden /> : <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />}
                    {c.name}
                  </button>
                )
              })}
          </FilterRow>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-2">
              <Field label={t.minAmount}>
                <MoneyInput className="h-10!" placeholder={t.anyAmount} value={minText} onChange={setMinText} />
              </Field>
              <Field label={t.maxAmount}>
                <MoneyInput className="h-10!" placeholder={t.anyAmount} value={maxText} onChange={setMaxText} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <DatePicker label={t.from} placeholder={t.anyDate} defaultMonth={`${month}-01`} value={q.from} onChange={(from) => set({ from })} />
              <DatePicker label={t.to} placeholder={t.anyDate} defaultMonth={`${month}-01`} align="right" value={q.to} onChange={(to) => set({ to })} />
            </div>
          </div>
          {active > 0 && (
            <Button variant="ghost" className="anim-fade justify-self-start" onClick={clear}>
              <X size={16} />
              {t.clearFilters}
            </Button>
          )}
        </div>
      )}

      {narrowed && (list.length > 0 || everywhere) && (
        <p className="anim-fade num -mb-1 text-sm text-zinc-600 dark:text-zinc-400">
          {list.length > 0 && [t.results(list.length), sums.income && `+${money(sums.income)}`, sums.expense && `−${money(sums.expense)}`].filter(Boolean).join(' · ')}
          {everywhere && (
            <button
              type="button"
              onClick={() => setAllMonths(true)}
              className="block text-left underline underline-offset-4 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent dark:hover:text-zinc-100"
            >
              {t.tagTotal(everywhere.tag, money(everywhere.amount), everywhere.count)}
            </button>
          )}
        </p>
      )}

      {list.length ? (
        <TxList
          txs={list}
          selected={selected}
          highlight={highlight}
          onPick={(tx) => {
            if (!selected) return onEdit(tx)
            const next = new Set(selected)
            if (next.has(tx.id)) next.delete(tx.id)
            else next.add(tx.id)
            setSelected(next)
          }}
        />
      ) : (
        <Empty
          title={t.noResults}
          action={
            <Button
              onClick={() => {
                clear()
                setQ({ ...EMPTY_QUERY, sort: q.sort })
              }}
            >
              {t.clearFilters}
            </Button>
          }
        />
      )}

      <Sheet open={bulk} onClose={() => setBulk(false)} title={t.bulkTitle(picked.length)}>
        {bulk && picked.length > 0 && (
          <BulkForm
            txs={picked}
            onDone={(changed) => {
              setBulk(false)
              if (changed) setSelected(null)
            }}
          />
        )}
      </Sheet>

      <Sheet open={allMonths && !!everywhere} onClose={() => setAllMonths(false)} title={everywhere ? `#${everywhere.tag}` : ''}>
        {everywhere && (
          <div className="grid gap-4">
            <p className="num text-sm text-zinc-600 dark:text-zinc-400">{t.tagTotal(everywhere.tag, money(everywhere.amount), everywhere.count)}</p>
            <TxList txs={queryTxs(everywhere.txs, { ...EMPTY_QUERY, sort: q.sort }, catName)} selected={null} onPick={onEdit} years />
          </div>
        )}
      </Sheet>
    </div>
  )
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

const Box = ({ on }: { on: boolean }) => (
  <span
    className={`grid size-5 shrink-0 place-items-center rounded-md transition ${on ? 'bg-accent text-accent-fg' : 'ring-1 ring-zinc-400 ring-inset dark:ring-zinc-500'}`}
    aria-hidden
  >
    {on && <Check size={13} weight="bold" />}
  </span>
)

function TxList({
  txs,
  selected,
  highlight,
  onPick,
  years,
}: {
  txs: Tx[]
  selected: Set<string> | null
  highlight?: string | null
  onPick: (tx: Tx) => void
  years?: boolean // dates show the year: the list spans months
}) {
  const { t, s, cat } = useApp()
  const monthlyIncome = useMonthlyIncome()
  const day = new Intl.DateTimeFormat(t.locale, { year: years ? 'numeric' : undefined, month: 'short', day: 'numeric' })
  const time = new Intl.DateTimeFormat(t.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: s.clock === '12' })
  const [all, setAll] = useState(false)
  return (
    <>
      <ul className="grid">
        {(all ? txs : txs.slice(0, TX_MAX)).map((tx) => {
          const c = cat.get(tx.categoryId)
          const on = !!selected?.has(tx.id)
          return (
            <li key={tx.id} className={`anim-fade-up border-b border-line last:border-0 ${fade(highlight, tx.categoryId)}`}>
              <button
                type="button"
                role={selected ? 'checkbox' : undefined}
                aria-checked={selected ? on : undefined}
                onClick={() => onPick(tx)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-accent ${
                  on || highlight === tx.categoryId ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                }`}
              >
                {selected && <Box on={on} />}
                <CatIcon c={c} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{tx.note || c?.name}</span>
                  <span className="block truncate text-xs text-zinc-600 dark:text-zinc-400">
                    {[tx.note && c?.name, tx.bucket && t.bucket[tx.bucket], ...(tx.tags ?? []).map((g) => `#${g}`)].filter(Boolean).join(' · ') || t.kind.income}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Amount amount={tx.amount} kind={tx.kind} bucket={tx.bucket} income={monthlyIncome} className="block text-sm font-semibold" />
                  {tx.origCurrency && tx.origAmount && <span className="num block text-xs text-zinc-600 dark:text-zinc-400">{formatMoney(tx.origAmount, tx.origCurrency, t.locale)}</span>}
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">{tx.createdAt && <span className="mr-1.5 opacity-50">{time.format(tx.createdAt)}</span>}
                    {day.format(new Date(tx.date + 'T00:00'))}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {txs.length > TX_MAX && <ShowMore open={all} hidden={txs.length - TX_MAX} onToggle={() => setAll(!all)} className="-mt-2" />}
    </>
  )
}

/** Edits many transactions at once. Every field starts as "unchanged"; only what you touch is written. */
function BulkForm({ txs, onDone }: { txs: Tx[]; onDone: (changed: boolean) => void }) {
  const { t, cat } = useApp()
  const kinds = new Set(txs.map((tx) => tx.kind))
  const kind: Kind | null = kinds.size === 1 ? [...kinds][0] : null
  const hasExpense = kinds.has('expense')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [bucket, setBucket] = useState<'keep' | Bucket>('keep')
  const [moveDate, setMoveDate] = useState(false)
  const [date, setDate] = useState(txs[0].date)
  const [note, setNote] = useState('')
  const dirty = categoryId !== null || bucket !== 'keep' || moveDate || note.trim() !== ''

  function pickCategory(id: string) {
    setCategoryId(id)
    const c = cat.get(id)
    if (c?.kind === 'expense') setBucket(c.bucket)
  }

  async function save() {
    const changes = {
      ...(categoryId !== null && { categoryId }),
      ...(moveDate && { date }),
      ...(note.trim() && { note: note.trim() }),
    }
    const ids = (kind: Tx['kind']) => txs.filter((tx) => tx.kind === kind).map((tx) => tx.id)
    // Income has no bucket, so it gets the same changes minus that one.
    await undoable({ what: 'edit', table: 'txs', n: txs.length }, async () => {
      await update('txs', ids('expense'), { ...changes, ...(bucket !== 'keep' && { bucket }) })
      await update('txs', ids('income'), changes)
    })
    onDone(true)
  }

  return (
    <div className="grid gap-5">
      {kind ? (
        <div className="grid gap-2">
          <CategoryPicker kind={kind} value={categoryId} onChange={pickCategory} />
          {categoryId !== null && (
            <button type="button" onClick={() => setCategoryId(null)} className="justify-self-start text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              {t.keepUnchanged}
            </button>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-zinc-100 p-3 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{t.mixedKinds}</p>
      )}

      {hasExpense && (
        <div className="grid gap-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.bucketLabel}</span>
          <Segmented
            label={t.bucketLabel}
            value={bucket}
            onChange={setBucket}
            options={[{ value: 'keep' as const, label: t.unchanged }, ...BUCKETS.map((b) => ({ value: b, label: t.bucket[b] }))]}
          />
        </div>
      )}

      <div className="grid gap-3">
        <Switch checked={moveDate} onChange={setMoveDate} label={t.changeDate} />
        {moveDate && <div className="anim-pop"><DatePicker label={t.date} value={date} onChange={setDate} /></div>}
      </div>

      <Field label={t.note}>
        <input className={inputCls} placeholder={t.unchanged} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <ConfirmButton
          label={t.deleteN(txs.length)}
          onConfirm={async () => {
            await remove('txs', txs.map((tx) => tx.id))
            onDone(true)
          }}
        />
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onDone(false)}>
            {t.cancel}
          </Button>
          <Button variant="primary" disabled={!dirty} onClick={save}>
            {t.save}
          </Button>
        </div>
      </div>
    </div>
  )
}
