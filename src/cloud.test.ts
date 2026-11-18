import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chargeId, fromRow, pull, sb, syncSubs } from './cloud'
import { setKeyStore, unlock } from './crypt'
import { db, DEFAULT_SETTINGS } from './db'
import { monthOf, shiftMonth, today } from './lib'

type Row = Record<string, unknown>
let server: Record<string, Row[]> = {}

// Supabase in memory: just the query builder calls syncSubs and pull make. Deleting throws, so a test sees a wipe start.
const fake = (table: string) => {
  const rows = (server[table] ??= [])
  let data: unknown = rows
  let changes: object = {}
  const q = {
    select: () => q,
    order: () => q,
    range: () => q,
    maybeSingle: () => q,
    eq: (_: string, id: unknown) => ((data = rows.find((r) => r.id === id) ?? null), q),
    upsert: (input: Row[]) => {
      const fresh = input.filter((r) => !rows.some((x) => x.id === r.id)) // ignoreDuplicates
      rows.push(...fresh)
      data = fresh.map((r) => ({ id: r.id }))
      return q
    },
    update: (c: object) => ((changes = c), q),
    in: (_: string, ids: unknown[]) => {
      for (const r of rows) if (ids.includes(r.id)) Object.assign(r, changes)
      return q
    },
    delete: () => {
      throw new Error('wiped')
    },
    then: (done: (r: { data: unknown; error: null }) => void) => done({ data, error: null }),
  }
  return q
}

beforeEach(async () => {
  server = {}
  vi.spyOn(sb, 'from').mockImplementation(fake as never)
  let key: string | undefined
  setKeyStore({ read: async () => key, write: async (k) => void (key = k) })
  await unlock(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('syncSubs', () => {
  it('charges every due subscription once, even when one has no exchange rate', async () => {
    const month = monthOf(today())
    const sub = (id: string, currency: string | null) => ({ id, name: id, amount: 1000, currency, category_id: 'c', bucket: 'wants', day: 1, last_month: shiftMonth(month, -1) })
    server.subs = [sub('usd', 'USD'), sub('eur', null)]
    vi.spyOn(db.subs, 'toArray').mockResolvedValue(server.subs.map((r) => fromRow({ ...r })) as never)
    vi.spyOn(db.settings, 'get').mockResolvedValue({ ...DEFAULT_SETTINGS, currency: 'EUR' })
    vi.spyOn(db.txs, 'bulkPut').mockResolvedValue('' as never)
    vi.spyOn(db.subs, 'bulkUpdate').mockResolvedValue(1)
    vi.stubGlobal('fetch', async () => new Response(null, { status: 503 })) // the rate service is down

    await expect(syncSubs()).rejects.toThrow('No exchange rate')
    expect(server.txs.map((r) => r.id)).toEqual([await chargeId('eur', month)])
    // The next sync charges the euro one no second time, though this device's copy still says it is due.
    await expect(syncSubs()).rejects.toThrow('No exchange rate')
    expect(server.txs).toHaveLength(1)
  })
})

describe('pull', () => {
  // An account without settings (another device may be restoring it), and this device holds its data.
  const settingsMissing = () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] })
    server.categories = [{ id: 'c', user_id: 'u', name: 'Food', color: '#f59e0b', kind: 'expense', bucket: 'needs', icon: null, monthly_limit: null }]
    vi.spyOn(db.settings, 'count').mockResolvedValue(1)
    vi.spyOn(db.categories, 'toArray').mockResolvedValue([{ id: 'c', name: 'Food', color: '#f59e0b', kind: 'expense', bucket: 'needs' }])
    for (const t of [db.txs, db.goals, db.subs]) vi.spyOn(t, 'toArray').mockResolvedValue([])
    vi.spyOn(db.settings, 'toArray').mockResolvedValue([DEFAULT_SETTINGS])
  }

  it('waits a minute before putting this device’s copy back, then looks again by itself', async () => {
    settingsMissing()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    await pull() // nothing deleted
    await vi.advanceTimersByTimeAsync(61_000)
    // Still no settings: the device's copy goes back, starting with a wipe.
    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith(expect.objectContaining({ message: 'wiped' })))
  })

  it('starts the minute over after a gap: the settings may have come back and gone again meanwhile', async () => {
    settingsMissing()
    await pull()
    vi.setSystemTime(Date.now() + 5 * 60_000) // no pull in between: the computer slept, say
    await pull() // nothing deleted: a restore may have begun just now
    vi.setSystemTime(Date.now() + 61_000)
    await expect(pull()).rejects.toThrow('wiped')
  })
})
