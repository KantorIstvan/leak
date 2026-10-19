// Dev-only: open http://localhost:5173/?demo to fill an empty DB with a sample year.
import { db, type Bucket, type Tx } from './db'

// Monthly totals in HUF: [income, needs, wants, investments]
const MONTHS: [number, number, number, number][] = [
  [175000, 33790, 45000, 0],
  [140000, 57890, 22500, 0],
  [718000, 67500, 76280, 0],
  [942000, 62400, 366400, 30000],
  [214000, 269621, 1140707, 30000],
  [468000, 63121, 82945, 90000],
  [540000, 95593, 156475, 130000],
  [460000, 122780, 102543, 84000],
  [1000000, 120380, 53376, 200000],
]

const SPLIT: Record<Bucket, [string, number][]> = {
  needs: [['Food', 0.35], ['Internet', 0.1], ['Software', 0.15], ['Clothes', 0.2], ['Gift', 0.2]],
  wants: [['Tech', 0.5], ['Junk Food', 0.15], ['Game', 0.15], ['Travel', 0.2]],
  investments: [['Investment', 1]],
}

export async function seedDemo() {
  if (await db.txs.count()) return
  const id = new Map((await db.categories.toArray()).map((c) => [c.name, c.id]))
  const txs: Omit<Tx, 'id'>[] = []
  MONTHS.forEach(([income, ...spend], i) => {
    const date = (d: number) => `2026-${String(i + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    txs.push({ date: date(5), amount: Math.round(income * 0.9) * 100, kind: 'income', categoryId: id.get('Job')!, bucket: null, note: 'Salary' })
    txs.push({ date: date(12), amount: Math.round(income * 0.1) * 100, kind: 'income', categoryId: id.get('Family')!, bucket: null, note: '' })
    ;(['needs', 'wants', 'investments'] as Bucket[]).forEach((bucket, b) =>
      SPLIT[bucket].forEach(([name, share], k) => {
        const amount = Math.round(spend[b] * share) * 100
        if (amount) txs.push({ date: date(3 + k * 5), amount, kind: 'expense', categoryId: id.get(name)!, bucket, note: '' })
      }),
    )
  })
  await db.txs.bulkAdd(txs as Tx[])
  await db.goals.bulkAdd([
    { name: 'Sony Alpha 6700', target: 40000000, saved: 12000000 },
    { name: 'Sigma 50mm F2.8', target: 16000000, saved: 16000000 },
  ] as never)
}
