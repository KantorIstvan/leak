/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Read from disk: Vitest blanks CSS imports, ?raw included.
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

// Checks the colour-blind palette in index.css: colours that share a view must stay apart for every
// kind of colour vision. Machado et al. (2009) full-severity matrices cover the dichromacies; the
// milder anomalous trichromacies sit between these and normal vision. Monochromacy sees luminance only.

type RGB = [number, number, number]
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const rgb = (hex: string) => [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255)) as RGB
const luminance = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b
const matrix = (m: number[][]) => (c: RGB) => m.map((row) => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2]))) as RGB
const VISION: Record<string, (c: RGB) => RGB> = {
  normal: (c) => c,
  protan: matrix([[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]),
  deutan: matrix([[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]]),
  tritan: matrix([[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]]),
  mono: (c) => [luminance(c), luminance(c), luminance(c)],
}
function oklab([r, g, b]: RGB) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
const distance = (a: RGB, b: RGB) => Math.hypot(...oklab(a).map((v, i) => v - oklab(b)[i]))
const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const themes = [...css.matchAll(/:root(\.dark)?\[data-colorblind\] \{([^}]*)\}/g)].map(([, dark, body]) => ({
  name: dark ? 'dark' : 'light',
  card: rgb(dark ? '#18181b' : '#ffffff'),
  colors: Object.fromEntries([...body.matchAll(/--color-(\w+): (#[0-9a-f]{6})/g)].map(([, k, v]) => [k, rgb(v)])),
}))
const PAIRS = [['income', 'expense'], ['income', 'investments'], ['expense', 'investments'], ['needs', 'wants'], ['needs', 'investments'], ['wants', 'investments']]

describe('colour-blind palette', () => {
  it('has a light and a dark theme', () => expect(themes.map((t) => t.name)).toEqual(['light', 'dark']))

  for (const { name, card, colors } of themes)
    describe(name, () => {
      for (const [vision, see] of Object.entries(VISION))
        it(`keeps paired colours apart with ${vision} vision`, () => {
          for (const [a, b] of PAIRS) expect(distance(see(colors[a]), see(colors[b])), `${a}/${b}`).toBeGreaterThanOrEqual(0.09)
        })

      it('reads against the card: amounts as text, buckets as marks', () => {
        for (const k of ['income', 'expense', 'investments']) expect(contrast(colors[k], card), k).toBeGreaterThanOrEqual(4.5)
        for (const k of ['needs', 'wants']) expect(contrast(colors[k], card), k).toBeGreaterThanOrEqual(3)
      })
    })
})
