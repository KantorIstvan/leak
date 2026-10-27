// Supabase is the source of truth; db.ts is only its local mirror. Every write goes to the server
// first and reaches the mirror only once the server accepted it, so the UI never shows unsaved data.
import { createClient } from '@supabase/supabase-js'
import Dexie from 'dexie'
import { BUCKETS, db, DEFAULT_SETTINGS, emptyBackup, legacyBackup, mirrorBackup, rekey, type Backup, type Settings, type Sub, type Tx } from './db'
import { convert, rate } from './fx'
import { dueDates, monthOf, today, withRatioChange } from './lib'

let token: () => Promise<string | null> = async () => null
/** Hands over Clerk's session token getter: Supabase verifies the token and RLS scopes every query to its user. */
export const setToken = (get: typeof token) => {
  token = get
}

export const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  // No session, no request: with only the public key RLS answers "no rows", which a pull would mirror as an empty account.
  accessToken: async () => {
    const t = await token()
    if (!t) throw new Error('Not signed in')
    return t
  },
})

type Table = 'categories' | 'txs' | 'goals' | 'subs'
const TABLES: Table[] = ['categories', 'txs', 'goals', 'subs'] // parents first, for inserts

// The app's camelCase fields <-> the schema's snake_case columns.
const COLS: Record<string, string> = {
  categoryId: 'category_id',
  lastMonth: 'last_month',
  createdAt: 'created_at',
  ratioHistory: 'ratio_history',
  origAmount: 'orig_amount',
  origCurrency: 'orig_currency',
  limit: 'monthly_limit',
}
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

// For each running pull, the rows written here since it started fetching: its snapshot may predate them.
const pulling = new Set<Set<string>>()
const touch = (table: string, ids: string[]) => pulling.forEach((s) => ids.forEach((id) => s.add(`${table}/${id}`)))

type Row = { id: string } & Record<string, unknown>

/** Inserts rows under the ids they carry. */
async function insert(table: Table, rows: Row[]) {
  for (const c of chunks(rows, 500)) ok(await sb.from(table).insert(c.map(toRow)))
  touch(table, rows.map((r) => r.id))
  await db.table(table).bulkPut(rows)
}

async function patch(table: Table, ids: string[], changes: object) {
  const row = toRow(changes)
  if (!ids.length || !Object.keys(row).length) return // nothing to send
  for (const c of chunks(ids, 100)) ok(await sb.from(table).update(row).in('id', c))
  touch(table, ids)
  await db.table(table).bulkUpdate(ids.map((key) => ({ key, changes })))
}

async function drop(table: Table, ids: string[]) {
  if (!ids.length) return
  for (const c of chunks(ids, 100)) ok(await sb.from(table).delete().in('id', c))
  touch(table, ids)
  await db.table(table).bulkDelete(ids)
}

// add, update and remove are what the screens call: each also lands in the undo history.

export async function add<T extends object>(table: Table, rows: T[]) {
  // Stamped here rather than by the server, so the server and the mirror hold the same time.
  const withIds = rows.map((r) => ({ ...(table === 'txs' && { createdAt: Date.now() }), ...r, id: crypto.randomUUID() }))
  await insert(table, withIds)
  if (rows.length) record({ t: 'add', table, rows: withIds }, { what: 'add', table, n: rows.length })
  return withIds
}

/** Inserts rows under fixed ids, skipping the ones the server already has (another device or an earlier try was first). */
async function addOnce(table: Table, rows: { id: string }[]) {
  const made = new Set<unknown>()
  for (const c of chunks(rows, 500))
    for (const r of ok<{ id: string }[]>(await sb.from(table).upsert(c.map(toRow), { onConflict: 'id', ignoreDuplicates: true }).select('id'))) made.add(r.id)
  const fresh = rows.filter((r) => made.has(r.id))
  touch(table, fresh.map((r) => r.id))
  await db.table(table).bulkPut(fresh)
  return fresh
}

export async function update(table: Table, ids: string[], changes: object) {
  if (!ids.length || !Object.keys(toRow(changes)).length) return
  // What the changed fields held, read before the write; a field the row lacked goes back to null.
  const old = (await db.table(table).bulkGet(ids)) as (Row | undefined)[]
  const keys = Object.entries(changes).filter(([, v]) => v !== undefined).map(([k]) => k)
  await patch(table, ids, changes)
  const rows = old.filter((r) => r !== undefined).map((r) => ({ id: r.id, before: Object.fromEntries(keys.map((k) => [k, r[k] ?? null])), after: changes }))
  record({ t: 'update', table, rows }, { what: 'edit', table, n: ids.length })
}

export async function remove(table: Table, ids: string[]) {
  if (!ids.length) return
  const rows = ((await db.table(table).bulkGet(ids)) as (Row | undefined)[]).filter((r) => r !== undefined)
  await drop(table, ids)
  record({ t: 'remove', table, rows }, { what: 'delete', table, n: ids.length })
}

// One settings write at a time, each on top of the one before: two quick changes must not undo each other.
let settingsSaved: Promise<unknown> = Promise.resolve()
export function saveSettings(p: Partial<Settings>) {
  return putSettings(async () => {
    const cur = { ...DEFAULT_SETTINGS, ...(await db.settings.get('app')) }
    const next = { ...cur, ...p }
    // A new split applies from this month on; months before it keep the one they were planned with.
    if (p.ratios && BUCKETS.some((b) => p.ratios![b] !== cur.ratios[b])) next.ratioHistory = withRatioChange(cur.ratios, cur.ratioHistory, monthOf(today()))
    return [cur, next]
  })
}

/** Queues a settings write: `make` runs on its turn and returns the settings before and after; the after is saved. */
function putSettings(make: () => Promise<[Settings, Settings]>, recorded = true) {
  const run = settingsSaved.then(async () => {
    const [before, after] = await make()
    ok(await sb.from('settings').upsert(settingsRow(after)))
    touch('settings', ['app'])
    await db.settings.put(after)
    if (recorded) record({ t: 'settings', before, after }, { what: 'settings', n: 1 })
  })
  settingsSaved = run.catch(() => {})
  // A fresh promise: the catch above marks `run` itself handled, and a failed save must still reach main.tsx's alert.
  return run.then()
}

// --- Undo / redo ----------------------------------------------------------
// Every write the screens make is kept as an op that knows its opposite. Undo runs the opposites of a step's ops,
// last first; redo runs the ops again. Rows come back under their old ids, so the links between them hold.

export type Op =
  | { t: 'add' | 'remove'; table: Table; rows: Row[] }
  | { t: 'update'; table: Table; rows: { id: string; before: object; after: object }[] }
  | { t: 'settings'; before: Settings; after: Settings }

/** What a step did, for "Undo: …" (i18n.ts words it). */
export interface StepLabel {
  what: 'add' | 'edit' | 'delete' | 'settings' | 'import'
  table?: Table
  n: number
}

interface Step {
  label: StepLabel
  ops: Op[]
  at: number
}

export const inverse = (op: Op): Op =>
  op.t === 'settings'
    ? { ...op, before: op.after, after: op.before }
    : op.t === 'update'
      ? { ...op, rows: op.rows.map((r) => ({ id: r.id, before: r.after, after: r.before })) }
      : { ...op, t: op.t === 'add' ? 'remove' : 'add' }

async function apply(op: Op) {
  if (op.t === 'settings') return putSettings(async () => [op.before, op.after], false)
  if (op.t !== 'update') return op.t === 'add' ? insert(op.table, op.rows) : drop(op.table, op.rows.map((r) => r.id))
  // Rows that get the same values share one request.
  const groups = new Map<string, { changes: object; ids: string[] }>()
  for (const r of op.rows) {
    const key = JSON.stringify(r.after)
    if (!groups.has(key)) groups.set(key, { changes: r.after, ids: [] })
    groups.get(key)!.ids.push(r.id)
  }
  for (const g of groups.values()) await patch(op.table, g.ids, g.changes)
}

const HISTORY_MAX = 100
const undos: Step[] = []
const redos: Step[] = []
let open: Step | null = null // the step an undoable() call is gathering

function record(op: Op, label: StepLabel) {
  if (open) return void open.ops.push(op)
  const top = undos[undos.length - 1]
  const now = Date.now()
  // A slider dragged or colours picked in quick succession undo in one go.
  if (op.t === 'settings' && top?.label.what === 'settings' && now - top.at < 1500 && !redos.length) {
    ;(top.ops[0] as Extract<Op, { t: 'settings' }>).after = op.after
    top.at = now
    return
  }
  push({ label, ops: [op], at: now })
}

function push(step: Step) {
  undos.push(step)
  if (undos.length > HISTORY_MAX) undos.shift()
  redos.length = 0
  changed({ kind: 'did', label: step.label })
}

/** Runs several writes as one undo step (deleting a category also moves its transactions). */
// ponytail: one module-wide open step, so a write elsewhere meanwhile joins it; give each call its own if that bites.
export async function undoable<T>(label: StepLabel, run: () => Promise<T>) {
  const step: Step = { label, ops: [], at: 0 }
  open = step
  try {
    return await run()
  } finally {
    open = null
    // What got done before a failure did happen, so it can be undone too.
    if (step.ops.length) push({ ...step, at: Date.now() })
  }
}

let moving: Promise<unknown> = Promise.resolve()
const queue = (from: Step[], to: Step[], kind: 'undo' | 'redo') => {
  const run = moving.then(() => move(from, to, kind))
  moving = run.catch(() => {})
  return run
}

/** Undoes the newest step. Presses quicker than the server answers queue up. */
export const undo = () => queue(undos, redos, 'undo')
export const redo = () => queue(redos, undos, 'redo')

// ponytail: the history only knows this device's writes. An edit from another device in between can make an undo
// fail (the alert says so) or bring an older value back; diff against the server first if that ever matters.
async function move(from: Step[], to: Step[], kind: 'undo' | 'redo') {
  const step = from.pop()
  if (!step) return
  try {
    for (const op of kind === 'undo' ? step.ops.toReversed().map(inverse) : step.ops) await apply(op)
  } catch (e) {
    // Part of the step may be done: neither stack describes the data any more.
    clearHistory()
    throw e
  }
  to.push(step)
  changed({ kind, label: step.label })
}

export function clearHistory() {
  undos.length = 0
  redos.length = 0
  changed(null)
}

type Happened = { kind: 'did' | 'undo' | 'redo'; label: StepLabel; seq: number }
let seq = 0
let snapshot: { undo: StepLabel | null; redo: StepLabel | null; last: Happened | null } = { undo: null, redo: null, last: null }
const historyWatchers = new Set<() => void>()
function changed(what: Omit<Happened, 'seq'> | null) {
  snapshot = { undo: undos.at(-1)?.label ?? null, redo: redos.at(-1)?.label ?? null, last: what ? { ...what, seq: ++seq } : snapshot.last }
  historyWatchers.forEach((w) => w())
}

/** For useSyncExternalStore: what undo and redo would do now, and the last thing that happened. */
export const history = {
  subscribe(w: () => void) {
    historyWatchers.add(w)
    return () => void historyWatchers.delete(w)
  },
  get: () => snapshot,
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

/** Deep equality for rows as JSON holds them, key order aside. */
export const same = (a: unknown, b: unknown): boolean =>
  a === b ||
  (!!a &&
    !!b &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([k, v]) => same(v, (b as Record<string, unknown>)[k])))

/** The writes that make `local` match `server`, leaving the rows in `keep` as they are. */
export function diff<R extends { id: unknown }>(local: R[], server: R[], keep: (id: unknown) => boolean) {
  const mine = new Map(local.map((r) => [r.id, r]))
  const put = server.filter((r) => {
    const l = mine.get(r.id)
    mine.delete(r.id)
    return !keep(r.id) && !same(l, r)
  })
  return { put, gone: [...mine.keys()].filter((id) => !keep(id)) }
}

let started = 0 // pulls started
let applied = 0 // the newest pull mirrored so far: an older one that finishes later must not roll the mirror back
let replacing = false
let leaving = false // the account is being deleted: nothing may fill it again

/**
 * Brings the mirror in line with the server: picks up edits made on other devices. Only rows that differ are
 * written, so a pull that finds nothing new re-renders nothing. An account without settings is set up here.
 */
// ponytail: refetches everything; fine for one person's years of data, switch to updated_at deltas if it gets slow.
export async function pull() {
  const n = ++started
  const written = new Set<string>()
  pulling.add(written)
  try {
    const [categories, txs, goals, subs, settings] = await Promise.all([...TABLES, 'settings' as const].map(fetchAll))
    // No settings: a new account, or a replace that stopped halfway (see replaceAll). Neither is mirrored.
    if (!settings.length) {
      if (!replacing && !leaving) await setUp()
      return
    }
    // A replace running meanwhile may show up half done in this snapshot; it mirrors its own result when finished.
    if (replacing || n < applied) return
    applied = n
    const server: Record<string, Record<string, unknown>[]> = { categories, txs, goals, subs, settings: settings.map((s) => ({ ...s, id: 'app' })) }
    await db.transaction('rw', db.tables, () =>
      Promise.all(
        db.tables.map(async (t) => {
          const { put, gone } = diff(await t.toArray(), server[t.name], (id) => written.has(`${t.name}/${id}`))
          await t.bulkPut(put)
          await t.bulkDelete(gone)
        }),
      ),
    )
  } finally {
    pulling.delete(written)
  }
}

/**
 * Fills an account that has no settings row. A new one gets this device's pre-cloud data, or the defaults;
 * one whose replace stopped halfway gets back this device's copy, as it was before the replace began.
 */
async function setUp() {
  const mine = await mirrorBackup()
  let legacy = mine ? null : await legacyBackup()
  try {
    if (legacy) legacy = rekey(legacy)
  } catch (e) {
    console.error(e) // pre-cloud data this version can't read: start empty and leave it on disk untouched
    legacy = null
  }
  await replaceAll(mine ? rekey(mine) : (legacy ?? rekey(emptyBackup())))
  // Uploaded: it must not end up in the next account someone creates on this device.
  if (legacy) await Dexie.delete('leak')
}

/** Replaces all of the user's server data with an already rekeyed backup, then mirrors it. */
// ponytail: not atomic. Settings go first and come back last, so a replace that fails midway leaves an account
// without them: pulls then keep this device's copy and the next one restores it (setUp).
export async function replaceAll(b: Backup) {
  if (replacing) throw new Error('A replace is already running')
  replacing = true
  clearHistory() // every row gets a new id: nothing in the history exists any more
  try {
    await wipe()
    for (const t of TABLES) for (const c of chunks<object>(b[t] ?? [], 500)) ok(await sb.from(t).insert(c.map(toRow)))
    ok(await sb.from('settings').insert(settingsRow(b.settings[0])))
  } finally {
    replacing = false
  }
  await pull()
}

/** Deletes all of the user's rows on the server, settings first (see replaceAll). */
async function wipe() {
  ok(await sb.from('settings').delete().not('user_id', 'is', null))
  // Children first: a category can't go while a tx or subscription still points at it.
  for (const t of ['txs', 'subs', 'goals', 'categories'] as const) ok(await sb.from(t).delete().not('id', 'is', null))
}

/**
 * Erases the account's data just before Clerk deletes the account (clerk.ts), which only removes the user.
 * Should either step fail, the next launch puts this device's copy back (setUp), as after a replace that stopped.
 */
export async function deleteAccountData() {
  leaving = true // a pull meanwhile (the window got focus) must not put this device's copy back
  await wipe()
}

/** Deletes everything but the settings. */
export const wipeAll = async () => replaceAll(rekey({ ...emptyBackup(), settings: [{ ...DEFAULT_SETTINGS, ...(await db.settings.get('app')) }] }))
export const clearLocal = () => {
  clearHistory()
  return Promise.all(db.tables.map((t) => t.clear()))
}

/** Same id for the same subscription month on every device and every retry, so a month can only be charged once. */
export async function chargeId(subId: string, month: string) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${subId}/${month}`)))
  const hex = [...hash.slice(0, 16)].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Turns every subscription charge whose day has come into a real transaction. */
export async function syncSubs() {
  const current = today()
  for (const local of await db.subs.toArray()) {
    if (!dueDates(local.lastMonth, current, local.day).length) continue
    // Decided on the server's copy: this device's may be days old, and a charge deleted since must not come back.
    const row = ok<Record<string, unknown> | null>(await sb.from('subs').select('*').eq('id', local.id).maybeSingle())
    if (!row) continue // cancelled on another device
    const sub = fromRow(row) as unknown as Sub
    const dates = dueDates(sub.lastMonth, current, sub.day)
    if (!dates.length) continue // charged on another device; the next pull updates this one's copy
    const bucket = sub.bucket ?? (await db.categories.get(sub.categoryId))?.bucket ?? 'needs'
    const base = ((await db.settings.get('app')) ?? DEFAULT_SETTINGS).currency
    const foreign = sub.currency && sub.currency !== base ? sub.currency : null
    const charges = await Promise.all(
      dates.map(async (date): Promise<Tx> => ({
        id: await chargeId(sub.id, monthOf(date)),
        date,
        // A foreign price is converted at its charge day's rate, as the bank would.
        amount: foreign ? (convert(sub.amount, (await rate(foreign, base, date)).rate) ?? 1) : sub.amount,
        ...(foreign && { origAmount: sub.amount, origCurrency: foreign }),
        kind: 'expense',
        categoryId: sub.categoryId,
        bucket,
        note: sub.name,
        createdAt: Date.now(),
      })),
    )
    // Charges before the month moves on: if this stops in between, the next run redoes it, and the fixed ids
    // keep that (or another device doing the same) from charging twice.
    const fresh = await addOnce('txs', charges)
    const moved = { id: sub.id, before: { lastMonth: sub.lastMonth }, after: { lastMonth: monthOf(dates[dates.length - 1]) } }
    await patch('subs', [sub.id], moved.after)
    // Charges made by saving a subscription undo with it; the ones a sync makes on its own are not undoable.
    if (open) open.ops.push({ t: 'add', table: 'txs', rows: fresh }, { t: 'update', table: 'subs', rows: [moved] })
  }
}

// Whether the last sync failed: Main shows a banner while it did.
let failed = false
const watchers = new Set<() => void>()
export const syncFailed = {
  subscribe(w: () => void) {
    watchers.add(w)
    return () => void watchers.delete(w)
  },
  get: () => failed,
}
const setFailed = (v: boolean) => {
  if (failed === v) return
  failed = v
  watchers.forEach((w) => w())
}

let refreshing: Promise<void> | null = null
/** Pulls, then charges due subscriptions. Calls made while one runs share it. */
export function refresh() {
  return (refreshing ??= pull()
    .then(syncSubs)
    .then(
      () => setFailed(false),
      (e) => {
        setFailed(true)
        throw e
      },
    )
    .finally(() => (refreshing = null)))
}
