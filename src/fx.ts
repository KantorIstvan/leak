// Exchange rates: the European Central Bank's daily reference rates (plus a few more central banks), through the
// free Frankfurter API. No key, CORS open. Rates are quoted against the euro; any other pair is the cross of two.
import { today } from './lib'

const API = 'https://api.frankfurter.dev/v2/rates'

export interface Quote {
  rate: number // 1 unit of `from` in `to`
  date: string // the working day the rate was published for: a weekend or holiday gets the day before
}

/**
 * The `from` -> `to` rate out of euro quotes. Crossing through the euro keeps the precision: the API quotes
 * HUF -> EUR as 0.00273 (three digits) but EUR -> HUF as 366.73.
 */
export function cross(quotes: { quote: string; rate: number; date: string }[], from: string, to: string): Quote | null {
  const eur = (code: string) => (code === 'EUR' ? 1 : quotes.find((q) => q.quote === code)?.rate)
  const a = eur(from)
  const b = eur(to)
  return a && b ? { rate: b / a, date: quotes[0]?.date ?? today() } : null
}

const cache = new Map<string, Promise<Quote>>()

/**
 * The rate on a day, or the latest one for today and later (a rate is only published once the day's trading
 * is done). Throws when the API is unreachable or does not know the currency.
 */
export function rate(from: string, to: string, day = today()): Promise<Quote> {
  if (from === to) return Promise.resolve({ rate: 1, date: day })
  const date = day >= today() ? 'latest' : day
  const key = `${date}|${from}|${to}`
  let hit = cache.get(key)
  if (!hit) {
    hit = (async () => {
      const quotes = [from, to].filter((c) => c !== 'EUR').join(',')
      const res = await fetch(`${API}?${date === 'latest' ? '' : `date=${date}&`}quotes=${quotes}`)
      if (!res.ok) throw new Error(`No exchange rate for ${from}/${to}`)
      const q = cross(await res.json(), from, to)
      // The latest rate comes dated tomorrow at times; it cannot be from later than today.
      if (q) return { ...q, date: q.date > today() ? today() : q.date }
      // Nothing published for that day yet (it is today somewhere else): the latest one is the closest.
      if (date !== 'latest') return rate(from, to, today())
      throw new Error(`No exchange rate for ${from}/${to}`)
    })()
    cache.set(key, hit)
    hit.catch(() => cache.delete(key)) // offline now is not offline forever
  }
  return hit
}

/** "366,73", "0.0027268" -> the number; null unless positive. */
export function parseRate(s: string) {
  const v = s.replace(/[\s ]/g, '').replace(',', '.')
  return /^\d+(\.\d+)?$/.test(v) && Number(v) > 0 ? Number(v) : null
}

/** Foreign minor units -> base minor units at `rate`, or null if that leaves nothing (or is no number). */
export function convert(minor: number, rate: number) {
  const v = Math.round(minor * rate)
  return Number.isSafeInteger(v) && v > 0 ? v : null
}
