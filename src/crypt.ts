// The words and amounts a user types are encrypted on the device before they reach Supabase, so the database and its
// dashboard show ciphertext. Each account has its own random AES-GCM key, kept with the Clerk user rather than in
// Supabase: the database alone reads as noise. Whoever runs both Clerk and Supabase could still put the two together,
// so this keeps the data out of sight, it does not make it unreadable to the operator.
// Fields are sealed one by one, so an edit still sends only what changed and two devices editing different fields of
// a row both keep their change. Dates, kinds, buckets and the ids linking rows stay readable for the schema's checks.

const PREFIX = 'e1:' // marks a sealed value, and the format version

/** The sealed columns of each table (the schema's snake_case names). Settings are not sealed. */
export const SEALED: Record<string, string[]> = {
  categories: ['name', 'monthly_limit'],
  txs: ['note', 'amount', 'orig_amount', 'tags'],
  goals: ['name', 'target', 'saved'],
  subs: ['name', 'amount'],
}
// Text columns since encryption: a value an older version saved comes back as a numeric string.
const NUMBERS = new Set(['amount', 'orig_amount', 'monthly_limit', 'target', 'saved'])

/** Where the account's key is kept (App wires it to the Clerk user). `fresh` reloads it from the server first. */
export interface KeyStore {
  read(fresh: boolean): Promise<string | undefined>
  write(key: string): Promise<void>
}

let store: KeyStore | null = null
let key: Promise<CryptoKey> | null = null
const plain = new Map<string, unknown>() // sealed value -> what it holds: a pull decrypts only what changed since the last

/** Sets the signed-in account's key store; null on sign-out. Forgets the key and everything decrypted with it. */
export function setKeyStore(s: KeyStore | null) {
  store = s
  key = null
  plain.clear()
}

const b64 = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function load(create: boolean) {
  if (!store) throw new Error('Not signed in')
  let raw = (await store.read(false)) ?? (await store.read(true))
  if (!raw) {
    // Without a key, sealed rows on the server mean it got lost: a new one would make them unreadable for good.
    if (!create) throw new Error('This account’s encryption key is missing')
    await store.write(b64(crypto.getRandomValues(new Uint8Array(32))))
    // Read back rather than trusting our own: if two devices set the account up at once, the last write wins for both.
    raw = await store.read(true)
    if (!raw) throw new Error('The encryption key could not be saved')
  }
  return crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/**
 * Loads the account's key. `create` makes one when the account has none, which only a pull may allow, and only when
 * it found nothing sealed on the server.
 */
export function unlock(create = false) {
  key ??= load(create)
  return key.catch((e) => {
    key = null // try again next time: the failure may have been the network
    throw e
  })
}

export const isSealed = (v: unknown): v is string => typeof v === 'string' && v.startsWith(PREFIX)

async function encrypt(k: CryptoKey, v: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(v))))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv)
  out.set(ct, iv.length)
  const s = PREFIX + b64(out)
  plain.set(s, v)
  return s
}

async function decrypt(v: unknown, number: boolean) {
  if (!isSealed(v)) return number && typeof v === 'string' ? Number(v) : v
  if (plain.has(v)) return plain.get(v)
  const bytes = unb64(v.slice(PREFIX.length))
  // A wrong key throws here, which fails the pull and leaves this device's copy as it was.
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, await unlock(), bytes.subarray(12))
  const out = JSON.parse(new TextDecoder().decode(pt))
  plain.set(v, out)
  return out
}

/** A row as the schema has it, with its sensitive fields encrypted. Fields it lacks stay absent, nulls stay null. */
export async function seal(table: string, row: Record<string, unknown>) {
  const fields = SEALED[table]?.filter((f) => row[f] != null)
  if (!fields?.length) return row
  const k = await unlock()
  const out = { ...row }
  for (const f of fields) out[f] = f === 'tags' ? await Promise.all((row[f] as unknown[]).map((t) => encrypt(k, t))) : await encrypt(k, row[f])
  return out
}

/** The opposite of seal. Values saved before encryption existed pass through, numeric strings as numbers. */
export async function open(table: string, row: Record<string, unknown>) {
  const fields = SEALED[table]?.filter((f) => row[f] != null)
  if (!fields?.length) return row
  const out = { ...row }
  for (const f of fields) out[f] = f === 'tags' ? await Promise.all((row[f] as unknown[]).map((t) => decrypt(t, false))) : await decrypt(row[f], NUMBERS.has(f))
  return out
}

const values = (table: string, row: Record<string, unknown>) =>
  (SEALED[table] ?? []).flatMap((f) => (row[f] == null ? [] : f === 'tags' ? (row[f] as unknown[]) : [row[f]]))

/** Whether a server row still holds a sensitive value in the clear: saved before encryption, or by an older version. */
export const isPlain = (table: string, row: Record<string, unknown>) => values(table, row).some((v) => !isSealed(v))
/** Whether a server row holds anything sealed. */
export const hasSealed = (table: string, row: Record<string, unknown>) => values(table, row).some(isSealed)
