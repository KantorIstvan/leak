import Dexie, { type EntityTable } from 'dexie'

export type Bucket = 'needs' | 'wants' | 'investments'
export type Kind = 'income' | 'expense'
export type Lang = 'hu' | 'en'
export type Theme = 'system' | 'light' | 'dark'

export const BUCKETS: Bucket[] = ['needs', 'wants', 'investments']

export interface Category {
  id: number
  name: string
  color: string
  kind: Kind
  bucket: Bucket // default bucket for new expenses in this category
}

export interface Tx {
  id: number
  date: string // YYYY-MM-DD
  amount: number // minor units (cents / fillér), always positive
  kind: Kind
  categoryId: number
  bucket: Bucket | null // null for income
  note: string
}

export interface Goal {
  id: number
  name: string
  target: number // minor units
  saved: number // minor units
}

export interface Settings {
  id: 'app'
  lang: Lang
  currency: string
  theme: Theme
  ratios: Record<Bucket, number> // percentages, sum to 100
}

const huUser = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('hu')

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  lang: huUser ? 'hu' : 'en',
  currency: huUser ? 'HUF' : 'EUR',
  theme: 'system',
  ratios: { needs: 50, wants: 30, investments: 20 },
}

type NewCategory = Omit<Category, 'id'>

const expense = (name: string, color: string, bucket: Bucket): NewCategory => ({ name, color, kind: 'expense', bucket })
const income = (name: string, color: string): NewCategory => ({ name, color, kind: 'income', bucket: 'needs' })

export const DEFAULT_CATEGORIES: NewCategory[] = [
  expense('Food', '#f59e0b', 'needs'),
  expense('Rent', '#64748b', 'needs'),
  expense('Internet', '#db2777', 'needs'),
  expense('Transport', '#0891b2', 'needs'),
  expense('Health', '#16a34a', 'needs'),
  expense('Clothes', '#c026d3', 'needs'),
  expense('Gift', '#ca8a04', 'needs'),
  expense('Relationship', '#e11d48', 'needs'),
  expense('Software', '#7c3aed', 'needs'),
  expense('Service', '#059669', 'needs'),
  expense('Education', '#2563eb', 'needs'),
  expense('Tech', '#3b82f6', 'wants'),
  expense('Game', '#4f46e5', 'wants'),
  expense('Travel', '#0ea5e9', 'wants'),
  expense('Junk Food', '#ea580c', 'wants'),
  expense('Dining out', '#d97706', 'wants'),
  expense('Entertainment', '#0d9488', 'wants'),
  expense('Streaming', '#dc2626', 'wants'),
  expense('Alcohol', '#be123c', 'wants'),
  expense('Cigarette/Vape', '#57534e', 'wants'),
  expense('Investment', '#8b5cf6', 'investments'),
  income('Job', '#65a30d'),
  income('Family', '#16a34a'),
  income('Sold investments', '#0d9488'),
  income('Friends', '#84cc16'),
]

export const db = new Dexie('leak') as Dexie & {
  txs: EntityTable<Tx, 'id'>
  categories: EntityTable<Category, 'id'>
  goals: EntityTable<Goal, 'id'>
  settings: EntityTable<Settings, 'id'>
}

db.version(1).stores({
  txs: '++id, date, categoryId',
  categories: '++id, kind',
  goals: '++id',
  settings: 'id',
})

db.on('populate', async (tx) => {
  await tx.table('categories').bulkAdd(DEFAULT_CATEGORIES)
  await tx.table('settings').add(DEFAULT_SETTINGS)
})

// --- Backup ---------------------------------------------------------------

interface Backup {
  app: 'leak'
  version: 1
  txs: Tx[]
  categories: Category[]
  goals: Goal[]
  settings: Settings[]
}

export async function exportBackup(): Promise<Backup> {
  const [txs, categories, goals, settings] = await Promise.all([
    db.txs.toArray(),
    db.categories.toArray(),
    db.goals.toArray(),
    db.settings.toArray(),
  ])
  return { app: 'leak', version: 1, txs, categories, goals, settings }
}

// Replaces all data. Throws if the file is not a Leak backup, before touching anything.
export async function importBackup(raw: unknown) {
  const b = raw as Partial<Backup>
  const ok =
    b?.app === 'leak' &&
    b.version === 1 &&
    [b.txs, b.categories, b.goals, b.settings].every(Array.isArray) &&
    b.txs!.every((t) => Number.isInteger(t.amount) && /^\d{4}-\d{2}-\d{2}$/.test(t.date))
  if (!ok) throw new Error('invalid backup')

  await db.transaction('rw', [db.txs, db.categories, db.goals, db.settings], async () => {
    await Promise.all([db.txs.clear(), db.categories.clear(), db.goals.clear(), db.settings.clear()])
    await db.categories.bulkAdd(b.categories!)
    await db.txs.bulkAdd(b.txs!)
    await db.goals.bulkAdd(b.goals!)
    await db.settings.bulkAdd(b.settings!.length ? b.settings! : [DEFAULT_SETTINGS])
  })
}

export async function wipeAll() {
  await db.delete()
  location.reload() // reopening recreates the DB and re-seeds defaults
}
