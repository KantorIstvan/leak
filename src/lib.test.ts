import { describe, expect, it } from 'vitest'
import type { Category, Tx } from './db'
import { avgMonthlyIncome, byMonth, currencySymbol, dueDates, EMPTY_QUERY, formatMoney, groupAmount, hexToHsv, hsvToHex, insights, isDay, reviewDue, cleanTag, tagTotals, yearRecap, monthScore, hitTarget, earned, investedOf, savingsIncome, parseAmount, plan, ratiosFor, withRatioChange, queryTxs, shiftMonth, ssoReturn, suggestNote, summarize, tint, type TxQuery } from './lib'

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

describe('ssoReturn', () => {
  it('reads the nonce from Clerk’s return link', () => {
    expect(ssoReturn('leakbudget://sso-callback?rotating_token_nonce=abc%3D')).toEqual({ nonce: 'abc=' })
    expect(ssoReturn('leakbudget://sso-callback/?rotating_token_nonce=abc')).toEqual({ nonce: 'abc' })
    // A brand-new account comes back without one, to be finished as a sign-up.
    expect(ssoReturn('leakbudget://sso-callback')).toEqual({ nonce: null })
  })
  it('ignores any other link, since anyone can open Leak with one', () => {
    for (const s of ['leakbudget://other?rotating_token_nonce=x', 'evil://sso-callback?rotating_token_nonce=x', 'https://sso-callback/?rotating_token_nonce=x', 'leakbudget://sso-callback#x', 'not a link', ''])
      expect(ssoReturn(s)).toBeNull()
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
    expect(dueDates('2025-12', '2026-02-28', 31)).toEqual(['2026-01-31', '2026-02-28'])
    expect(dueDates('2026-02', '2026-02-28', 5)).toEqual([])
  })
  it('waits for the charge day', () => {
    expect(dueDates('2026-09', '2026-10-18', 19)).toEqual([])
    expect(dueDates('2026-09', '2026-10-19', 19)).toEqual(['2026-10-19'])
    expect(dueDates('2026-08', '2026-10-18', 19)).toEqual(['2026-09-19'])
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

describe('money out of savings', () => {
  const txs = [
    tx({ kind: 'income', amount: 1000, bucket: null, categoryId: 'job' }),
    tx({ kind: 'income', amount: 500, bucket: null, categoryId: 'sold' }),
    tx({ amount: 400 }),
    tx({ amount: 300, bucket: 'investments' }),
  ]
  it('stays in the money that came in, apart from what was earned', () => {
    expect(summarize(txs)).toMatchObject({ income: 1500, withdrawn: 0 })
    const s = summarize(txs, new Set(['sold']))
    expect(s).toMatchObject({ income: 1500, withdrawn: 500, expense: 700 })
    expect(earned(s)).toBe(1000)
    expect(investedOf(s)).toBe(0) // 300 in, 500 out
  })
  it('budgets the split from earned income only', () => {
    expect(plan(summarize(txs, new Set(['sold'])), { needs: 50, wants: 30, investments: 20 }).map((b) => b.goal)).toEqual([500, 300, 200])
  })
  it('names the income categories marked as it', () => {
    const cats = [{ id: 'job', kind: 'income', bucket: 'needs' }, { id: 'sold', kind: 'income', bucket: 'investments' }, { id: 'etf', kind: 'expense', bucket: 'investments' }] as Category[]
    expect([...savingsIncome(cats)]).toEqual(['sold'])
  })
})

describe('monthScore', () => {
  const month = (needs: number, wants: number, investments = 0, income = 1000, withdrawn = 0) => ({ income, withdrawn, expense: needs + wants + investments, buckets: { needs, wants, investments }, byCategory: new Map() })
  const r = { needs: 47, wants: 28, investments: 25 }
  it('grades each bucket against its own budget, and spending against income', () => {
    expect(monthScore(month(470, 280, 250), r)).toMatchObject({ score: 100, tier: 'healthy' })
    // Wants 43% over budget loses 43% of its grade; nothing invested loses all of that one.
    expect(monthScore(month(300, 400), r)).toMatchObject({ score: 76, tier: 'coping', rate: 0.3 })
    expect(monthScore(month(300, 400, 250), r)).toMatchObject({ score: 93, tier: 'healthy' })
    expect(monthScore(month(0, 750), r)).toMatchObject({ score: 67, tier: 'coping' })
    expect(monthScore(month(600, 500), r)).toMatchObject({ score: 28, tier: 'vulnerable' })
  })
  it('does not count money left unspent as invested', () => {
    expect(monthScore(month(470, 280), r)?.score).toBe(83)
  })
  it('credits investing only out of what the month left over', () => {
    // 150 left after needs and wants, 250 invested: the other 100 came from older savings.
    expect(monthScore(month(470, 380, 250), r)?.score).toBe(81)
  })
  it('gives a plan with no investing share the full grade for it, and skips months without income', () => {
    expect(monthScore(month(450, 50, 0, 500), { needs: 90, wants: 10, investments: 0 })).toMatchObject({ score: 75, tier: 'coping' })
    expect(monthScore(month(100, 0, 0, 0), r)).toBeNull()
  })
  it('does not count money taken out of savings as income', () => {
    // Selling 250 and buying it back changes nothing: the same 83 as leaving it alone.
    expect(monthScore(month(470, 280, 250, 1250, 250), r)?.score).toBe(monthScore(month(470, 280), r)?.score)
    // Spending 1400 on 1000 earned is no better for selling 500 to cover it.
    expect(monthScore(month(800, 600, 0, 1500, 500), r)).toMatchObject({ score: 5, tier: 'vulnerable', rate: -0.4 })
    // Nothing earned, only savings spent: no score.
    expect(monthScore(month(300, 0, 0, 500, 500), r)).toBeNull()
  })
})

describe('hitTarget', () => {
  const month = (needs: number, wants: number, investments: number, income = 1000, withdrawn = 0) => ({ income, withdrawn, expense: needs + wants + investments, buckets: { needs, wants, investments }, byCategory: new Map() })
  const r = { needs: 50, wants: 30, investments: 20 }
  it('needs the target share invested out of the month\'s own income', () => {
    expect(hitTarget(month(500, 300, 200), r)).toBe(true)
    expect(hitTarget(month(300, 300, 0), r)).toBe(false) // 40% unspent, none invested
    expect(hitTarget(month(500, 400, 200), r)).toBe(false) // only 100 was left to invest
    expect(hitTarget(month(0, 0, 0, 0), r)).toBe(false)
    expect(hitTarget(month(500, 300, 200, 1200, 200), r)).toBe(false) // bought 200, sold 200
  })
  it('lets the target round down to a whole unit of the currency', () => {
    // 20% of 3333.33 is 666.666: investing 666.00 is the target as anyone would pay it in.
    expect(hitTarget(month(0, 0, 66600, 333333), r)).toBe(true)
    expect(hitTarget(month(0, 0, 66500, 333333), r)).toBe(false)
  })
  it('with no investing share, needs spending under income', () => {
    const none = { needs: 70, wants: 30, investments: 0 }
    expect(hitTarget(month(700, 300, 0), none)).toBe(true)
    expect(hitTarget(month(700, 400, 0), none)).toBe(false)
  })
})

describe('ratio history', () => {
  const a = { needs: 50, wants: 30, investments: 20 }
  const b = { needs: 60, wants: 30, investments: 10 }
  const c = { needs: 70, wants: 29, investments: 1 }
  it('keeps every past month on the split it was planned with', () => {
    const h1 = withRatioChange(a, undefined, '2026-10') // a -> b in October
    const h2 = withRatioChange(b, h1, '2026-12') // b -> c in December
    expect(ratiosFor(c, h2, '2026-01')).toEqual(a)
    expect(ratiosFor(c, h2, '2026-09')).toEqual(a)
    expect(ratiosFor(c, h2, '2026-10')).toEqual(b)
    expect(ratiosFor(c, h2, '2026-12')).toEqual(c)
    expect(ratiosFor(c, null, '2026-01')).toEqual(c)
  })
  it('records only the first change within a month', () => {
    const h = withRatioChange(a, undefined, '2026-10')
    expect(withRatioChange(b, h, '2026-10')).toBe(h)
  })
})

describe('insights', () => {
  const r = () => ({ needs: 50, wants: 30, investments: 20 })
  // Three ordinary months: 1000 income, 400 rent, 100 dining out.
  const ordinary = ['2026-06', '2026-07', '2026-08'].flatMap((m) => [
    tx({ date: `${m}-01`, kind: 'income', amount: 1000, bucket: null, categoryId: 'job' }),
    tx({ date: `${m}-02`, amount: 400, categoryId: 'rent' }),
    tx({ date: `${m}-03`, amount: 100, bucket: 'wants', categoryId: 'dining' }),
  ])
  const run = (txs: Tx[], closed = true) =>
    insights({ month: '2026-09', txs, prev: ordinary, ratiosAt: r, subCharges: new Set(), goals: [], closed, recent: false })

  it('names the category that ran over its usual, and what it cost', () => {
    const [spike] = run([
      tx({ date: '2026-09-01', kind: 'income', amount: 1000, bucket: null, categoryId: 'job' }),
      tx({ date: '2026-09-02', amount: 400, categoryId: 'rent' }),
      tx({ date: '2026-09-03', amount: 450, bucket: 'wants', categoryId: 'dining' }),
    ])
    expect(spike).toMatchObject({ kind: 'spike', categoryId: 'dining', amount: 450, avg: 100 })
    expect(spike.kind === 'spike' && spike.better).toBeGreaterThan(monthScore(summarize([tx({ kind: 'income', amount: 1000, bucket: null }), tx({ amount: 400 }), tx({ amount: 450, bucket: 'wants' })]), r())!.score)
  })
  it('spots many small wants purchases, and drops only once the month is over', () => {
    const month = [
      tx({ date: '2026-09-01', kind: 'income', amount: 1000, bucket: null, categoryId: 'job' }),
      tx({ date: '2026-09-02', amount: 400, categoryId: 'rent' }),
      ...Array.from({ length: 7 }, (_, i) => tx({ id: `s${i}`, date: '2026-09-10', amount: 10, bucket: 'wants', categoryId: 'snacks' })),
    ]
    expect(run(month).map((i) => i.kind)).toEqual(expect.arrayContaining(['leak', 'drop']))
    expect(run(month, false).map((i) => i.kind)).not.toContain('drop')
  })
  it('does not read investing as spending: no spike, drop or biggest expense for it', () => {
    const before = ordinary.flatMap((t) => (t.categoryId === 'dining' ? [t, tx({ date: t.date, amount: 200, bucket: 'investments', categoryId: 'etf' })] : [t]))
    const month = (etf: number) => [
      tx({ date: '2026-09-01', kind: 'income', amount: 1000, bucket: null, categoryId: 'job' }),
      tx({ date: '2026-09-02', amount: 400, categoryId: 'rent' }),
      tx({ date: '2026-09-03', amount: 100, bucket: 'wants', categoryId: 'dining' }),
      ...(etf ? [tx({ date: '2026-09-04', amount: etf, bucket: 'investments', categoryId: 'etf' })] : []),
    ]
    const about = (etf: number) =>
      insights({ month: '2026-09', txs: month(etf), prev: before, ratiosAt: r, subCharges: new Set(), goals: [], closed: true, recent: false, limit: 9 }).filter((i) => 'categoryId' in i && i.categoryId === 'etf')
    expect(about(0)).toEqual([])
    expect(about(500)).toEqual([])
  })
  it('counts a streak of investing the target past a year', () => {
    const months = Array.from({ length: 15 }, (_, i) => shiftMonth('2026-09', -i))
    const each = (m: string) => [
      tx({ id: `${m}i`, date: `${m}-01`, kind: 'income', amount: 1000, bucket: null, categoryId: 'job' }),
      tx({ id: `${m}r`, date: `${m}-02`, amount: 400, categoryId: 'rent' }),
      tx({ id: `${m}v`, date: `${m}-03`, amount: 200, bucket: 'investments', categoryId: 'etf' }),
    ]
    const found = insights({ month: '2026-09', txs: each('2026-09'), prev: months.slice(1).flatMap(each), ratiosAt: r, subCharges: new Set(), goals: [], closed: true, recent: false, limit: 9 })
    expect(found).toContainEqual(expect.objectContaining({ kind: 'streak', months: 15 }))
  })
})

describe('insights: biggest one-off', () => {
  it('skips usual costs like rent and finds the one-off behind them', () => {
    const prev = ['2026-07', '2026-08'].flatMap((m) => [tx({ date: `${m}-01`, kind: 'income', amount: 1000, bucket: null }), tx({ date: `${m}-02`, amount: 400, categoryId: 'rent' })])
    const txs = [
      tx({ date: '2026-09-01', kind: 'income', amount: 1000, bucket: null }),
      tx({ date: '2026-09-02', amount: 400, categoryId: 'rent' }),
      tx({ date: '2026-09-12', amount: 300, bucket: 'wants', categoryId: 'tech', note: 'Laptop' }),
    ]
    const found = insights({ month: '2026-09', txs, prev, ratiosAt: () => ({ needs: 50, wants: 30, investments: 20 }), subCharges: new Set(), goals: [], closed: true, recent: false })
    expect(found).toContainEqual(expect.objectContaining({ kind: 'biggest', note: 'Laptop', amount: 300 }))
  })
})

describe('tags', () => {
  const tx = (tags: string[], amount = 100, kind: Tx['kind'] = 'expense'): Tx => ({ id: tags.join() + amount + kind, date: '2026-07-01', amount, kind, categoryId: 'c', bucket: kind === 'expense' ? 'wants' : null, note: 'x', tags })
  it('cleans a typed tag', () => {
    expect(cleanTag('  #Balaton 2026 ')).toBe('balaton-2026')
    expect(cleanTag('##')).toBe('')
  })
  it('totals spending per tag, accents folded, biggest first', () => {
    expect(tagTotals([tx(['nyaralás'], 500), tx(['nyaralas'], 300), tx(['food'], 900), tx(['nyaralás'], 1000, 'income')])).toEqual([
      { tag: 'food', amount: 900, count: 1 },
      { tag: 'nyaralás', amount: 800, count: 3 },
    ])
  })
  it('search by #tag finds tagged rows', () => {
    const list = [tx(['balaton']), tx([])]
    expect(queryTxs(list, { ...EMPTY_QUERY, text: '#balaton' }, () => '')).toHaveLength(1)
  })
})

describe('subscription watch', () => {
  it('asks again a year after the last review, or after a year of charges', () => {
    expect(reviewDue(null, '2026-10', false)).toBe(false)
    expect(reviewDue(null, '2026-10', true)).toBe(true)
    expect(reviewDue('2025-11', '2026-10', true)).toBe(false)
    expect(reviewDue('2025-10', '2026-10', false)).toBe(true)
  })
})

describe('yearRecap', () => {
  const tx = (date: string, amount: number, kind: Tx['kind'], categoryId: string, note = '', bucket: Tx['bucket'] = 'needs'): Tx => ({
    id: `${date}${amount}${note}${categoryId}`, date, amount, kind, categoryId, bucket: kind === 'income' ? null : bucket, note,
  })
  const ratios = () => ({ needs: 50, wants: 30, investments: 20 })
  it('sums the year: saving, months on target, top category, regular purchase, top tag', () => {
    const txs = [
      tx('2026-01-05', 1000, 'income', 'job'),
      tx('2026-01-06', 500, 'expense', 'rent'),
      tx('2026-01-07', 200, 'expense', 'etf', '', 'investments'),
      tx('2026-02-05', 1000, 'income', 'job'),
      tx('2026-02-06', 900, 'expense', 'rent'),
      ...['01', '02', '03'].map((m) => tx(`2026-${m}-10`, 10, 'expense', 'food', m === '02' ? 'lidl' : 'Lidl', 'wants')),
      { ...tx('2026-03-11', 70, 'expense', 'travel', 'Hotel', 'wants'), tags: ['trip'] },
      tx('2025-12-31', 99999, 'expense', 'rent'), // another year: byMonth skips it, the caller passes one year
    ].filter((t) => t.date.startsWith('2026'))
    const r = yearRecap(txs, 2026, ratios)
    expect(r.income).toBe(2000)
    expect(r.saved).toBe(2000 - 1400 - 100)
    expect([r.hit, r.counted]).toEqual([1, 2]) // January invested its 20%; February spent 90% on rent
    expect(r.top).toEqual({ id: 'rent', amount: 1400, share: 1400 / 1500 }) // of spending: investing is not part of it
    expect(r.regular).toEqual({ note: 'Lidl', count: 3, amount: 30 })
    expect(r.tag).toEqual({ tag: 'trip', amount: 70, count: 1 })
  })
})
