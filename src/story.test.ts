import { describe, expect, it } from 'vitest'
import type { Tx } from './db'
import { storyDue, weekdayOf, yearStory } from './story'

const tx = (date: string, amount: number, kind: Tx['kind'], categoryId: string, note = '', bucket: Tx['bucket'] = 'needs', extra: Partial<Tx> = {}): Tx => ({
  id: `${date}${amount}${note}${categoryId}`,
  date,
  amount,
  kind,
  categoryId,
  bucket: kind === 'income' ? null : bucket,
  note,
  ...extra,
})
const ratiosAt = () => ({ needs: 50, wants: 30, investments: 20 })

describe('yearStory', () => {
  const txs = [
    tx('2026-01-05', 1000, 'income', 'job'),
    tx('2026-01-06', 500, 'expense', 'rent'),
    tx('2026-01-07', 200, 'expense', 'etf', '', 'investments'),
    tx('2026-02-05', 1000, 'income', 'job'),
    tx('2026-02-06', 900, 'expense', 'rent'),
    ...['01', '02', '03'].map((m) => tx(`2026-${m}-10`, 10, 'expense', 'food', m === '02' ? 'lidl' : 'Lidl', 'wants')),
    tx('2026-03-11', 70, 'expense', 'travel', 'Hotel', 'wants', { tags: ['trip'], origAmount: 20, origCurrency: 'EUR' }),
    tx('2026-03-12', 5, 'expense', 'food', 'Netflix', 'wants'),
  ]
  const story = yearStory({ txs, cats: [], year: 2026, ratiosAt, now: '2026-03-31', subs: [{ id: 's', name: 'netflix', amount: 5, categoryId: 'food', day: 12, lastMonth: '2026-03' }], goals: [{ id: 'g', name: 'Bike', target: 100, saved: 100 }, { id: 'h', name: 'Trip', target: 300, saved: 50 }] })

  it('sums the year', () => {
    expect(story.income).toBe(2000)
    expect(story.spent).toBe(1505)
    expect(story.kept).toBe(495)
    expect(story.invested).toBe(200)
    expect(story.txCount).toBe(txs.length)
    expect([story.hit, story.counted]).toEqual([1, 2])
  })
  it('finds the best and hardest months', () => {
    expect(story.best).toBe(0)
    expect(story.hardest).toBe(1)
    expect(story.months[2]).toEqual({ income: 0, spent: 85, score: null })
  })
  it('ranks spending categories with counts and the top one’s busiest month', () => {
    expect(story.categories[0]).toEqual({ id: 'rent', amount: 1400, share: 1400 / 1505, count: 2 })
    expect(story.top).toMatchObject({ id: 'rent', month: 1 })
    expect(story.categories.find((c) => c.id === 'etf')).toBeUndefined()
  })
  it('spreads spending over weekdays and days', () => {
    expect(weekdayOf('2026-01-05')).toBe(0) // a Monday
    expect(story.weekdays.reduce((a, b) => a + b, 0)).toBe(1505)
    expect(story.topWeekday).toBe(weekdayOf('2026-02-06'))
    expect(story.hours).toBeUndefined() // no createdAt
    expect(story.activeDays).toBe(7)
    expect(story.costliestDay).toEqual({ date: '2026-02-06', amount: 900, count: 1 })
  })
  it('finds the longest quiet streak within the logged span', () => {
    // 2026-02-11 .. 2026-03-09 is the longest gap: 27 days
    expect(story.streak).toEqual({ from: '2026-02-11', to: '2026-03-09', days: 27 })
  })
  it('keeps the regular, the subscriptions, abroad, tags and goals', () => {
    expect(story.regular).toEqual({ note: 'Lidl', count: 3, amount: 30 })
    expect(story.subs).toEqual({ count: 1, yearly: 5, priciest: { name: 'netflix', yearly: 5 } })
    expect(story.abroad).toEqual({ count: 1, amount: 70, currencies: ['EUR'] })
    expect(story.tags).toEqual([{ tag: 'trip', amount: 70, count: 1 }])
    expect(story.goals).toEqual({ saved: 150, target: 400, reached: 1, count: 2 })
    expect(story.vsLast).toBeUndefined()
  })
  it('compares with the year before when it has anything', () => {
    const s = yearStory({ txs, prevTxs: [tx('2025-05-01', 100, 'income', 'job'), tx('2025-05-02', 80, 'expense', 'rent')], cats: [], year: 2026, ratiosAt, now: '2026-03-31' })
    expect(s.vsLast).toEqual({ income: 2000, spent: 1505, kept: 495, prevIncome: 100, prevSpent: 80, prevKept: 20 })
  })
  it('handles an empty year', () => {
    const s = yearStory({ txs: [], cats: [], year: 2026, ratiosAt })
    expect(s.best).toBeUndefined()
    expect(s.top).toBeUndefined()
    expect(s.streak).toBeUndefined()
    expect(s.topWeekday).toBeUndefined()
    expect(s.keptShare).toBe(0)
  })
})

describe('storyDue', () => {
  it('offers the running year from 20 December and the last one through January', () => {
    expect(storyDue('2026-12-19')).toBeNull()
    expect(storyDue('2026-12-20')).toBe(2026)
    expect(storyDue('2027-01-31')).toBe(2026)
    expect(storyDue('2027-02-01')).toBeNull()
  })
})
