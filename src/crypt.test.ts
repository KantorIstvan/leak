import { beforeEach, describe, expect, it } from 'vitest'
import { hasSealed, isPlain, isSealed, open, seal, setKeyStore, unlock, type KeyStore } from './crypt'

let saved: string | undefined
const store: KeyStore = { read: async () => saved, write: async (k) => void (saved = k) }

beforeEach(() => {
  saved = undefined
  setKeyStore(store)
})

describe('seal and open', () => {
  it('round-trips a transaction, leaving the unsealed fields as they were', async () => {
    await unlock(true)
    const row = { id: 'a', date: '2026-01-05', amount: 5000000, orig_amount: null, note: 'sminktetoválás', tags: ['szépség', 'nyár'], category_id: 'c' }
    const out = await seal('txs', row)
    expect(isSealed(out.amount)).toBe(true)
    expect(isSealed(out.note)).toBe(true)
    expect((out.tags as string[]).every(isSealed)).toBe(true)
    expect(JSON.stringify(out)).not.toContain('sminktetoválás')
    expect(out).toMatchObject({ id: 'a', date: '2026-01-05', orig_amount: null, category_id: 'c' })
    setKeyStore(store) // a fresh session: nothing cached, decrypted with the stored key
    expect(await open('txs', out)).toEqual(row)
  })

  it('seals only the fields a partial update carries', async () => {
    await unlock(true)
    const out = await seal('txs', { note: 'x' })
    expect(Object.keys(out)).toEqual(['note'])
  })

  it('gives the same value a different ciphertext each time', async () => {
    await unlock(true)
    const [a, b] = await Promise.all([seal('goals', { name: 'Car' }), seal('goals', { name: 'Car' })])
    expect(a.name).not.toBe(b.name)
  })

  it('reads values saved before encryption, numeric strings as numbers', async () => {
    await unlock(true)
    expect(await open('txs', { amount: '1200', note: 'old', tags: ['trip'] })).toEqual({ amount: 1200, note: 'old', tags: ['trip'] })
    expect(await open('settings', { lang: 'hu' })).toEqual({ lang: 'hu' })
  })

  it('refuses ciphertext made with another key', async () => {
    await unlock(true)
    const out = await seal('subs', { name: 'Spotify' })
    saved = undefined
    setKeyStore(store)
    await unlock(true)
    await expect(open('subs', out)).rejects.toThrow()
  })
})

describe('unlock', () => {
  it('creates a key only when allowed', async () => {
    await expect(unlock()).rejects.toThrow(/missing/)
    expect(saved).toBeUndefined()
    await unlock(true)
    expect(saved).toBeTruthy()
  })

  it('keeps the key the account already has', async () => {
    await unlock(true)
    const first = saved
    setKeyStore(store)
    await unlock(true)
    expect(saved).toBe(first)
  })
})

describe('plain and sealed rows', () => {
  it('tells rows still in the clear from sealed ones', async () => {
    await unlock(true)
    const plain = { id: 'g', name: 'Car', target: 100, saved: 0 }
    const sealed = await seal('goals', plain)
    expect(isPlain('goals', plain)).toBe(true)
    expect(hasSealed('goals', plain)).toBe(false)
    expect(isPlain('goals', sealed)).toBe(false)
    expect(hasSealed('goals', sealed)).toBe(true)
    expect(isPlain('txs', { note: (await seal('txs', { note: 'a' })).note, amount: 5, tags: null })).toBe(true)
  })
})
