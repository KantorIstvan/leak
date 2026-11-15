// The sample account the Help page's screenshots show: a believable 2026 for someone paid 3 400 € a month (or the
// forint equivalent), logged from January to mid-November, so October is a finished month with a score. Seeded, so
// every run draws the same picture. Names and notes follow the language: a Hungarian picture shows Hungarian words.
import { DEFAULT_CATEGORIES, type Category, type Goal, type Lang, type Settings, type Sub, type Tx } from '../../src/db'

const HU_NAMES: Record<string, string> = {
  Food: 'Élelmiszer', Rent: 'Lakbér', Internet: 'Internet', Transport: 'Közlekedés', Health: 'Egészség', Clothes: 'Ruha',
  Gift: 'Ajándék', Relationship: 'Párkapcsolat', Software: 'Szoftver', Service: 'Szolgáltatás', Education: 'Tanulás',
  Tech: 'Tech', Game: 'Játék', Travel: 'Utazás', 'Junk Food': 'Gyorskaja', 'Dining out': 'Étterem', Entertainment: 'Szórakozás',
  Streaming: 'Streaming', Alcohol: 'Alkohol', 'Cigarette/Vape': 'Cigi, vape', Investment: 'Befektetés', Job: 'Munka',
  Family: 'Család', 'Sold investments': 'Eladott befektetés', Friends: 'Barátok',
}

const WORDS = {
  en: {
    groceries: ['Groceries', 'Weekly shop', 'Lidl', 'Aldi', 'Spar'],
    lunch: ['Lunch', 'Wolt', 'Pho', 'Gyros'],
    dinner: ['Pizza', 'Sushi', 'Brunch', 'Ramen', 'Kebab'],
    fun: ['Bowling', 'Concert', 'Cinema', 'Escape room'],
    salary: 'Salary', rent: 'Rent', pass: 'Travel pass', invest: 'ETF', scooter: 'Scooter', flowers: 'Flowers', mouse: 'Mouse',
    subs: { netflix: 'Netflix', spotify: 'Spotify', net: 'Home internet', gym: 'Gym', cloud: 'iCloud+' },
    goals: ['Road bike', 'New laptop', 'Emergency fund'],
  },
  hu: {
    groceries: ['Bevásárlás', 'Heti bevásárlás', 'Lidl', 'Aldi', 'Spar'],
    lunch: ['Menü', 'Wolt', 'Pho', 'Gyros'],
    dinner: ['Pizza', 'Sushi', 'Villásreggeli', 'Ramen', 'Kebab'],
    fun: ['Bowling', 'Koncert', 'Mozi', 'Szabadulószoba'],
    salary: 'Fizetés', rent: 'Albérlet', pass: 'Bérlet', invest: 'ETF', scooter: 'Roller', flowers: 'Virág', mouse: 'Egér',
    subs: { netflix: 'Netflix', spotify: 'Spotify', net: 'Otthoni internet', gym: 'Edzőterem', cloud: 'iCloud+' },
    goals: ['Országúti bicikli', 'Új laptop', 'Vésztartalék'],
  },
} as const

/** mulberry32: a small seeded generator, so the picture is the same on every run. */
function prng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

export function sample(lang: Lang, dark: boolean) {
  const w = WORDS[lang]
  const rand = prng(2026)
  const between = (a: number, b: number) => a + rand() * (b - a)
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
  // Prices are written in euros; forint is about 180 to the euro here, rounded the way prices are.
  const money = (eur: number) => (lang === 'hu' ? Math.round((eur * 180) / 10) * 10 * 100 : Math.round(eur * 100))

  const cats: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: `c${i}`, name: lang === 'hu' ? (HU_NAMES[c.name] ?? c.name) : c.name }))
  const id = (en: string) => `c${DEFAULT_CATEGORIES.findIndex((c) => c.name === en)}`
  // A limit on eating out, so the Month page shows its limits card as a person with one would see it.
  cats.find((c) => c.id === id('Dining out'))!.limit = money(260)

  const txs: Tx[] = []
  let n = 0
  const log = (cat: string, date: string, eur: number, note: string, hour: number, bucket?: Tx['bucket']) => {
    const c = cats.find((x) => x.id === id(cat))!
    const createdAt = new Date(`${date}T00:00`).getTime() + Math.round((hour + between(-0.3, 0.3)) * 3_600_000)
    txs.push({ id: `t${n++}`, date, amount: money(eur), kind: c.kind, categoryId: c.id, bucket: c.kind === 'income' ? null : (bucket ?? c.bucket), note, createdAt })
  }
  const day = (m: number, d: number) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const weekday = (m: number, d: number) => (new Date(Date.UTC(2026, m - 1, d)).getUTCDay() + 6) % 7 // Monday 0

  for (let m = 1; m <= 11; m++) {
    const last = m === 11 ? 14 : new Date(2026, m, 0).getDate()
    log('Job', day(m, 5), m === 6 ? 3_850 : 3_400, w.salary, 9.5)
    log('Rent', day(m, 1), 900, w.rent, 8.2)
    log('Internet', day(m, 2), 34.99, w.subs.net, 19)
    log('Transport', day(m, 2), 40, w.pass, 8)
    log('Streaming', day(m, 3), 10.99, w.subs.spotify, 21)
    log('Streaming', day(m, 12), 13.99, w.subs.netflix, 21.2)
    log('Health', day(m, 5), 39, w.subs.gym, 7.5)
    log('Software', day(m, 8), 2.99, w.subs.cloud, 20)
    // A fifth of the salary: exactly the plan, so the Investments bar reads full and on target.
    log('Investment', day(m, 6), 680, w.invest, 9.8)
    for (let d = 1; d <= last; d++) {
      const wd = weekday(m, d)
      if (wd === 1 || wd === 3) log('Food', day(m, d), between(18, 42), pick(w.groceries), 18.5)
      if (wd === 5) log('Food', day(m, d), between(45, 75), w.groceries[1], 11)
      if (wd < 5 && rand() < 0.35) log('Dining out', day(m, d), between(9, 16), pick(w.lunch), 12.8)
      if ((wd === 5 || wd === 6) && rand() < 0.45) log('Dining out', day(m, d), between(24, 48), pick(w.dinner), 20.3)
      if (wd === 5 && rand() < 0.35) log('Entertainment', day(m, d), between(18, 65), pick(w.fun), 17)
      if (rand() < 0.04) log('Transport', day(m, d), between(8, 22), w.scooter, 19)
      if (rand() < 0.03) log('Gift', day(m, d), between(25, 45), w.flowers, 15)
    }
    if (m === 7) log('Junk Food', day(m, 14), 12.5, 'Kebab', 22)
  }
  log('Tech', day(10, 20), 79, w.mouse, 14.7)

  const subs: Sub[] = [
    ['Internet', w.subs.net, 34.99, 2],
    ['Streaming', w.subs.spotify, 10.99, 3],
    ['Health', w.subs.gym, 39, 5],
    ['Software', w.subs.cloud, 2.99, 8],
    ['Streaming', w.subs.netflix, 13.99, 12],
  ].map(([cat, name, eur, d], i) => ({ id: `s${i}`, name: name as string, amount: money(eur as number), categoryId: id(cat as string), day: d as number, lastMonth: '2026-11', reviewed: '2026-11' }))

  const goals: Goal[] = [
    [w.goals[0], 1_400, 1_400],
    [w.goals[1], 1_150, 1_800],
    [w.goals[2], 4_200, 6_000],
  ].map(([name, saved, target], i) => ({ id: `g${i}`, name: name as string, saved: money(saved as number), target: money(target as number) }))

  const settings: Settings = {
    id: 'app',
    lang,
    currency: lang === 'hu' ? 'HUF' : 'EUR',
    theme: dark ? 'dark' : 'light',
    clock: lang === 'hu' ? '24' : '12',
    catChart: 'donut',
    ratios: { needs: 50, wants: 30, investments: 20 },
  }
  return { cats, txs, subs, goals, settings }
}
