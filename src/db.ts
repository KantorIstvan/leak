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
  icon?: string // name from ICONS; missing on categories made before icons existed
}

export interface Tx {
  id: number
  date: string // YYYY-MM-DD
  amount: number // minor units (cents / fillér), always positive
  kind: Kind
  categoryId: number
  bucket: Bucket | null // null for income
  note: string
  createdAt?: number // ms epoch when logged; missing on txs made before this existed
}

export interface Goal {
  id: number
  name: string
  target: number // minor units
  saved: number // minor units
}

export interface Sub {
  id: number
  name: string
  amount: number // minor units, charged monthly
  categoryId: number
  bucket?: Bucket // missing on subscriptions made before it existed: the category's default applies
  day: number // 1-31, clamped to month length
  lastMonth: string // YYYY-MM of the last generated charge
}

export interface Settings {
  id: 'app'
  lang: Lang
  currency: string
  theme: Theme
  clock?: '12' | '24' // missing on settings made before this existed: treated as 24
  colorblind?: boolean // swaps the data palette for one safe for protan/deutan/tritan vision and monochromacy, hatches expenses
  ratios: Record<Bucket, number> // percentages, sum to 100
}

const huUser = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('hu')

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  lang: huUser ? 'hu' : 'en',
  currency: huUser ? 'HUF' : 'EUR',
  theme: 'system',
  clock: huUser ? '24' : '12',
  ratios: { needs: 50, wants: 30, investments: 20 },
}

type NewCategory = Omit<Category, 'id'>

const expense = (name: string, color: string, bucket: Bucket, icon: string): NewCategory => ({ name, color, kind: 'expense', bucket, icon })
const income = (name: string, color: string, icon: string): NewCategory => ({ name, color, kind: 'income', bucket: 'needs', icon })

export const DEFAULT_CATEGORIES: NewCategory[] = [
  expense('Food', '#f59e0b', 'needs', 'ForkKnife'),
  expense('Rent', '#64748b', 'needs', 'House'),
  expense('Internet', '#db2777', 'needs', 'WifiHigh'),
  expense('Transport', '#0891b2', 'needs', 'Bus'),
  expense('Health', '#16a34a', 'needs', 'FirstAid'),
  expense('Clothes', '#c026d3', 'needs', 'TShirt'),
  expense('Gift', '#ca8a04', 'needs', 'Gift'),
  expense('Relationship', '#e11d48', 'needs', 'Heart'),
  expense('Software', '#7c3aed', 'needs', 'Code'),
  expense('Service', '#059669', 'needs', 'Wrench'),
  expense('Education', '#2563eb', 'needs', 'GraduationCap'),
  expense('Tech', '#3b82f6', 'wants', 'Laptop'),
  expense('Game', '#4f46e5', 'wants', 'GameController'),
  expense('Travel', '#0ea5e9', 'wants', 'Airplane'),
  expense('Junk Food', '#ea580c', 'wants', 'Hamburger'),
  expense('Dining out', '#d97706', 'wants', 'BowlFood'),
  expense('Entertainment', '#0d9488', 'wants', 'FilmSlate'),
  expense('Streaming', '#dc2626', 'wants', 'Television'),
  expense('Alcohol', '#be123c', 'wants', 'BeerStein'),
  expense('Cigarette/Vape', '#57534e', 'wants', 'Cigarette'),
  expense('Investment', '#8b5cf6', 'investments', 'ChartLineUp'),
  income('Job', '#65a30d', 'Briefcase'),
  income('Family', '#16a34a', 'Users'),
  income('Sold investments', '#0d9488', 'TrendUp'),
  income('Friends', '#84cc16', 'HandHeart'),
]

export const db = new Dexie('leak') as Dexie & {
  txs: EntityTable<Tx, 'id'>
  categories: EntityTable<Category, 'id'>
  goals: EntityTable<Goal, 'id'>
  subs: EntityTable<Sub, 'id'>
  settings: EntityTable<Settings, 'id'>
}

db.version(1).stores({
  txs: '++id, date, categoryId',
  categories: '++id, kind',
  goals: '++id',
  settings: 'id',
})
db.version(2).stores({ subs: '++id, categoryId' })
db.version(3).stores({}).upgrade((tx) =>
  tx
    .table('categories')
    .toCollection()
    .modify((c: Category) => {
      c.icon ??= DEFAULT_CATEGORIES.find((d) => d.name === c.name)?.icon
    }),
)

// Stamp every new tx (form, subscriptions, demo); imported ones keep theirs.
db.txs.hook('creating', (_, tx) => {
  tx.createdAt ??= Date.now()
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
  subs?: Sub[] // missing in backups made before subscriptions existed
  settings: Settings[]
}

export async function exportBackup(): Promise<Backup> {
  const [txs, categories, goals, subs, settings] = await Promise.all([
    db.txs.toArray(),
    db.categories.toArray(),
    db.goals.toArray(),
    db.subs.toArray(),
    db.settings.toArray(),
  ])
  return { app: 'leak', version: 1, txs, categories, goals, subs, settings }
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

  await db.transaction('rw', [db.txs, db.categories, db.goals, db.subs, db.settings], async () => {
    await Promise.all([db.txs.clear(), db.categories.clear(), db.goals.clear(), db.subs.clear(), db.settings.clear()])
    await db.categories.bulkAdd(b.categories!)
    await db.txs.bulkAdd(b.txs!)
    await db.goals.bulkAdd(b.goals!)
    await db.subs.bulkAdd(Array.isArray(b.subs) ? b.subs : [])
    await db.settings.bulkAdd(b.settings!.length ? b.settings! : [DEFAULT_SETTINGS])
  })
}

export async function wipeAll() {
  await db.delete()
  location.reload() // reopening recreates the DB and re-seeds defaults
}
