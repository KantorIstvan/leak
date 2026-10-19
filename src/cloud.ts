// Supabase is the source of truth; db.ts is only its local mirror. Every write goes to the server
// first and reaches the mirror only once the server accepted it, so the UI never shows unsaved data.
import { createClient } from '@supabase/supabase-js'
import { db, emptyBackup, legacyBackup, rekey, type Backup, type Settings } from './db'

let token: () => Promise<string | null> = async () => null
/** Hands over Clerk's session token getter: Supabase verifies the token and RLS scopes every query to its user. */
export const setToken = (get: typeof token) => {
  token = get
}

export const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  accessToken: () => token(),
})

type Table = 'categories' | 'txs' | 'goals' | 'subs'
const TABLES: Table[] = ['categories', 'txs', 'goals', 'subs'] // parents first, for inserts

// The app's camelCase fields <-> the schema's snake_case columns.
const COLS: Record<string, string> = { categoryId: 'category_id', lastMonth: 'last_month', createdAt: 'created_at' }
const FIELDS = Object.fromEntries(Object.entries(COLS).map(([k, v]) => [v, k]))

export const toRow = (o: object) =>
  Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [COLS[k] ?? k, k === 'createdAt' ? new Date(v).toISOString() : v]),
  )

export const fromRow = (r: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(r)
      .filter(([k]) => k !== 'user_id')
      .map(([k, v]) => [FIELDS[k] ?? k, k === 'created_at' ? Date.parse(v as string) : v]),
  )

const settingsRow = (s: Settings) => {
  const { id: _, ...rest } = s
  return toRow(rest)
}

function ok<T>({ data, error }: { data: T | null; error: unknown }) {
  if (error) throw error
  return data as T
}

// Inserts go in batches; id lists stay short enough for a URL.
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

export async function add<T extends object>(table: Table, rows: T[]) {
  const withIds = rows.map((r) => ({ ...r, id: crypto.randomUUID() }))
  for (const c of chunks(withIds, 500)) ok(await sb.from(table).insert(c.map(toRow)))
  await db.table(table).bulkAdd(withIds)
}

export async function update(table: Table, ids: string[], changes: object) {
  for (const c of chunks(ids, 100)) ok(await sb.from(table).update(toRow(changes)).in('id', c))
  await db.table(table).bulkUpdate(ids.map((key) => ({ key, changes })))
}

export async function remove(table: Table, ids: string[]) {
  for (const c of chunks(ids, 100)) ok(await sb.from(table).delete().in('id', c))
  await db.table(table).bulkDelete(ids)
}

export async function saveSettings(p: Partial<Settings>) {
  const next = { ...(await db.settings.get('app'))!, ...p }
  ok(await sb.from('settings').upsert(settingsRow(next)))
  await db.settings.put(next)
}

async function fetchAll(table: Table | 'settings') {
  const rows: Record<string, unknown>[] = []
  // Supabase caps a response at 1000 rows.
  for (let from = 0; ; from += 1000) {
    const page = ok(await sb.from(table).select('*').order(table === 'settings' ? 'user_id' : 'id').range(from, from + 999))
    rows.push(...page)
    if (page.length < 1000) return rows.map(fromRow)
  }
}

/** Replaces the local mirror with the server's rows: picks up edits made on other devices. */
// ponytail: refetches everything; fine for one person's years of data, switch to updated_at deltas if it gets slow.
export async function pull() {
  const [categories, txs, goals, subs, settings] = await Promise.all([...TABLES, 'settings' as const].map(fetchAll))
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await Promise.all([
      db.categories.bulkAdd(categories as never),
      db.txs.bulkAdd(txs as never),
      db.goals.bulkAdd(goals as never),
      db.subs.bulkAdd(subs as never),
      db.settings.bulkAdd(settings.map((s) => ({ ...s, id: 'app' })) as never),
    ])
  })
}

/** Replaces all of the user's server data with an already rekeyed backup, then mirrors it. */
// ponytail: not atomic, a failure midway leaves partial data; the backup file can simply be imported again.
export async function replaceAll(b: Backup) {
  // Children first: a category can't go while a tx or subscription still points at it.
  for (const t of ['txs', 'subs', 'goals', 'categories'] as const) ok(await sb.from(t).delete().not('id', 'is', null))
  ok(await sb.from('settings').delete().not('user_id', 'is', null))
  for (const t of TABLES) for (const c of chunks<object>(b[t] ?? [], 500)) ok(await sb.from(t).insert(c.map(toRow)))
  ok(await sb.from('settings').insert(settingsRow(b.settings[0])))
  await pull()
}

/** First sync after sign-in. A new account gets this device's pre-cloud data, or the defaults. */
export async function start() {
  const { count, error } = await sb.from('settings').select('user_id', { count: 'exact', head: true })
  if (error) throw error
  if (count) await pull()
  else await replaceAll(rekey((await legacyBackup()) ?? emptyBackup()))
}

export const wipeAll = () => replaceAll(rekey(emptyBackup()))
export const clearLocal = () => Promise.all(db.tables.map((t) => t.clear()))
