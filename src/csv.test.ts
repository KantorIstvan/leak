import { describe, expect, it } from 'vitest'
import type { Tx } from './db'
import { decodeCsv, missing, parseCsv, readCsv, toCsv } from './csv'

const tx = (p: Partial<Tx>): Tx => ({ id: '0', date: '2026-08-01', amount: 100, kind: 'expense', categoryId: 'food', bucket: 'needs', note: '', ...p })
const names: Record<string, string> = { food: 'Food', job: 'Job' }
const catName = (id: string) => names[id] ?? '?'

describe('csv', () => {
  it('round-trips an export, quotes and accents included', () => {
    const txs = [tx({ amount: 470000, note: 'Lidl, "nagy" bevásárlás' }), tx({ id: '1', kind: 'income', categoryId: 'job', bucket: null, amount: 1250, date: '2026-08-02' })]
    const back = readCsv(toCsv(txs, catName), 'Uncategorized')!
    expect(back.bad).toEqual([])
    expect(back.rows).toEqual([
      { date: '2026-08-01', kind: 'expense', amount: 470000, category: 'Food', bucket: 'needs', note: 'Lidl, "nagy" bevásárlás' },
      { date: '2026-08-02', kind: 'income', amount: 1250, category: 'Job', bucket: null, note: '' },
    ])
  })

  it('round-trips the original amount of a foreign payment, and turns away half of one', () => {
    const back = readCsv(toCsv([tx({ amount: 440000, origAmount: 1199, origCurrency: 'EUR' })], catName), 'U')!
    expect(back.rows[0]).toMatchObject({ amount: 440000, origAmount: 1199, origCurrency: 'EUR' })
    const half = readCsv('date,amount,original_amount,original_currency\n2026-08-01,10,,EUR\n2026-08-01,10,5,\n2026-08-01,10,5,eur\n', 'U')!
    expect(half.bad).toEqual([2, 3])
    expect(half.rows[0]).toMatchObject({ origAmount: 500, origCurrency: 'EUR' })
  })

  it('reads a hand-made Hungarian file with ; and partial columns', () => {
    const r = readCsv('Dátum;Összeg;Leírás\n2026.10.19.;-4 700;kávé\n2026.02.30;100;rossz nap\n\n2026-10-20;12,5;\n', 'Kategória nélkül')!
    expect(r.rows).toEqual([
      { date: '2026-10-19', kind: 'expense', amount: 470000, category: 'Kategória nélkül', bucket: null, note: 'kávé' },
      { date: '2026-10-20', kind: 'expense', amount: 1250, category: 'Kategória nélkül', bucket: null, note: '' },
    ])
    expect(r.bad).toEqual([3])
  })

  it('reads dates and amounts the way spreadsheets write them', () => {
    const r = readCsv('date;amount;type\n2026. 10. 19.;-1.234,56 Ft;\n2026.10.20. 14:05;1,234.56;\n2026/10/21;1.234.567;\n2026-10-22;1,234;\n2026-10-23;4 700-;income\n', 'U')!
    expect(r.rows.map((x) => [x.date, x.amount])).toEqual([['2026-10-19', 123456], ['2026-10-20', 123456], ['2026-10-21', 123456700]])
    // "1,234": a thousand or one point two? Skipped rather than guessed. "4 700-" is negative, so not income.
    expect(r.bad).toEqual([5, 6])
  })

  it('reads a file Excel saved in the Windows code page', () => {
    expect(decodeCsv(new Uint8Array([0x4c, 0xf5, 0x72, 0x69, 0x6e, 0x63]).buffer, 'hu')).toBe('Lőrinc')
    expect(decodeCsv(new TextEncoder().encode('Lőrinc').buffer, 'hu')).toBe('Lőrinc')
  })

  it('needs date and amount columns', () => {
    expect(readCsv('note,category\nx,y', 'U')).toBeNull()
  })

  it('exports notes and categories that look like formulas as text, and reads them back as they were', () => {
    const name = (id: string) => (id === 'odd' ? '+36 phone' : catName(id))
    const csv = toCsv([tx({ note: '=HYPERLINK("http://x","click")' }), tx({ id: '1', categoryId: 'odd', note: '@SUM(A1)' }), tx({ id: '2', note: '-5% off' })], name)
    expect(csv).not.toMatch(/(^|,)"?[=+\-@]/m) // no cell a spreadsheet would evaluate
    expect(readCsv(csv, 'U')!.rows.map((r) => [r.category, r.note])).toEqual([
      ['Food', '=HYPERLINK("http://x","click")'],
      ['+36 phone', '@SUM(A1)'],
      ['Food', '-5% off'],
    ])
  })

  it('keeps newlines inside quotes', () => {
    expect(parseCsv('a,b\r\n"x\ny",2')).toEqual([['a', 'b'], ['x\ny', '2']])
  })

  it('imports only what is missing, counting identical rows', () => {
    const rows = readCsv('date,amount,category,note\n2026-08-01,1,food,coffee\n2026-08-01,1,Food,coffee\n2026-08-01,1,Food,cake', 'U')!.rows
    const existing = [tx({ note: 'coffee', bucket: 'wants' })]
    expect(missing(rows, existing, catName).map((r) => r.note)).toEqual(['coffee', 'cake'])
    // Importing the result again adds nothing.
    const after = [...existing, tx({ note: 'coffee' }), tx({ note: 'cake' })]
    expect(missing(rows, after, catName)).toEqual([])
  })
})
