// Keyboard shortcuts as plain strings, so they sync with the settings and read the same on every machine.
// A combo is modifiers then a key, joined by "+": "Mod+Shift+Z", "?", "ArrowLeft". A binding is one combo or
// two separated by a space, pressed one after the other: "G M". "Mod" is Cmd on a Mac and Ctrl everywhere else.

export const COMMANDS = [
  'palette', 'help', 'add', 'undo', 'redo',
  'goMonth', 'goYear', 'goSubs', 'goGoals', 'goCategories', 'goSettings',
  'prev', 'next', 'today',
  'sidebar', 'theme', 'lang', 'colorblind',
] as const
export type CommandId = (typeof COMMANDS)[number]
export type Keymap = Record<CommandId, string[]>

export const DEFAULT_KEYS: Keymap = {
  palette: ['Mod+K'],
  help: ['?'],
  add: ['N'],
  undo: ['Mod+Z'],
  redo: ['Mod+Shift+Z', 'Mod+Y'],
  goMonth: ['G M'],
  goYear: ['G Y'],
  goSubs: ['G S'],
  goGoals: ['G G'],
  goCategories: ['G C'],
  goSettings: ['Mod+,'],
  prev: ['ArrowLeft'],
  next: ['ArrowRight'],
  today: ['T'],
  sidebar: ['Mod+B'],
  theme: ['Shift+D'],
  lang: [],
  colorblind: [],
}

/** The defaults with the user's changes over them; ids a newer version stored and this one lacks are dropped. */
export const keymap = (over?: Partial<Keymap> | null): Keymap =>
  Object.fromEntries(COMMANDS.map((id) => [id, over?.[id] ?? DEFAULT_KEYS[id]])) as Keymap

/** Only the commands whose keys differ from the defaults, or null when none do: what the settings store. */
export function overrides(map: Keymap): Partial<Keymap> | null {
  const diff = COMMANDS.filter((id) => map[id].join('\n') !== DEFAULT_KEYS[id].join('\n'))
  return diff.length ? Object.fromEntries(diff.map((id) => [id, map[id]])) : null
}

export const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift', 'AltGraph', 'CapsLock', 'OS', 'Fn', 'Dead', 'Unidentified', 'Process'])

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'> & { getModifierState?: (k: string) => boolean }

/**
 * The combo a key press makes, or null for a lone modifier. Letters go by the character typed, so Z is Z on a
 * QWERTZ keyboard too; a layout without Latin letters (or Option on a Mac) falls back to the key's position.
 * Shift counts for letters and named keys only: "?" already says Shift was down, and differs by layout anyway.
 */
export function comboOf(e: KeyLike, mac = MAC): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  // AltGr types characters ([ { @ on European layouts) and reports itself as Ctrl+Alt.
  const altGr = !mac && !!e.getModifierState?.('AltGraph')
  const ctrl = e.ctrlKey && !altGr
  const alt = e.altKey && !altGr
  let key = e.key === ' ' ? 'Space' : e.key
  if (key.length === 1) {
    const latin = /^Key([A-Z])$/.exec(e.code)
    if (latin && (!/^[\x21-\x7e]$/.test(key) || (mac && alt))) key = latin[1]
    key = key.toUpperCase()
  }
  const shift = e.shiftKey && (/^[A-Z]$/.test(key) || key.length > 1)
  return [(mac ? e.metaKey : ctrl) && 'Mod', mac && ctrl && 'Ctrl', !mac && e.metaKey && 'Meta', alt && 'Alt', shift && 'Shift', key].filter(Boolean).join('+')
}

/** Whether a combo holds a modifier other than Shift: those work inside text fields and never start a sequence. */
export const chorded = (combo: string) => /(^|\+)(Mod|Ctrl|Meta|Alt)\+/.test(combo)

/**
 * One key press against the keymap. `pending` is the first half of a sequence typed just before.
 * Returns the command to run, or the new pending prefix (null when nothing waits).
 */
export function match(map: Keymap, pending: string | null, combo: string): { run?: CommandId; pending: string | null } {
  const seq = pending ? `${pending} ${combo}` : combo
  const hit = COMMANDS.find((id) => map[id].includes(seq))
  if (hit) return { run: hit, pending: null }
  if (!pending && !chorded(combo) && COMMANDS.some((id) => map[id].some((b) => b.startsWith(`${seq} `)))) return { pending: seq }
  // "G X" is no sequence, but X alone may still be a shortcut.
  return pending ? match(map, null, combo) : { pending: null }
}

/** The command whose keys would clash with `binding` (the same, or one starting the other), if any. */
export function clash(map: Keymap, binding: string): CommandId | undefined {
  return COMMANDS.find((id) => map[id].some((b) => b === binding || b.startsWith(`${binding} `) || binding.startsWith(`${b} `)))
}

/** Keys that keep their usual job on their own: Tab moves focus, Esc closes, Enter and Space press buttons. */
export const reserved = (combo: string) => ['Tab', 'Shift+Tab', 'Escape', 'Enter', 'Space', 'Backspace'].includes(combo)

const NAMES: Record<string, [string, string]> = {
  // [Mac, elsewhere]
  Mod: ['⌘', 'Ctrl'],
  Ctrl: ['⌃', 'Ctrl'],
  Meta: ['⌘', 'Win'],
  Alt: ['⌥', 'Alt'],
  Shift: ['⇧', 'Shift'],
  ArrowLeft: ['←', '←'],
  ArrowRight: ['→', '→'],
  ArrowUp: ['↑', '↑'],
  ArrowDown: ['↓', '↓'],
  Enter: ['↩', 'Enter'],
  Escape: ['Esc', 'Esc'],
  Backspace: ['⌫', 'Backspace'],
  Delete: ['⌦', 'Del'],
}

/** A binding as keycaps: one list per combo of the sequence, one label per key. */
export const keycaps = (binding: string, mac = MAC) =>
  binding.split(' ').map((combo) => combo.split(/\+(?!$)/).map((k) => NAMES[k]?.[mac ? 0 : 1] ?? k))
