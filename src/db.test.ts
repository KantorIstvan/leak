import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, emptyBackup, rekey } from './db'
import { chargeId, diff, fromRow, inverse, toRow, type Op } from './cloud'

// A backup as the pre-cloud app wrote it: numeric ids, no icon, no subs.
const legacy = {
  app: 'leak',
  version: 1,
  categories: [
    { id: 1, name: 'Food', color: '#f59e0b', kind: 'expense', bucket: 'needs' },
    { id: 2, name: 'Job', color: '#65a30d', kind: 'income', bucket: 'needs' },
  ],
  txs: [
    { id: 7, date: '2026-01-05', amount: 100, kind: 'expense', categoryId: 1, bucket: 'needs', note: '' },
    { id: 8, date: '2026-01-06', amount: 900, kind: 'income', categoryId: 2, bucket: null, note: 'Salary' },
  ],
  goals: [],
  settings: [DEFAULT_SETTINGS],
}

describe('rekey', () => {
  it('gives fresh uuids and keeps every tx on its category', () => {
    const b = rekey(legacy)
    const name = new Map(b.categories.map((c) => [c.id, c.name]))
    expect(b.txs.map((t) => name.get(t.categoryId))).toEqual(['Food', 'Job'])
    expect(b.txs.every((t) => /^[0-9a-f-]{36}$/.test(t.id))).toBe(true)
    expect(b.categories[0].icon).toBe('ForkKnife')
    expect(b.subs).toEqual([])
  })
  it('rejects files that are not backups or point at missing categories', () => {
    expect(() => rekey({ app: 'other' })).toThrow()
    expect(() => rekey({ ...legacy, txs: [{ ...legacy.txs[0], categoryId: 99 }] })).toThrow()
  })
  it('gives every default category its own id', () => {
    const b = rekey(emptyBackup())
    expect(new Set(b.categories.map((c) => c.id)).size).toBe(b.categories.length)
  })
  it('turns away any value the server would reject, so an import never stops halfway', () => {
    const [food, job] = legacy.categories
    const tx = legacy.txs[0]
    for (const bad of [
      { txs: [{ ...tx, kind: 'refund' }] },
      { txs: [{ ...tx, date: '2026-02-30' }] },
      { txs: [{ ...tx, amount: -5 }] },
      { txs: [{ ...tx, amount: 1.5 }] },
      { txs: [{ ...tx, note: null }] },
      { categories: [{ ...food, color: 'url(https://x)' }, job] },
      { categories: [food, { ...job, id: 1 }], txs: [tx] },
      { goals: [{ id: 1, name: 'Car', target: '9', saved: 0 }] },
      { subs: [{ id: 1, name: 'Spotify', amount: 100, categoryId: 1, day: 32, lastMonth: '2026-01' }] },
      { settings: [{ ...DEFAULT_SETTINGS, ratios: { needs: 50, wants: 30, investments: 30 } }] },
      { settings: [{ ...DEFAULT_SETTINGS, currency: 'Ft' }] },
      { txs: [{ ...tx, origAmount: 0, origCurrency: 'EUR' }] },
      { txs: [{ ...tx, origAmount: 5, origCurrency: 'euro' }] },
      { subs: [{ id: 1, name: 'Spotify', amount: 100, currency: 'usd', categoryId: 1, day: 3, lastMonth: '2026-01' }] },
      { settings: [{ ...DEFAULT_SETTINGS, shortcuts: { add: 'N' } }] },
    ])
      expect(() => rekey({ ...legacy, ...bad }), JSON.stringify(bad)).toThrow()
  })
  it('keeps only the fields the server has', () => {
    const b = rekey({ ...legacy, txs: [{ ...legacy.txs[0], color: 'red', createdAt: 5 }], goals: [{ id: 1, name: 'Car', target: 9, saved: 1, done: true }] })
    expect(Object.keys(b.txs[0]).sort()).toEqual(['amount', 'bucket', 'categoryId', 'createdAt', 'date', 'id', 'kind', 'note'])
    expect(Object.keys(b.goals[0]).sort()).toEqual(['id', 'name', 'saved', 'target'])
  })
})

describe('mirror diff', () => {
  const a = { id: 'a', amount: 100, ratios: { needs: 50, wants: 30 } }
  const b = { id: 'b', amount: 1 }
  const c = { id: 'c', amount: 2 }
  it('writes nothing when the server has the same rows, key order aside', () => {
    expect(diff([a], [{ ratios: { wants: 30, needs: 50 }, amount: 100, id: 'a' }], () => false)).toEqual({ put: [], gone: [] })
  })
  it('puts changed and new rows and deletes the ones the server dropped', () => {
    expect(diff([a, b], [{ ...a, amount: 200 }, c], () => false)).toEqual({ put: [{ ...a, amount: 200 }, c], gone: ['b'] })
  })
  it('leaves rows written during the pull as they are', () => {
    expect(diff([a, b], [{ ...a, amount: 200 }, c], (id) => id === 'a' || id === 'b')).toEqual({ put: [c], gone: [] })
  })
})

describe('chargeId', () => {
  it('is one uuid per subscription and month, the same on every run', async () => {
    const id = await chargeId('sub-1', '2026-10')
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(await chargeId('sub-1', '2026-10')).toBe(id)
    expect(await chargeId('sub-1', '2026-11')).not.toBe(id)
    expect(await chargeId('sub-2', '2026-10')).not.toBe(id)
  })
})

describe('row mapping', () => {
  it('round-trips camelCase fields through snake_case columns', () => {
    const tx = { id: 'a', date: '2026-01-05', amount: 100, categoryId: 'c', createdAt: 1767600000000, origAmount: 30, origCurrency: 'EUR' }
    expect(toRow(tx)).toEqual({ id: 'a', date: '2026-01-05', amount: 100, category_id: 'c', created_at: '2026-01-05T08:00:00.000Z', orig_amount: 30, orig_currency: 'EUR' })
    expect(fromRow({ ...toRow(tx), user_id: 'user_x' })).toEqual(tx)
  })
})

describe('undo ops', () => {
  const row = { id: 'a', amount: 1 }
  it('turn into their opposite, and back', () => {
    const add: Op = { t: 'add', table: 'txs', rows: [row] }
    const edit: Op = { t: 'update', table: 'txs', rows: [{ id: 'a', before: { note: null }, after: { note: 'x' } }] }
    const settings: Op = { t: 'settings', before: DEFAULT_SETTINGS, after: { ...DEFAULT_SETTINGS, theme: 'dark' } }
    expect(inverse(add)).toEqual({ t: 'remove', table: 'txs', rows: [row] })
    expect(inverse(edit)).toEqual({ t: 'update', table: 'txs', rows: [{ id: 'a', before: { note: 'x' }, after: { note: null } }] })
    expect(inverse(settings)).toMatchObject({ before: { theme: 'dark' }, after: { theme: 'system' } })
    for (const op of [add, edit, settings]) expect(inverse(inverse(op))).toEqual(op)
  })
})
