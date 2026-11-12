import { expect, test } from 'vitest'
import { squarify } from './charts'

test('squarify fills the box, keeps areas in proportion and stays inside it', () => {
  const values = [950, 400, 331, 84, 45, 30, 12]
  const rects = squarify(values, 160, 100)
  const total = values.reduce((n, v) => n + v, 0)
  expect(rects).toHaveLength(values.length)
  rects.forEach((r, i) => {
    expect(r.w * r.h).toBeCloseTo((values[i] / total) * 160 * 100, 6)
    expect(r.x).toBeGreaterThanOrEqual(-1e-9)
    expect(r.y).toBeGreaterThanOrEqual(-1e-9)
    expect(r.x + r.w).toBeLessThanOrEqual(160 + 1e-9)
    expect(r.y + r.h).toBeLessThanOrEqual(100 + 1e-9)
  })
})

test('squarify of nothing is nothing', () => {
  expect(squarify([], 160, 100)).toEqual([])
  expect(squarify([0, 0], 160, 100)).toEqual([])
})
