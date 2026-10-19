import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Plus } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { add, remove, update } from '../cloud'
import { BUCKETS, db, type Bucket, type Category, type Kind } from '../db'
import { ICON_GROUPS } from '../icons'
import { hexToHsv, hsvToHex } from '../lib'
import { BUCKET_BG, Button, Card, CatIcon, ConfirmButton, Field, Form, inputCls, PageHeader, SearchInput, Segmented, Sheet, useApp } from '../ui'

type Editing = Category | { kind: Kind } | null

export function CategoriesPage() {
  const { t, cats } = useApp()
  const [editing, setEditing] = useState<Editing>(null)

  const tiles = (list: Category[]) => (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
      {list
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setEditing(c)}
              className="flex w-full items-center gap-2.5 rounded-xl bg-zinc-50 p-1.5 pr-3 text-left text-sm ring-1 ring-transparent transition hover:bg-zinc-100 hover:ring-zinc-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-accent dark:bg-zinc-800/40 dark:hover:bg-zinc-800 dark:hover:ring-zinc-700"
            >
              <CatIcon c={c} size="sm" />
              <span className="truncate font-medium">{c.name}</span>
            </button>
          </li>
        ))}
    </ul>
  )

  const section = (kind: Kind) => {
    const list = cats.filter((c) => c.kind === kind)
    return (
      <Card
        title={kind === 'expense' ? t.expenseCategories : t.incomeCategories}
        action={
          <Button variant="ghost" className="-my-2 -mr-2" onClick={() => setEditing({ kind })}>
            <Plus size={16} weight="bold" />
            {t.newCategory}
          </Button>
        }
      >
        {kind === 'income' ? (
          tiles(list)
        ) : (
          <div className="grid gap-5">
            {BUCKETS.map((b) => {
              const inBucket = list.filter((c) => c.bucket === b)
              return (
                inBucket.length > 0 && (
                  <section key={b} className="grid gap-2.5">
                    <h3 className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      <span className={`size-2 rounded-sm ${BUCKET_BG[b]}`} aria-hidden />
                      {t.bucket[b]}
                      <span className="num text-zinc-400 dark:text-zinc-500">{inBucket.length}</span>
                    </h3>
                    {tiles(inBucket)}
                  </section>
                )
              )
            })}
          </div>
        )}
      </Card>
    )
  }

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

export const SWATCHES = ['#3b82f6', '#0ea5e9', '#0d9488', '#16a34a', '#65a30d', '#ca8a04', '#d97706', '#ea580c', '#e11d48', '#db2777', '#c026d3', '#8b5cf6', '#4f46e5', '#64748b']

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Pointer handlers reporting the 0-1 position inside the element while pressed. */
const dragTo = (apply: (x: number, y: number) => void) => {
  const at = (e: PointerEvent<HTMLElement>) => {
    const b = e.currentTarget.getBoundingClientRect()
    apply(clamp01((e.clientX - b.left) / b.width), clamp01((e.clientY - b.top) / b.height))
  }
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      at(e)
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => e.currentTarget.hasPointerCapture(e.pointerId) && at(e),
  }
}

const RAINBOW = 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'

/** Preset swatches plus a rainbow "custom" swatch that opens a saturation/brightness field, hue strip and hex input. */
function ColorPicker({ value, onChange, preview }: { value: string; onChange: (hex: string) => void; preview: ReactNode }) {
  const { t } = useApp()
  const custom = !SWATCHES.includes(value)
  const [open, setOpen] = useState(custom)
  // HSV lives in state so the hue survives greys and black, where the hex alone cannot carry it.
  const [hsv, setHsv] = useState(() => hexToHsv(value) ?? [0, 0, 0])
  const [hex, setHex] = useState(value)
  const [h, sat, v] = hsv

  const set = (next: [number, number, number]) => {
    setHsv(next)
    const c = hsvToHex(...next)
    setHex(c)
    onChange(c)
  }
  const pick = (c: string) => {
    setHsv(hexToHsv(c)!)
    setHex(c)
    onChange(c)
  }
  const nudge = (e: KeyboardEvent, keys: Record<string, () => void>) => {
    if (!keys[e.key]) return
    e.preventDefault()
    keys[e.key]()
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 flex w-full items-center justify-between gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {t.color}
        {preview}
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        {SWATCHES.map((s) => (
          <button
            key={s}
            type="button"
            aria-label={s}
            aria-pressed={s === value}
            onClick={() => pick(s)}
            className={`size-8 rounded-full transition active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              s === value ? 'ring-2 ring-zinc-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-zinc-900' : ''
            }`}
            style={{ background: s }}
          />
        ))}
        <button
          type="button"
          aria-label={t.customColor}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`grid size-8 place-items-center rounded-full transition active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            custom ? 'ring-2 ring-zinc-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-zinc-900' : ''
          }`}
          style={{ background: 'conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
        >
          <span className="size-3.5 rounded-full ring-2 ring-white dark:ring-zinc-900" style={{ background: custom ? value : 'transparent' }} />
        </button>
      </div>

      {open && (
        <div className="anim-pop grid gap-3 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
          <div
            role="slider"
            tabIndex={0}
            aria-label={t.saturation}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(sat * 100)}
            aria-valuetext={hex}
            {...dragTo((x, y) => set([h, x, 1 - y]))}
            onKeyDown={(e) =>
              nudge(e, {
                ArrowLeft: () => set([h, clamp01(sat - 0.02), v]),
                ArrowRight: () => set([h, clamp01(sat + 0.02), v]),
                ArrowUp: () => set([h, sat, clamp01(v + 0.02)]),
                ArrowDown: () => set([h, sat, clamp01(v - 0.02)]),
              })
            }
            className="relative h-36 cursor-crosshair touch-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${h} 100% 50%)` }}
          >
            <span
              className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-md ring-[3px] ring-white"
              style={{ left: `${sat * 100}%`, top: `${(1 - v) * 100}%`, background: hex }}
            />
          </div>

          <div
            role="slider"
            tabIndex={0}
            aria-label={t.hue}
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={Math.round(h)}
            {...dragTo((x) => set([x * 360, sat, v]))}
            onKeyDown={(e) =>
              nudge(e, {
                ArrowLeft: () => set([(h + 355) % 360, sat, v]),
                ArrowRight: () => set([(h + 5) % 360, sat, v]),
              })
            }
            className="relative h-4 cursor-ew-resize touch-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            style={{ background: RAINBOW }}
          >
            <span
              className="pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-md ring-[3px] ring-white"
              style={{ left: `${(h / 360) * 100}%`, background: `hsl(${h} 100% 50%)` }}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="size-11 shrink-0 rounded-lg ring-1 ring-zinc-900/10 ring-inset dark:ring-white/10" style={{ background: hex }} aria-hidden />
            <input
              className={`${inputCls} num uppercase`}
              aria-label="HEX"
              maxLength={7}
              spellCheck={false}
              value={hex}
              onChange={(e) => {
                const raw = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
                setHex(raw)
                const next = hexToHsv(raw)
                if (next) {
                  setHsv(next)
                  onChange(raw.toLowerCase())
                }
              }}
            />
          </div>
        </div>
      )}
    </fieldset>
  )
}

function CategoryForm({ editing, onDone }: { editing: Category | { kind: Kind }; onDone: () => void }) {
  const { t, cats } = useApp()
  const existing = 'id' in editing ? editing : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(existing?.color ?? SWATCHES[0])
  const [bucket, setBucket] = useState<Bucket>(existing?.bucket ?? 'needs')
  const [icon, setIcon] = useState(existing?.icon ?? 'Tag')
  const [error, setError] = useState<string>()

  async function submit() {
    if (!name.trim()) return setError(t.nameRequired)
    const data = { name: name.trim(), color, bucket, icon, kind: editing.kind }
    if (existing) await update('categories', [existing.id], data)
    else await add('categories', [data])
    onDone()
  }

  const used = useLiveQuery(
    async () => (existing ? (await db.txs.where('categoryId').equals(existing.id).count()) + (await db.subs.where('categoryId').equals(existing.id).count()) : 0),
    [existing?.id],
    0,
  )

  async function removeCategory() {
    const old = existing!
    const txIds = await db.txs.where('categoryId').equals(old.id).primaryKeys()
    const subs = await db.subs.where('categoryId').equals(old.id).toArray()
    if (txIds.length || subs.length) {
      // category_id stays required in the schema, so orphans move to a shared "Uncategorized" category rather than null.
      const home =
        cats.find((c) => c.kind === old.kind && c.name === t.uncategorized && c.id !== old.id) ??
        (await add('categories', [{ name: t.uncategorized, color: '#a1a1aa', kind: old.kind, bucket: old.bucket, icon: 'DotsThree' }]))[0]
      await update('txs', txIds, { categoryId: home.id })
      // Subscriptions without their own bucket used the old category's: pin it so they stay where they were.
      await update('subs', subs.filter((s) => s.bucket).map((s) => s.id), { categoryId: home.id })
      await update('subs', subs.filter((s) => !s.bucket).map((s) => s.id), { categoryId: home.id, bucket: old.bucket })
    }
    await remove('categories', [old.id])
    onDone()
  }

  return (
    <Form onSubmit={submit}>
      <Field label={t.name} error={error}>
        <input className={inputCls} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <ColorPicker
        value={color}
        onChange={setColor}
        preview={
          <span className="flex min-w-0 items-center gap-2 font-normal">
            <CatIcon c={{ color, icon } as Category} size="sm" />
            <span className="truncate">{name.trim() || t.newCategory}</span>
          </span>
        }
      />

      <IconPicker value={icon} color={color} onChange={setIcon} />

      {editing.kind === 'expense' && (
        <div className="grid gap-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.defaultBucket}</span>
          <Segmented label={t.defaultBucket} value={bucket} onChange={setBucket} options={BUCKETS.map((b) => ({ value: b, label: t.bucket[b] }))} />
          <span className="text-xs text-zinc-600 dark:text-zinc-400">{t.defaultBucketHint}</span>
        </div>
      )}

      {used > 0 && <p className="anim-fade text-xs text-zinc-600 dark:text-zinc-400">{t.categoryDeleteHint(used)}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {existing ? <ConfirmButton label={t.delete} onConfirm={removeCategory} /> : <span />}
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

function IconPicker({ value, color, onChange }: { value: string; color: string; onChange: (name: string) => void }) {
  const { t } = useApp()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const groups = Object.entries(ICON_GROUPS)
    .map(([group, icons]) => [group, Object.entries(icons).filter(([name]) => name.toLowerCase().includes(needle))] as const)
    .filter(([, icons]) => icons.length)

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.icon}</legend>
      <SearchInput placeholder={t.iconSearch} value={q} onChange={setQ} />
      <div className="max-h-60 overflow-y-auto rounded-lg bg-zinc-50 p-2 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
        {groups.length ? (
          groups.map(([group, icons]) => (
            <div key={group} className="mb-2 last:mb-0">
              <div className="px-1 pt-1 pb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">{t.iconGroups[group as keyof typeof t.iconGroups]}</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1">
                {icons.map(([name, I]) => {
                  const on = name === value
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-label={name}
                      aria-pressed={on}
                      onClick={() => onChange(name)}
                      className={`grid aspect-square place-items-center rounded-lg transition active:scale-90 focus-visible:outline-2 focus-visible:outline-accent ${
                        on ? 'ring-2 ring-zinc-900 dark:ring-white' : 'text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800'
                      }`}
                      style={on ? { background: `${color}22`, color } : undefined}
                    >
                      <I size={20} weight={on ? 'duotone' : 'regular'} />
                    </button>
                  )
                })}
              </div>
            </div>
          ))
        ) : (
          <p className="p-4 text-center text-sm text-zinc-600 dark:text-zinc-400">{t.iconNone}</p>
        )}
      </div>
    </fieldset>
  )
}
