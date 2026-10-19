import { describe, expect, it } from 'vitest'
import type { Tx } from './db'
import { avgMonthlyIncome, byMonth, currencySymbol, dueDates, EMPTY_QUERY, formatMoney, groupAmount, hexToHsv, hsvToHex, isDay, parseAmount, plan, queryTxs, shiftMonth, suggestNote, summarize, tint, type TxQuery } from './lib'

const tx = (p: Partial<Tx>): Tx => ({ id: '0', date: '2026-08-01', amount: 0, kind: 'expense', categoryId: '1', bucket: 'needs', note: '', ...p })

describe('parseAmount', () => {
  it('accepts spaces, commas and dots', () => {
    expect(parseAmount('4 700')).toBe(470000)
    expect(parseAmount('12,5')).toBe(1250)
    expect(parseAmount('12.99')).toBe(1299)
  })
  it('rejects junk, zero and negatives', () => {
    for (const s of ['', 'abc', '0', '-5', '1.234', '1e3']) expect(parseAmount(s)).toBeNull()
  })
  it('rejects amounts too large to add up exactly', () => {
    expect(parseAmount('100000000000')).toBe(1e13)
    expect(parseAmount('100000000001')).toBeNull()
    expect(parseAmount('99999999999999999999')).toBeNull()
  })
})

describe('isDay', () => {
  it('accepts only real calendar days', () => {
    for (const s of ['2026-02-28', '2024-02-29', '2026-12-31']) expect(isDay(s)).toBe(true)
    for (const s of ['2026-02-29', '2026-13-01', '2026-00-10', '0999-01-01', '2026-1-1', 20260101]) expect(isDay(s)).toBe(false)
  })
})

describe('formatMoney', () => {
  it('hides fillér when whole', () => {
    expect(formatMoney(46000000, 'HUF', 'hu-HU').replace(/\s/g, ' ')).toBe('460 000 Ft')
    expect(formatMoney(1250, 'EUR', 'en-US')).toBe('€12.50')
  })
})

describe('dueDates', () => {
  it('fills every missed month and clamps the day', () => {
    expect(dueDates('2025-12', '2026-02', 31)).toEqual(['2026-01-31', '2026-02-28'])
    expect(dueDates('2026-02', '2026-02', 5)).toEqual([])
  })
})

describe('shiftMonth', () => {
  it('wraps years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })
})

describe('summarize + plan', () => {
  // The August sheet: 460 000 income, 50/30/20 -> 230 000 / 138 000 / 92 000 goals.
  const august = [
    tx({ kind: 'income', amount: 46000000, bucket: null, categoryId: '9' }),
    tx({ amount: 12278000, bucket: 'needs' }),
    tx({ amount: 10254300, bucket: 'wants', categoryId: '2' }),
    tx({ amount: 8400000, bucket: 'investments', categoryId: '3' }),
  ]
  const s = summarize(august)

  it('totals income, expenses and buckets', () => {
    expect(s.income).toBe(46000000)
    expect(s.expense).toBe(30932300)
    expect(s.buckets).toEqual({ needs: 12278000, wants: 10254300, investments: 8400000 })
  })

  it('splits income by ratios', () => {
    const p = plan(s, { needs: 50, wants: 30, investments: 20 })
    expect(p.map((b) => b.goal)).toEqual([23000000, 13800000, 9200000])
    expect(p.map((b) => b.left)).toEqual([10722000, 3545700, 800000])
  })

  it('flags overspending as negative left', () => {
    const p = plan(summarize([tx({ kind: 'income', amount: 1000, bucket: null }), tx({ amount: 900, bucket: 'wants' })]), {
      needs: 50,
      wants: 30,
      investments: 20,
    })
    expect(p[1].left).toBe(-600)
  })
})

describe('byMonth', () => {
  it('buckets by month and ignores other years', () => {
    const m = byMonth([tx({ date: '2026-03-05', amount: 100 }), tx({ date: '2025-03-05', amount: 999 })], 2026)
    expect(m).toHaveLength(12)
    expect(m[2].expense).toBe(100)
    expect(m[0].expense).toBe(0)
  })
})

describe('tint', () => {
  it('scales with the share of monthly income', () => {
    expect(tint(100000, 100000000)).toBeLessThan(12) // 1 000 of 1 000 000: barely tinted
    expect(tint(70000000, 100000000)).toBeGreaterThan(80) // 700k of 1M: strong
    expect(tint(70000000, 1000000000)).toBeLessThan(tint(70000000, 100000000)) // richer user, weaker tint
    expect(tint(200000000, 100000000)).toBe(100)
    expect(tint(500, 0)).toBe(100)
  })
})

describe('avgMonthlyIncome', () => {
  it('averages over months that had income', () => {
    const txs = [
      tx({ kind: 'income', amount: 100, date: '2026-01-05' }),
      tx({ kind: 'income', amount: 300, date: '2026-03-05' }),
      tx({ kind: 'expense', amount: 999, date: '2026-02-05' }),
    ]
    expect(avgMonthlyIncome(txs)).toBe(200)
  })
})

describe('groupAmount', () => {
  it('groups thousands with spaces while typing', () => {
    expect(groupAmount('100000000')).toBe('100 000 000')
    expect(groupAmount('4 70')).toBe('470')
    expect(groupAmount('12345,5')).toBe('12 345,5')
    expect(groupAmount(',5')).toBe('0,5')
    expect(groupAmount('007')).toBe('7')
    expect(groupAmount('abc')).toBe('')
  })
  it('keeps extra decimals so parseAmount still rejects them', () => {
    expect(groupAmount('1.000')).toBe('1.000')
    expect(parseAmount(groupAmount('1.000'))).toBeNull()
    expect(parseAmount(groupAmount('1234567,89'))).toBe(123456789)
  })
})

describe('hsv <-> hex', () => {
  it('round-trips', () => {
    for (const hex of ['#3b82f6', '#e11d48', '#000000', '#ffffff', '#65a30d']) expect(hsvToHex(...hexToHsv(hex)!)).toBe(hex)
    expect(hsvToHex(0, 1, 1)).toBe('#ff0000')
    expect(hexToHsv('nope')).toBeNull()
  })
})

describe('queryTxs', () => {
  const names: Record<string, string> = { 1: 'Kávézó', 2: 'Rent', 3: 'Job' }
  const name = (id: string) => names[id]
  const txs = [
    tx({ id: '1', date: '2026-08-03', amount: 470000, categoryId: '1', bucket: 'wants', note: 'Espresso' }),
    tx({ id: '2', date: '2026-08-01', amount: 15000000, categoryId: '2', bucket: 'needs' }),
    tx({ id: '3', date: '2026-08-05', amount: 46000000, kind: 'income', categoryId: '3', bucket: null, note: 'Salary' }),
  ]
  const ids = (q: Partial<TxQuery>) => queryTxs(txs, { ...EMPTY_QUERY, ...q }, name).map((t) => Number(t.id))

  it('searches note, accent-folded category and amount', () => {
    expect(ids({ text: 'kavezo' })).toEqual([1])
    expect(ids({ text: 'salary' })).toEqual([3])
    expect(ids({ text: '4 700' })).toEqual([1])
    expect(ids({ text: '150000' })).toEqual([2])
  })
  it('filters', () => {
    expect(ids({ kind: 'income' })).toEqual([3])
    expect(ids({ buckets: ['needs', 'wants'] })).toEqual([1, 2])
    expect(ids({ categories: ['2'] })).toEqual([2])
    expect(ids({ min: 1000000, max: 20000000 })).toEqual([2])
    expect(ids({ from: '2026-08-02', to: '2026-08-04' })).toEqual([1])
  })
  it('sorts', () => {
    expect(ids({})).toEqual([3, 1, 2])
    expect(ids({ sort: 'date-asc' })).toEqual([2, 1, 3])
    expect(ids({ sort: 'amount-desc' })).toEqual([3, 2, 1])
    expect(ids({ sort: 'category' })).toEqual([3, 1, 2])
  })
})

describe('currencySymbol', () => {
  it('uses CLDR symbols from the UI or home locale, else the ISO code', () => {
    expect(currencySymbol('HUF', 'hu-HU')).toBe('Ft')
    expect(currencySymbol('PLN', 'en-US')).toBe('zł')
    expect(currencySymbol('CHF', 'hu-HU')).toBe('CHF')
    expect(currencySymbol('XDR', 'hu-HU')).toBe('XDR')
  })
})

describe('suggestNote', () => {
  const txs = [
    tx({ id: '1', note: 'Pizza Forte', categoryId: 'dining', date: '2026-09-10' }),
    tx({ id: '2', note: 'Pizza Hut', categoryId: 'junk', date: '2026-08-01' }),
    tx({ id: '3', note: 'pizza hut ', categoryId: 'junk2', date: '2026-08-20' }),
    tx({ id: '4', note: 'Kávé', date: '2026-08-02' }),
    tx({ id: '5', note: 'Fizetés', kind: 'income', categoryId: 'job' }),
    tx({ id: '6', note: '' }),
  ]
  it('picks the most used match, with the text and category of its latest use', () => {
    expect(suggestNote(txs, 'piz', 'expense')).toEqual({ note: 'pizza hut', categoryId: 'junk2' })
  })
  it('breaks ties by recency', () => {
    expect(suggestNote([...txs, tx({ note: 'Pizza Forte', date: '2026-01-01' })], 'Piz', 'expense')?.note).toBe('Pizza Forte')
  })
  it('ignores case and accents', () => {
    expect(suggestNote(txs, 'KAVE', 'expense')?.note).toBe('Kávé')
  })
  it('only suggests notes of the same kind', () => {
    expect(suggestNote(txs, 'fiz', 'expense')).toBeUndefined()
    expect(suggestNote(txs, 'fiz', 'income')?.categoryId).toBe('job')
  })
  it('suggests nothing for blank or unknown input', () => {
    for (const s of ['', ' ', 'xyz']) expect(suggestNote(txs, s, 'expense')).toBeUndefined()
  })
})
