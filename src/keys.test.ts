import { describe, expect, it } from 'vitest'
import { clash, comboOf, DEFAULT_KEYS, keycaps, keymap, match, overrides, reserved } from './keys'

const press = (key: string, p: Partial<KeyboardEvent> & { altGr?: boolean } = {}) => ({
  key,
  code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  getModifierState: (k: string) => k === 'AltGraph' && !!p.altGr,
  ...p,
})

describe('keys', () => {
  it('names a key press the same on every layout and platform', () => {
    expect(comboOf(press('k', { ctrlKey: true }), false)).toBe('Mod+K')
    expect(comboOf(press('k', { metaKey: true }), true)).toBe('Mod+K')
    expect(comboOf(press('Z', { ctrlKey: true, shiftKey: true }), false)).toBe('Mod+Shift+Z')
    // "?" already says Shift; a lone modifier is no combo yet.
    expect(comboOf(press('?', { shiftKey: true }), false)).toBe('?')
    expect(comboOf(press('Shift', { shiftKey: true }), false)).toBeNull()
    // AltGr types [ on a Hungarian keyboard and reports Ctrl+Alt: still just "[".
    expect(comboOf(press('[', { ctrlKey: true, altKey: true, altGr: true }), false)).toBe('[')
    // A Cyrillic layout types "л" on the K key; Option+K on a Mac types "˚".
    expect(comboOf({ ...press('л', { ctrlKey: true }), code: 'KeyK' }, false)).toBe('Mod+K')
    expect(comboOf({ ...press('˚', { altKey: true }), code: 'KeyK' }, true)).toBe('Alt+K')
    expect(comboOf(press(' '), false)).toBe('Space')
    expect(comboOf(press('ArrowLeft', { shiftKey: true }), false)).toBe('Shift+ArrowLeft')
  })

  it('runs single keys and two-key sequences, and falls back when a sequence goes nowhere', () => {
    const map = keymap()
    expect(match(map, null, 'Mod+K')).toEqual({ run: 'palette', pending: null })
    expect(match(map, null, 'G')).toEqual({ pending: 'G' })
    expect(match(map, 'G', 'M')).toEqual({ run: 'goMonth', pending: null })
    // G then N is no sequence, but N alone is "new transaction".
    expect(match(map, 'G', 'N')).toEqual({ run: 'add', pending: null })
    expect(match(map, null, 'Q')).toEqual({ pending: null })
  })

  it('finds clashes, including one binding starting another', () => {
    const map = keymap()
    expect(clash(map, 'N')).toBe('add')
    expect(clash(map, 'G')).toBe('goMonth') // would swallow every G sequence
    expect(clash(map, 'N X')).toBe('add') // N would fire before X
    expect(clash(map, 'Mod+J')).toBeUndefined()
  })

  it('keeps the Mac window keys out of reach', () => {
    expect(reserved('Mod+Q')).toBe(true)
    expect(reserved('Mod+W')).toBe(true)
    expect(reserved('Mod+Shift+W')).toBe(false)
  })

  it('stores only what differs from the defaults', () => {
    expect(overrides(keymap())).toBeNull()
    const mine = { ...keymap(), add: ['A'], lang: ['Mod+L'] }
    expect(overrides(mine)).toEqual({ add: ['A'], lang: ['Mod+L'] })
    expect(keymap(overrides(mine))).toEqual(mine)
    // A command a newer version added (and stored) is ignored here.
    expect(Object.keys(keymap({ nope: ['X'] } as never))).toEqual(Object.keys(DEFAULT_KEYS))
  })

  it('shows keycaps per platform', () => {
    expect(keycaps('Mod+Shift+Z', false)).toEqual([['Ctrl', 'Shift', 'Z']])
    expect(keycaps('Mod+Shift+Z', true)).toEqual([['⌘', '⇧', 'Z']])
    expect(keycaps('G M', false)).toEqual([['G'], ['M']])
    expect(keycaps('Mod++', false)).toEqual([['Ctrl', '+']])
  })
})
