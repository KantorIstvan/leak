import Dexie, { type EntityTable } from 'dexie'
import type { CommandId } from './keys'
import { isDay } from './lib'

export type Bucket = 'needs' | 'wants' | 'investments'
export type Kind = 'income' | 'expense'
export type Lang = 'hu' | 'en'
export type Theme = 'system' | 'light' | 'dark'

/** The data colours Settings > Colours can override (the --color-* variables in index.css). */
export const DATA_COLORS = ['income', 'expense', 'needs', 'wants', 'investments'] as const
export type DataColor = (typeof DATA_COLORS)[number]

export const BUCKETS: Bucket[] = ['needs', 'wants', 'investments']

export interface Category {
  id: string
  name: string
  color: string
  kind: Kind
  bucket: Bucket // default bucket for new expenses in this category
  icon?: string // name from ICONS; missing on categories made before icons existed
  limit?: number | null // most to spend on it in a month (minor units), expense categories only; missing/null = no limit
}

export interface Tx {
  id: string
  date: string // YYYY-MM-DD
  amount: number // minor units (cents / fillér) of the base currency, always positive
  origAmount?: number | null // paid in another currency: the amount in it (minor units); `amount` is it converted on the day
  origCurrency?: string | null // ISO 4217 code of origAmount; missing/null = paid in the base currency
  kind: Kind
  categoryId: string
  bucket: Bucket | null // null for income
  note: string
  tags?: string[] | null // groups txs across categories and months (a trip, a renovation); missing/null = none
  createdAt?: number // ms epoch when logged; missing on txs made before this existed
}

export interface Goal {
  id: string
  name: string
  target: number // minor units
  saved: number // minor units
}

export interface Sub {
  id: string
  name: string
  amount: number // minor units of `currency`, charged monthly
  currency?: string | null // billed in another currency, converted at each charge's rate; missing/null = the base currency
  categoryId: string
  bucket?: Bucket // missing on subscriptions made before it existed: the category's default applies
  day: number // 1-31, clamped to month length
  lastMonth: string // YYYY-MM of the last generated charge
  reviewed?: string | null // YYYY-MM the user last said they still use it; missing/null = never asked
}

/** A budget split no longer in force, with the last month (YYYY-MM) it applied to. */
export interface RatioPeriod {
  until: string
  ratios: Record<Bucket, number>
}

export interface Settings {
  id: 'app'
  lang: Lang
  currency: string
  theme: Theme
  clock?: '12' | '24' // missing on settings made before this existed: treated as 24
  colorblind?: boolean // swaps the data palette for one safe for protan/deutan/tritan vision and monochromacy, hatches expenses
  colors?: Partial<Record<DataColor, string>> | null // #rrggbb picked in Settings, over the defaults in light and dark; missing = defaults
  ratios: Record<Bucket, number> // percentages, sum to 100
  ratioHistory?: RatioPeriod[] | null // earlier splits, oldest first, so past months keep the plan they had; missing = the current split always applied
  shortcuts?: Partial<Record<CommandId, string[]>> | null // keys changed from keys.ts's defaults; missing = the defaults
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

// Local mirror of the signed-in user's Supabase rows. Pages read it through useLiveQuery;
// cloud.ts writes the server first and this second, and replaces it wholesale on every pull.
export const db = new Dexie('leak-cache') as Dexie & {
  txs: EntityTable<Tx, 'id'>
  categories: EntityTable<Category, 'id'>
  goals: EntityTable<Goal, 'id'>
  subs: EntityTable<Sub, 'id'>
  settings: EntityTable<Settings, 'id'>
}

db.version(1).stores({
  txs: 'id, date, categoryId',
  categories: 'id, kind',
  goals: 'id',
  subs: 'id, categoryId',
  settings: 'id',
})

// --- Backup ---------------------------------------------------------------

export interface Backup {
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

/** What a brand-new account starts with. */
export const emptyBackup = (): Backup => ({
  app: 'leak',
  version: 1,
  txs: [],
  categories: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: String(i) })),
  goals: [],
  settings: [DEFAULT_SETTINGS],
})

type Check = (v: unknown) => boolean
const text: Check = (v) => typeof v === 'string'
const money: Check = (v) => Number.isSafeInteger(v) && (v as number) >= 0
const kind: Check = (v) => v === 'income' || v === 'expense'
const bucket: Check = (v) => BUCKETS.includes(v as Bucket)
const oneOf = (...xs: unknown[]): Check => (v) => xs.includes(v)
const absent = (check: Check): Check => (v) => v === undefined || check(v) // missing: the server fills in its default
const nullable = (check: Check): Check => (v) => v == null || check(v)
const code: Check = (v) => text(v) && /^[A-Z]{3}$/.test(v as string)
const ratios: Check = (v) => {
  const r = (v ?? {}) as Record<Bucket, number>
  return BUCKETS.every((b) => Number.isInteger(r[b]) && r[b] >= 0) && BUCKETS.reduce((n, b) => n + r[b], 0) === 100
}

/**
 * What the server accepts in each stored field (ids and category links are checked by rekey). A backup is checked
 * in full before anything is deleted: one bad value would otherwise stop the upload halfway, with the old data gone.
 */
const FIELDS: Record<'categories' | 'txs' | 'goals' | 'subs' | 'settings', Record<string, Check>> = {
  categories: { name: text, color: (v) => text(v) && /^#[\da-f]{6}$/i.test(v as string), kind, bucket, icon: nullable(text), limit: nullable((v) => money(v) && (v as number) > 0) },
  txs: {
    date: isDay,
    amount: money,
    origAmount: nullable((v) => money(v) && (v as number) > 0),
    origCurrency: nullable(code),
    kind,
    bucket: nullable(bucket),
    note: absent(text),
    tags: nullable((v) => Array.isArray(v) && v.every(text)),
    createdAt: absent(Number.isFinite),
  },
  goals: { name: text, target: money, saved: money },
  subs: {
    name: text,
    amount: money,
    currency: nullable(code),
    bucket: nullable(bucket),
    day: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31,
    lastMonth: (v) => text(v) && /^\d{4}-\d{2}$/.test(v as string),
    reviewed: nullable((v) => text(v) && /^\d{4}-\d{2}$/.test(v as string)),
  },
  settings: {
    lang: oneOf('hu', 'en'),
    currency: code,
    theme: oneOf('system', 'light', 'dark'),
    clock: nullable(oneOf('12', '24')),
    colorblind: absent((v) => typeof v === 'boolean'),
    colors: nullable((v) => typeof v === 'object' && Object.entries(v as object).every(([k, c]) => DATA_COLORS.includes(k as DataColor) && /^#[0-9a-f]{6}$/i.test(c))),
    ratios,
    ratioHistory: nullable((v) => Array.isArray(v) && v.every((h) => /^\d{4}-\d{2}$/.test(h?.until) && ratios(h.ratios))),
    shortcuts: nullable((v) => typeof v === 'object' && Object.values(v as object).every((keys) => Array.isArray(keys) && keys.every(text))),
  },
}

/** The rows of one table with only the fields the server knows (it rejects any other); throws if a value is invalid. */
function rows(raw: unknown, table: keyof typeof FIELDS, ...keep: string[]) {
  const fields = FIELDS[table]
  const keys = [...keep, ...Object.keys(fields)]
  if (!Array.isArray(raw)) throw new Error(`invalid backup: ${table}`)
  return raw.map((r: Record<string, unknown>) => {
    if (!r || typeof r !== 'object' || !Object.entries(fields).every(([k, ok]) => ok(r[k]))) throw new Error(`invalid backup: ${table}`)
    return Object.fromEntries(keys.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]))
  })
}

/**
 * Checks a backup and gives every row a fresh uuid, keeping category references intact,
 * so files from the pre-cloud app (numeric ids) import too. Throws if it is not a valid Leak backup.
 */
export function rekey(raw: unknown): Backup {
  const b = raw as Record<string, unknown> | null
  if (b?.app !== 'leak' || b.version !== 1) throw new Error('invalid backup')
  const categories = rows(b.categories, 'categories', 'id')
  const txs = rows(b.txs, 'txs', 'categoryId')
  const subs = rows(b.subs ?? [], 'subs', 'categoryId') // missing in backups made before subscriptions existed
  const ids = new Map(categories.map((c) => [c.id, crypto.randomUUID()]))
  if (ids.size !== categories.length || ![...txs, ...subs].every((r) => ids.has(r.categoryId))) throw new Error('invalid backup: categories')

  const relink = (r: Record<string, unknown>) => ({ ...r, id: crypto.randomUUID(), categoryId: ids.get(r.categoryId)! })
  return {
    app: 'leak',
    version: 1,
    // Categories made before icons existed get their default one, as the old v3 upgrade did.
    categories: categories.map((c) => ({ ...c, id: ids.get(c.id)!, icon: c.icon ?? DEFAULT_CATEGORIES.find((d) => d.name === c.name)?.icon })) as Category[],
    txs: txs.map(relink) as Tx[],
    goals: rows(b.goals, 'goals').map((g) => ({ ...g, id: crypto.randomUUID() })) as Goal[],
    subs: subs.map(relink) as Sub[],
    settings: [{ ...(rows(b.settings, 'settings')[0] ?? DEFAULT_SETTINGS), id: 'app' } as Settings],
  }
}

/** This device's copy of the signed-in account's data, or null if it holds none. */
export async function mirrorBackup() {
  const b = await exportBackup()
  return b.categories.length ? b : null
}

/** This device's pre-cloud database as a backup, or null if it never had any data. */
export async function legacyBackup(): Promise<Backup | null> {
  if (!(await Dexie.exists('leak'))) return null
  const old = new Dexie('leak')
  await old.open() // no schema declared: Dexie opens whatever version is on disk
  const all = (name: string) => (old.tables.some((t) => t.name === name) ? old.table(name).toArray() : Promise.resolve([]))
  const [txs, categories, goals, subs, settings] = await Promise.all(['txs', 'categories', 'goals', 'subs', 'settings'].map(all))
  old.close()
  return categories.length ? { app: 'leak', version: 1, txs, categories, goals, subs, settings } : null
}
