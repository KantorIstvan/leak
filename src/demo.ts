// Dev-only: open http://localhost:5173/?demo (or ?demo=2024) while signed in to add a year of sample transactions
// to the account, logged the way a person would: a salary on the 5th, rent on the 1st, groceries a few evenings a
// week with the shop's name, lunches on workdays, dinners out at the weekend, subscriptions on their days, a summer
// trip abroad under a tag, presents in December, a monthly transfer into investments. Amounts are in forint minor
// units. Adds to what is there; the year defaults to the last one.
import { add } from './cloud'
import { db, type Category, type Tx } from './db'

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const int = (min: number, max: number) => Math.floor(rand(min, max + 1))
const pick = <T>(xs: readonly T[]) => xs[int(0, xs.length - 1)]
const chance = (p: number) => Math.random() < p
const pad = (n: number) => String(n).padStart(2, '0')
const ft = (units: number) => Math.round(units) * 100

/** Which of the account's categories plays each part, found by icon first, then by name (English or Hungarian). */
const ROLES = {
  job: { icons: ['Briefcase'], names: ['job', 'munka', 'fizetés', 'salary'], kind: 'income' },
  family: { icons: ['Users', 'HandHeart'], names: ['family', 'család', 'friends'], kind: 'income' },
  food: { icons: ['ForkKnife', 'ShoppingCart', 'Basket'], names: ['food', 'élelmiszer', 'groceries', 'bevásárlás'], kind: 'expense' },
  rent: { icons: ['House', 'HouseLine'], names: ['rent', 'lakbér', 'albérlet'], kind: 'expense' },
  internet: { icons: ['WifiHigh'], names: ['internet', 'telefon', 'phone'], kind: 'expense' },
  transport: { icons: ['Bus', 'Train', 'Car'], names: ['transport', 'közlekedés', 'utazás'], kind: 'expense' },
  health: { icons: ['FirstAid', 'Pill'], names: ['health', 'egészség'], kind: 'expense' },
  clothes: { icons: ['TShirt'], names: ['clothes', 'ruha'], kind: 'expense' },
  gift: { icons: ['Gift'], names: ['gift', 'ajándék'], kind: 'expense' },
  software: { icons: ['Code'], names: ['software', 'szoftver'], kind: 'expense' },
  tech: { icons: ['Laptop', 'Desktop'], names: ['tech'], kind: 'expense' },
  game: { icons: ['GameController'], names: ['game', 'játék'], kind: 'expense' },
  travel: { icons: ['Airplane'], names: ['travel', 'utazás', 'nyaralás'], kind: 'expense' },
  junk: { icons: ['Hamburger'], names: ['junk food', 'gyorskaja'], kind: 'expense' },
  dining: { icons: ['BowlFood', 'Coffee'], names: ['dining out', 'étterem', 'kávé'], kind: 'expense' },
  fun: { icons: ['FilmSlate', 'Ticket'], names: ['entertainment', 'szórakozás'], kind: 'expense' },
  streaming: { icons: ['Television'], names: ['streaming'], kind: 'expense' },
  alcohol: { icons: ['BeerStein', 'Wine'], names: ['alcohol', 'alkohol'], kind: 'expense' },
  invest: { icons: ['ChartLineUp'], names: ['investment', 'befektetés', 'megtakarítás'], kind: 'expense' },
} as const
type Role = keyof typeof ROLES

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function cast(cats: Category[]): Partial<Record<Role, Category>> {
  const out: Partial<Record<Role, Category>> = {}
  for (const role of Object.keys(ROLES) as Role[]) {
    const r = ROLES[role]
    const pool = cats.filter((c) => c.kind === r.kind)
    out[role] = pool.find((c) => c.icon && (r.icons as readonly string[]).includes(c.icon)) ?? pool.find((c) => (r.names as readonly string[]).some((n) => fold(c.name).includes(fold(n))))
  }
  // Something is better than nothing: a missing part falls back to the first category of its kind.
  for (const role of Object.keys(ROLES) as Role[]) out[role] ??= cats.find((c) => c.kind === ROLES[role].kind)
  return out
}

export async function seedDemo() {
  const year = Number(new URLSearchParams(location.search).get('demo')) || new Date().getFullYear() - 1
  history.replaceState(null, '', location.pathname + location.hash) // a reload must not seed again
  const cat = cast(await db.categories.toArray())
  const txs: Omit<Tx, 'id'>[] = []
  const today = new Date().toISOString().slice(0, 10)

  /** Logs a transaction at a believable hour: `hour` is when the person reaches for the phone (fraction allowed). */
  const log = (role: Role, day: string, amount: number, note: string, hour: number, extra: Partial<Tx> = {}) => {
    const c = cat[role]
    if (!c || day > today || amount <= 0) return
    const bucket = c.kind === 'income' ? null : (extra.bucket ?? c.bucket)
    const at = new Date(`${day}T00:00`).getTime() + Math.round((hour + rand(-0.4, 0.4)) * 3600_000) + int(0, 59_000)
    txs.push({ date: day, amount: ft(amount), kind: c.kind, categoryId: c.id, bucket, note, createdAt: at, ...extra })
  }
  const date = (m: number, d: number) => `${year}-${pad(m)}-${pad(d)}`
  const daysIn = (m: number) => new Date(year, m, 0).getDate()
  const dow = (m: number, d: number) => (new Date(Date.UTC(year, m - 1, d)).getUTCDay() + 6) % 7 // Monday 0

  const shops = ['Lidl', 'Aldi', 'Spar', 'Tesco', 'Penny', 'CBA']
  const lunch = ['Menü', 'Wolt', 'Foodora', 'Kifőzde', 'Gyros', 'Pho']
  const dinners = ['Pizza', 'Sushi', 'Burger', 'Ramen', 'Taco', 'Thai']
  const bars = ['Sör', 'Borbár', 'Craft beer', 'Kocsma']
  const fun = ['Mozi', 'Koncert', 'Színház', 'Escape room', 'Bowling', 'Múzeum']
  const snacks = ['McDonald’s', 'Burger King', 'KFC', 'Gyros', 'Pékség']

  const salary = 620_000
  for (let m = 1; m <= 12; m++) {
    const dim = daysIn(m)
    // Pay day: the 5th, or the Friday before when it falls on a weekend. A bonus in December, a tax refund in May.
    let pay = 5
    while (dow(m, pay) >= 5) pay--
    log('job', date(m, pay), salary, 'Fizetés', 9.5)
    if (m === 12) log('job', date(m, pay), 310_000, 'Év végi bónusz', 9.6)
    if (m === 5) log('job', date(m, 20), 68_500, 'Adóvisszatérítés', 11)
    if (m === 3 || m === 9) log('family', date(m, int(10, 20)), 50_000, 'Szülők', 18)

    // The fixed costs, on their days.
    log('rent', date(m, 1), 185_000, 'Albérlet', 8.2)
    log('internet', date(m, 10), 7_490, 'Telekom', 19)
    log('internet', date(m, 15), 4_990, 'Yettel', 19.2)
    log('streaming', date(m, 12), 4_490, 'Netflix', 21)
    log('streaming', date(m, 3), 2_290, 'Spotify', 21.3)
    log('software', date(m, 8), 9_000 + int(-300, 300), 'iCloud+', 20.5)
    log('transport', date(m, 2), 9_500, 'BKK bérlet', 8)
    log('invest', date(m, pay + 1 > dim ? dim : pay + 1), Math.round(salary * 0.2), 'ETF', 9.8, { bucket: 'investments' })

    for (let d = 1; d <= dim; d++) {
      const w = dow(m, d)
      const day = date(m, d)
      // Groceries: Tuesday, Thursday and Saturday, a big shop on Saturday.
      if (w === 1 || w === 3) log('food', day, int(3_800, 9_500), pick(shops), 18.5)
      if (w === 5) log('food', day, int(12_000, 24_000), pick(shops), 11)
      if (w === 6 && chance(0.3)) log('food', day, int(1_500, 4_000), 'Pékség', 10)
      // Workday lunch, most days; junk food when the day was long.
      if (w < 5 && chance(0.7)) log('dining', day, int(2_400, 4_200), pick(lunch), 12.8, { bucket: 'wants' })
      if (w < 5 && chance(0.12)) log('junk', day, int(2_200, 4_500), pick(snacks), 21.5)
      // Coffee on the way, a few mornings a week.
      if (w < 5 && chance(0.4)) log('dining', day, int(850, 1_600), 'Kávé', 8.4, { bucket: 'wants' })
      // Weekend: a dinner out, a drink, something fun.
      if ((w === 4 || w === 5) && chance(0.55)) log('dining', day, int(6_500, 16_000), pick(dinners), 20.3, { bucket: 'wants' })
      if ((w === 4 || w === 5) && chance(0.4)) log('alcohol', day, int(2_800, 9_000), pick(bars), 22.5)
      if (w === 6 && chance(0.35)) log('fun', day, int(3_500, 14_000), pick(fun), 17)
      // Now and then: a taxi home, a pharmacy run, clothes.
      if (chance(0.05)) log('transport', day, int(2_800, 6_500), 'Bolt', 23.4)
      if (chance(0.04)) log('health', day, int(2_000, 9_000), 'Gyógyszertár', 17.5)
      if (chance(0.025)) log('clothes', day, int(8_000, 35_000), pick(['H&M', 'Zara', 'Decathlon', 'Uniqlo']), 16)
    }

    // The year's bigger moments.
    if (m === 2) log('tech', date(m, 14), 54_990, 'Billentyűzet', 19.5)
    if (m === 4) log('game', date(m, 11), 19_990, 'Steam', 22)
    if (m === 6) log('health', date(m, 18), 32_000, 'Fogorvos', 13)
    if (m === 10) log('tech', date(m, 24), 389_000, 'MacBook Air', 15)
    if (m === 10) log('software', date(m, 24), 11_900, 'JetBrains', 15.3)
    if (m === 11) log('game', date(m, 28), 24_990, 'Steam sale', 21.8)
    if (m === 12) for (let i = 0; i < 5; i++) log('gift', date(m, int(8, 22)), int(6_000, 28_000), pick(['Anya', 'Apa', 'Húgom', 'Barátnő', 'Titkos mikulás']), 18.6)
    if (m === 12) log('food', date(m, 23), 42_000, 'Karácsonyi bevásárlás', 10.5)
  }

  // A week in Lisbon in July, logged there in euros (converted at a flat rate here), under one tag.
  const trip = { tags: ['lisszabon'] as string[] }
  log('travel', date(5, 22), 86_000, 'Ryanair', 21.7, trip)
  log('travel', date(6, 2), 236_000, 'Airbnb', 20.9, trip)
  for (let d = 12; d <= 18; d++) {
    // 405 Ft to the euro; `eur` logs the price paid in euros and its forint value together.
    const eur = (role: Role, x: number, note: string, hour: number, bucket?: Tx['bucket']) => log(role, date(7, d), x * 405, note, hour, { ...trip, origAmount: x * 100, origCurrency: 'EUR', ...(bucket && { bucket }) })
    eur('dining', int(18, 42), pick(['Pastéis de Belém', 'Tasca', 'Time Out Market', 'Cervejaria']), 20.5, 'wants')
    if (chance(0.6)) eur('fun', int(8, 25), pick(['Elétrico 28', 'Jerónimos', 'Oceanário', 'Sintra']), 15)
    if (chance(0.5)) eur('transport', int(6, 15), 'Metro', 10)
  }
  log('alcohol', date(7, 15), 14_000, 'Ginjinha', 23, { ...trip, origAmount: 3500, origCurrency: 'EUR' })

  await add('txs', txs)
  console.info(`demo: added ${txs.length} transactions for ${year}`)
}
