import { describe, expect, it } from 'vitest'
import type { Tx } from './db'
import { byMonth, dueDates, formatMoney, parseAmount, plan, shiftMonth, summarize } from './lib'

const tx = (p: Partial<Tx>): Tx => ({ id: 0, date: '2026-08-01', amount: 0, kind: 'expense', categoryId: 1, bucket: 'needs', note: '', ...p })

describe('parseAmount', () => {
  it('accepts spaces, commas and dots', () => {
    expect(parseAmount('4 700')).toBe(470000)
    expect(parseAmount('12,5')).toBe(1250)
    expect(parseAmount('12.99')).toBe(1299)
  })
  it('rejects junk, zero and negatives', () => {
    for (const s of ['', 'abc', '0', '-5', '1.234', '1e3']) expect(parseAmount(s)).toBeNull()
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
    tx({ kind: 'income', amount: 46000000, bucket: null, categoryId: 9 }),
    tx({ amount: 12278000, bucket: 'needs' }),
    tx({ amount: 10254300, bucket: 'wants', categoryId: 2 }),
    tx({ amount: 8400000, bucket: 'investments', categoryId: 3 }),
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
