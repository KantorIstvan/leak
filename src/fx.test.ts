import { describe, expect, it } from 'vitest'
import { convert, cross, parseRate } from './fx'

const quotes = [
  { date: '2026-10-23', base: 'EUR', quote: 'HUF', rate: 366.73 },
  { date: '2026-10-23', base: 'EUR', quote: 'USD', rate: 1.1222 },
]

describe('fx', () => {
  it('crosses two euro quotes into any pair, keeping the precision', () => {
    expect(cross(quotes, 'EUR', 'HUF')?.rate).toBe(366.73)
    expect(cross(quotes, 'HUF', 'EUR')?.rate).toBeCloseTo(1 / 366.73, 12)
    expect(cross(quotes, 'USD', 'HUF')?.rate).toBeCloseTo(366.73 / 1.1222, 9)
    expect(cross(quotes, 'USD', 'HUF')?.date).toBe('2026-10-23')
    expect(cross(quotes, 'GBP', 'HUF')).toBeNull()
  })

  it('converts minor units and reads typed rates', () => {
    expect(convert(1199, 366.73)).toBe(439709) // €11.99 -> 4 397,09 Ft
    expect(convert(1, 0.001)).toBeNull() // rounds to nothing
    expect(parseRate('366,73')).toBe(366.73)
    expect(parseRate(' 0.0027268 ')).toBe(0.0027268)
    expect(parseRate('0')).toBeNull()
    expect(parseRate('1,2,3')).toBeNull()
  })
})
