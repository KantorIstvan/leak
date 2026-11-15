import { describe, expect, it } from 'vitest'
import { helpDicts, highlights, searchHelp, snippet, termsOf, TOPICS } from './help'

describe('help search', () => {
  it('ignores case and accents, and marks the original text', () => {
    expect(termsOf('  Mentés  EXPORT ')).toEqual(['mentes', 'export'])
    const text = 'A Mentés exportálása'
    expect(highlights(text, termsOf('mentes')).map(([a, b]) => text.slice(a, b))).toEqual(['Mentés'])
    // Overlapping terms make one mark.
    expect(highlights('backup', ['back', 'ckup'])).toEqual([[0, 6]])
  })

  it('treats punctuation as no word, so "?" does not match every question', () => {
    expect(termsOf('?')).toEqual([])
    expect(termsOf(' - ')).toEqual([])
    expect(termsOf('Ctrl+K')).toEqual(['ctrl', 'k'])
    expect(termsOf('50/30/20')).toEqual(['50', '30', '20'])
  })

  it('needs every word, and puts heading matches first', () => {
    const en = helpDicts.en
    const { faqs } = searchHelp(en, termsOf('backup'))
    expect(faqs[0].q).toBe('How do I make a backup?')
    expect(searchHelp(en, termsOf('backup zebra')).faqs).toEqual([])
    const hu = searchHelp(helpDicts.hu, termsOf('penznem'))
    expect(hu.faqs.length).toBeGreaterThan(0)
  })

  it('finds guide steps with their place in the guide', () => {
    const { steps } = searchHelp(helpDicts.en, termsOf('subscription'))
    expect(steps[0].st.id).toBe('subs')
    expect(steps[0].i).toBe(helpDicts.en.steps.findIndex((s) => s.id === 'subs'))
  })

  it('cuts a snippet around the first match', () => {
    const long = `${'word '.repeat(60)}the backup file ${'tail '.repeat(60)}`
    const s = snippet(long, ['backup'])
    expect(s.startsWith('…')).toBe(true)
    expect(s).toContain('backup')
    expect(s.length).toBeLessThanOrEqual(152)
    expect(snippet('short', ['x'])).toBe('short')
    // A match late in a text whose tail fits: the snippet keeps its last word and ends without an ellipsis.
    const tail = `${'word '.repeat(20)}then keep the backup somewhere safe`
    const t2 = snippet(tail, ['backup'])
    expect(t2.endsWith('somewhere safe')).toBe(true)
    expect(t2.startsWith('…')).toBe(true)
  })

  it('keeps both languages in step', () => {
    const { en, hu } = helpDicts
    expect(hu.steps.map((s) => [s.id, s.points?.length, s.go])).toEqual(en.steps.map((s) => [s.id, s.points?.length, s.go]))
    expect(hu.faqs.map((f) => f.topic)).toEqual(en.faqs.map((f) => f.topic))
    for (const f of en.faqs) expect(TOPICS).toContain(f.topic)
  })
})
