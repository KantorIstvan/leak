// Dev-only: open http://localhost:5173/?demo while signed in to add sample transactions to the account:
// every category of the account, in every month of last year and this year. Adds to what is there.
import { add } from './cloud'
import { db, type Tx } from './db'

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const int = (min: number, max: number) => Math.floor(rand(min, max + 1))
const pad = (n: number) => String(n).padStart(2, '0')

export async function seedDemo() {
  history.replaceState(null, '', location.pathname + location.hash) // a reload must not seed again
  const year = new Date().getFullYear()
  const txs: Omit<Tx, 'id'>[] = []
  for (const c of await db.categories.toArray()) {
    // Each category gets its own typical amount (in whole units), so the shares spread out like real spending.
    const typical = c.kind === 'income' ? rand(50_000, 500_000) : Math.exp(rand(Math.log(1_500), Math.log(80_000)))
    for (let m = 0; m < 24; m++) {
      const month = `${year - 1 + Math.floor(m / 12)}-${pad((m % 12) + 1)}`
      for (let n = c.kind === 'income' ? int(1, 2) : int(1, 4); n > 0; n--) {
        const date = `${month}-${pad(int(1, 28))}`
        txs.push({
          date,
          amount: Math.round((typical * rand(0.4, 1.6)) / 10) * 1000, // rounded to 10 units, in minor units
          kind: c.kind,
          categoryId: c.id,
          bucket: c.kind === 'income' ? null : c.bucket,
          note: '',
          createdAt: new Date(`${date}T00:00`).getTime() + int(7 * 3600, 23 * 3600) * 1000,
        })
      }
    }
  }
  await add('txs', txs)
  console.info(`demo: added ${txs.length} transactions`)
}
