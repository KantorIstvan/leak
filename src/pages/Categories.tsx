import { useState, type FormEvent } from 'react'
import { Plus } from '@phosphor-icons/react'
import { BUCKETS, db, type Bucket, type Category, type Kind } from '../db'
import { BUCKET_BG, Button, Card, ConfirmButton, Field, inputCls, PageHeader, Segmented, Sheet, useApp } from '../ui'

type Editing = Category | { kind: Kind } | null

export function CategoriesPage() {
  const { t, cats } = useApp()
  const [editing, setEditing] = useState<Editing>(null)

  const section = (kind: Kind) => (
    <Card
      title={kind === 'expense' ? t.expenseCategories : t.incomeCategories}
      action={
        <Button onClick={() => setEditing({ kind })}>
          <Plus size={16} weight="bold" />
          {t.newCategory}
        </Button>
      }
    >
      <ul className="-mx-2 grid sm:grid-cols-2">
        {cats
          .filter((c) => c.kind === kind)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setEditing(c)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-accent dark:hover:bg-zinc-800/60"
              >
                <span className="size-4 shrink-0 rounded" style={{ background: c.color }} aria-hidden />
                <span className="flex-1 truncate font-medium">{c.name}</span>
                {kind === 'expense' && (
                  <span className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className={`size-2 rounded-sm ${BUCKET_BG[c.bucket]}`} aria-hidden />
                    {t.bucket[c.bucket]}
                  </span>
                )}
              </button>
            </li>
          ))}
      </ul>
    </Card>
  )

  return (
    <>
      <PageHeader title={t.nav.categories} />
      <div className="grid gap-4">
        {section('expense')}
        {section('income')}
      </div>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing && 'id' in editing ? t.editCategory : t.newCategory}>
        {editing && <CategoryForm editing={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  )
}

const SWATCHES = ['#3b82f6', '#0ea5e9', '#0d9488', '#16a34a', '#65a30d', '#ca8a04', '#d97706', '#ea580c', '#e11d48', '#db2777', '#c026d3', '#8b5cf6', '#4f46e5', '#64748b']

function CategoryForm({ editing, onDone }: { editing: Category | { kind: Kind }; onDone: () => void }) {
  const { t } = useApp()
  const existing = 'id' in editing ? editing : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(existing?.color ?? SWATCHES[0])
  const [bucket, setBucket] = useState<Bucket>(existing?.bucket ?? 'needs')
  const [error, setError] = useState<string>()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError(t.nameRequired)
    const data = { name: name.trim(), color, bucket, kind: editing.kind }
    if (existing) await db.categories.update(existing.id, data)
    else await db.categories.add(data as Category)
    onDone()
  }

  async function remove() {
    const used =
      (await db.txs.where('categoryId').equals(existing!.id).count()) + (await db.subs.where('categoryId').equals(existing!.id).count())
    if (used) return setError(t.categoryInUse(used))
    await db.categories.delete(existing!.id)
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <Field label={t.name} error={error}>
        <input className={inputCls} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.color}</legend>
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((s) => (
            <button
              key={s}
              type="button"
              aria-label={s}
              aria-pressed={s === color}
              onClick={() => setColor(s)}
              className={`size-8 rounded-full transition active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                s === color ? 'ring-2 ring-zinc-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-zinc-900' : ''
              }`}
              style={{ background: s }}
            />
          ))}
          <input
            type="color"
            aria-label={t.color}
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="size-8 cursor-pointer rounded-full border-0 bg-transparent p-0"
          />
        </div>
      </fieldset>

      {editing.kind === 'expense' && (
        <div className="grid gap-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.defaultBucket}</span>
          <Segmented label={t.defaultBucket} value={bucket} onChange={setBucket} options={BUCKETS.map((b) => ({ value: b, label: t.bucket[b] }))} />
          <span className="text-xs text-zinc-600 dark:text-zinc-400">{t.defaultBucketHint}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {existing ? <ConfirmButton label={t.delete} onConfirm={remove} /> : <span />}
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
