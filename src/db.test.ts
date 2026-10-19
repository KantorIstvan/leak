import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, emptyBackup, rekey } from './db'
import { fromRow, toRow } from './cloud'

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
})

describe('row mapping', () => {
  it('round-trips camelCase fields through snake_case columns', () => {
    const tx = { id: 'a', date: '2026-01-05', amount: 100, categoryId: 'c', createdAt: 1767600000000 }
    expect(toRow(tx)).toEqual({ id: 'a', date: '2026-01-05', amount: 100, category_id: 'c', created_at: '2026-01-05T08:00:00.000Z' })
    expect(fromRow({ ...toRow(tx), user_id: 'user_x' })).toEqual(tx)
  })
})
