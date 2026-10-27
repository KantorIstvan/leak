// The keyboard layer: every command the app has, the shortcuts that run them, the palette that finds them,
// the help sheet that lists them and the card in Settings that changes them. Plus the toast that offers undo.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowCounterClockwise, CalendarBlank, Keyboard, MagnifyingGlass, Plus, X } from '@phosphor-icons/react'
import { history, redo, saveSettings, undo } from './cloud'
import { db, type Tx } from './db'
import type { Dict } from './i18n'
import { chorded, clash, COMMANDS, comboOf, DEFAULT_KEYS, keycaps, keymap, MAC, match, overrides, reserved, type CommandId, type Keymap } from './keys'
import { EMPTY_QUERY, monthOf, queryTxs, shiftMonth, today } from './lib'
import { Button, Card, CatIcon, Sheet, useApp } from './ui'

type Group = keyof Dict['cmdGroups']
const GROUP: Record<CommandId, Group> = {
  add: 'edit', undo: 'edit', redo: 'edit',
  goMonth: 'go', goYear: 'go', goSubs: 'go', goGoals: 'go', goCategories: 'go', goSettings: 'go', prev: 'go', next: 'go', today: 'go',
  sidebar: 'view', theme: 'view', lang: 'view', colorblind: 'view',
  palette: 'app', help: 'app',
}
const GROUPS: Group[] = ['edit', 'go', 'view', 'app']

// Where a plain key is someone else's: typing in a field, or arrows inside a widget that moves with them.
const FIELDS = 'input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select, [contenteditable]:not([contenteditable=false])'
const ARROW_WIDGETS = '[role=radiogroup], [role=listbox], [role=slider], [role=tablist], [role=menu], [role=grid]'

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** One binding as keycaps; a sequence reads "G then M". */
export function Keys({ binding, className = '' }: { binding: string; className?: string }) {
  const { t } = useApp()
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {keycaps(binding).map((combo, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{t.then}</span>}
          {combo.map((k, j) => (
            <kbd key={j} className="inline-grid h-5 min-w-5 place-items-center px-1 font-sans text-[11px] leading-none font-medium text-zinc-700 ring-1 ring-ink/30 ring-inset dark:text-zinc-300">
              {k}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  )
}

type Page = 'month' | 'year' | 'subs' | 'goals' | 'categories' | 'settings'

interface Item {
  key: string
  label: string
  icon?: ReactNode
  side?: ReactNode
  run: () => unknown
}

/** Recently run commands, newest first: an empty palette offers them on top. Remembered on this device. */
const RECENT_KEY = 'leak-recent-commands'
function readRecent(): CommandId[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}
function remember(id: CommandId) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((r) => r !== id)].slice(0, 5)))
  } catch {
    // storage blocked: the palette just keeps its usual order
  }
}

/**
 * Runs the app's commands from shortcuts and the palette. Main hands over what the commands steer;
 * this renders the palette, the help sheet and the undo toast.
 */
export function Commands(p: {
  page: Page
  go: (p: Page) => void
  add: () => void
  edit: (tx: Tx) => void
  month: string
  setMonth: (m: string) => void
  year: number
  setYear: (y: number) => void
  toggleSidebar: () => void
  palette: boolean
  setPalette: (open: boolean) => void
}) {
  const { t, s } = useApp()
  const map = useMemo(() => keymap(s.shortcuts), [s.shortcuts])
  const hist = useSyncExternalStore(history.subscribe, history.get)
  const [help, setHelp] = useState(false)
  const paletteRef = useRef<HTMLDialogElement>(null)

  const periodic = p.page === 'month' || p.page === 'year'
  const shift = (d: number) => (p.page === 'year' ? p.setYear(p.year + d) : p.setMonth(shiftMonth(p.month, d)))
  const themes = ['system', 'light', 'dark'] as const
  // null: not available right now (nothing to undo, no period on this page). Hidden from the palette, keys do nothing.
  const run: Record<CommandId, (() => unknown) | null> = {
    palette: () => p.setPalette(!p.palette),
    help: () => setHelp(true),
    add: p.add,
    undo: hist.undo && undo,
    redo: hist.redo && redo,
    goMonth: () => p.go('month'),
    goYear: () => p.go('year'),
    goSubs: () => p.go('subs'),
    goGoals: () => p.go('goals'),
    goCategories: () => p.go('categories'),
    goSettings: () => p.go('settings'),
    prev: periodic ? () => shift(-1) : null,
    next: periodic ? () => shift(1) : null,
    today: periodic ? () => (p.page === 'year' ? p.setYear(new Date().getFullYear()) : p.setMonth(monthOf(today()))) : null,
    sidebar: p.toggleSidebar,
    theme: () => saveSettings({ theme: themes[(themes.indexOf(s.theme) + 1) % themes.length] }),
    lang: () => saveSettings({ lang: s.lang === 'hu' ? 'en' : 'hu' }),
    colorblind: () => saveSettings({ colorblind: !s.colorblind }),
  }
  const label = (id: CommandId) =>
    id === 'undo' && hist.undo ? t.undoWhat(t.step(hist.undo)) : id === 'redo' && hist.redo ? t.redoWhat(t.step(hist.redo)) : t.cmd[id]

  // The listener stays put; it reads the newest commands and keys through this ref.
  const latest = useRef({ run, map })
  useEffect(() => {
    latest.current = { run, map }
  })
  useEffect(() => {
    let pending: string | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      const combo = comboOf(e)
      if (!combo) return
      const inPalette = !!paletteRef.current?.open
      // Another dialog (a form, the help sheet) owns the keyboard until it closes.
      if (!inPalette && document.querySelector('dialog[open]')) return
      const el = e.target instanceof Element ? e.target : document.body
      const typing = inPalette || !!el.closest(FIELDS)
      if (typing && !chorded(combo)) return
      if (combo.startsWith('Arrow') && el.closest(ARROW_WIDGETS)) return
      const { run, map } = latest.current
      const r = match(map, typing ? null : pending, combo)
      clearTimeout(timer)
      pending = typing ? null : r.pending
      if (pending) {
        timer = setTimeout(() => (pending = null), 1500)
        e.preventDefault()
        return
      }
      if (!r.run || !run[r.run]) return
      // In a field Ctrl+Z undoes typing, and in the palette its own shortcut only closes it.
      if (inPalette ? r.run !== 'palette' : typing && (r.run === 'undo' || r.run === 'redo')) return
      e.preventDefault()
      run[r.run]!()
    }
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('keydown', onKey)
      clearTimeout(timer)
    }
  }, [])

  const commands = (): Item[] => {
    const recent = readRecent()
    return COMMANDS.filter((id) => id !== 'palette' && run[id])
      .toSorted((a, b) => {
        const ra = recent.indexOf(a)
        const rb = recent.indexOf(b)
        return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb) || GROUPS.indexOf(GROUP[a]) - GROUPS.indexOf(GROUP[b])
      })
      .map((id) => ({
        key: id,
        label: label(id),
        side: map[id][0] && <Keys binding={map[id][0]} />,
        run: () => {
          remember(id)
          return run[id]!()
        },
      }))
  }

  return (
    <>
      <Palette
        ref={paletteRef}
        open={p.palette}
        onClose={() => p.setPalette(false)}
        commands={commands}
        openMonth={(m) => {
          p.setMonth(m)
          p.go('month')
        }}
        openTx={(tx) => {
          p.setMonth(monthOf(tx.date))
          p.go('month')
          p.edit(tx)
        }}
      />
      <Sheet open={help} onClose={() => setHelp(false)} title={t.shortcuts}>
        <ShortcutList map={map} label={label} />
        <div className="mt-5 flex justify-end">
          <Button
            onClick={() => {
              setHelp(false)
              p.go('settings')
              // After the page has rendered.
              setTimeout(() => document.getElementById('shortcuts')?.scrollIntoView({ behavior: 'smooth' }), 100)
            }}
          >
            <Keyboard size={16} />
            {t.customize}
          </Button>
        </div>
      </Sheet>
      <UndoToast />
    </>
  )
}

function ShortcutList({ map, label }: { map: Keymap; label: (id: CommandId) => string }) {
  const { t } = useApp()
  return (
    <div className="grid gap-5">
      {GROUPS.map((g) => (
        <section key={g}>
          <h3 className="mb-1 text-[11px] font-medium tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400">{t.cmdGroups[g]}</h3>
          <ul>
            {COMMANDS.filter((id) => GROUP[id] === g).map((id) => (
              <li key={id} className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm last:border-0">
                <span className="min-w-0 truncate">{label(id)}</span>
                <span className="flex shrink-0 flex-wrap justify-end gap-2">
                  {map[id].length ? map[id].map((b) => <Keys key={b} binding={b} />) : <span className="text-xs text-zinc-500">{t.noShortcut}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Ctrl+K: commands, transactions (by description, category or amount) and months, all in one list. */
function Palette({
  ref,
  open,
  onClose,
  commands,
  openMonth,
  openTx,
}: {
  ref: React.RefObject<HTMLDialogElement | null>
  open: boolean
  onClose: () => void
  commands: () => Item[]
  openMonth: (m: string) => void
  openTx: (tx: Tx) => void
}) {
  const { t, cat, money } = useApp()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const txs = useLiveQuery(() => (open ? db.txs.toArray() : []), [open], [])
  useEffect(() => {
    const d = ref.current!
    if (open && !d.open) {
      setQ('')
      setActive(0)
      d.showModal()
    }
    if (!open && d.open) d.close()
  }, [open, ref])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const words = fold(q).split(/\s+/).filter(Boolean)
  const hit = (text: string) => words.every((w) => fold(text).includes(w))
  const sections: { title: string; items: Item[] }[] = []
  const cmds = commands().filter((c) => hit(c.label))
  if (cmds.length) sections.push({ title: t.paletteCommands, items: cmds })
  if (words.length) {
    const monthName = new Intl.DateTimeFormat(t.locale, { year: 'numeric', month: 'long' })
    const now = monthOf(today())
    // Months with transactions, plus the year around today, newest first.
    const months = [...new Set([...txs.map((tx) => monthOf(tx.date)), ...Array.from({ length: 13 }, (_, i) => shiftMonth(now, 1 - i))])].sort().reverse()
    const named = months.map((m) => ({ m, label: monthName.format(new Date(`${m}-01T00:00`)) })).filter((x) => hit(x.label)).slice(0, 4)
    if (named.length)
      sections.push({
        title: t.paletteMonths,
        items: named.map(({ m, label }) => ({ key: `m${m}`, label, icon: <CalendarBlank size={18} className="text-zinc-500" />, run: () => openMonth(m) })),
      })
    const day = new Intl.DateTimeFormat(t.locale, { year: 'numeric', month: 'short', day: 'numeric' })
    const found = queryTxs(txs, { ...EMPTY_QUERY, text: q }, (id) => cat.get(id)?.name ?? '').slice(0, 8)
    if (found.length)
      sections.push({
        title: t.paletteTxs,
        items: found.map((tx) => ({
          key: tx.id,
          label: tx.note || cat.get(tx.categoryId)?.name || '?',
          icon: <CatIcon c={cat.get(tx.categoryId)} size="sm" />,
          side: (
            <span className="num text-right text-xs text-zinc-600 dark:text-zinc-400">
              <span className="block font-semibold text-zinc-900 dark:text-zinc-100">
                {tx.kind === 'income' ? '+' : '−'}
                {money(tx.amount)}
              </span>
              {day.format(new Date(`${tx.date}T00:00`))}
            </span>
          ),
          run: () => openTx(tx),
        })),
      })
  }
  const flat = sections.flatMap((x) => x.items)
  const at = Math.min(active, flat.length - 1)

  const choose = (item: Item | undefined) => {
    if (!item) return
    // Closed before the command runs: closing hands focus back, which must not take it from a form the command opens.
    ref.current?.close()
    // A failed command (offline save) reaches main.tsx's alert like any other.
    void Promise.resolve(item.run())
  }

  let n = -1
  return (
    <dialog ref={ref} className="palette" aria-label={t.palette} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="relative border-b border-ink">
        <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-zinc-500" aria-hidden />
        <input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={flat[at] ? `pal-${flat[at].key}` : undefined}
          placeholder={t.palettePlaceholder}
          className="h-14 w-full bg-transparent pr-4 pl-11 text-base outline-none placeholder:text-zinc-500"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            // To the ends: ⌘↑ / ⌘↓ on a Mac (which has no Home/End key), Ctrl+Home / Ctrl+End elsewhere.
            const jump = MAC ? e.metaKey : e.ctrlKey
            if (jump && (e.key === 'Home' || e.key === 'ArrowUp')) setActive(0)
            else if (jump && (e.key === 'End' || e.key === 'ArrowDown')) setActive(flat.length - 1)
            else if (e.key === 'ArrowDown') setActive((at + 1) % flat.length)
            else if (e.key === 'ArrowUp') setActive((at - 1 + flat.length) % flat.length)
            else if (e.key === 'Enter') choose(flat[at])
            else return
            e.preventDefault()
          }}
        />
      </div>
      <ul ref={listRef} id="palette-list" role="listbox" aria-label={t.palette} className="max-h-[min(26rem,60dvh)] overflow-y-auto p-1">
        {sections.map((sec) => (
          <li key={sec.title} role="presentation">
            <div className="px-3 pt-3 pb-1 text-[11px] font-medium tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400" aria-hidden>
              {sec.title}
            </div>
            <ul role="group" aria-label={sec.title}>
              {sec.items.map((item) => {
                const i = ++n
                return (
                  <li
                    key={item.key}
                    id={`pal-${item.key}`}
                    role="option"
                    aria-selected={i === at}
                    onPointerMove={() => i !== at && setActive(i)}
                    onClick={() => choose(item)}
                    className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${i === at ? 'bg-ink/5 shadow-[inset_2px_0_0_var(--color-ink)]' : ''}`}
                  >
                    {item.icon}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.side}
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
        {!flat.length && <li className="p-6 text-center text-sm text-zinc-600 dark:text-zinc-400">{t.noMatch}</li>}
      </ul>
      <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-zinc-500 pointer-coarse:hidden dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <Keys binding="ArrowUp" />
          <Keys binding="ArrowDown" />
        </span>
        <Keys binding="Enter" />
        <Keys binding="Escape" />
      </div>
    </dialog>
  )
}

/** After an undo or redo, and after a delete, says what happened and offers to take it back. */
function UndoToast() {
  const { t } = useApp()
  const { last } = useSyncExternalStore(history.subscribe, history.get)
  const [gone, setGone] = useState<number | null>(null) // the toast closed or timed out
  const [seen] = useState(() => last?.seq ?? 0) // what happened before this mounted is old news
  const seq = last && last.seq > seen && (last.kind !== 'did' || last.label.what === 'delete') ? last.seq : null
  useEffect(() => {
    if (seq === null) return
    const id = setTimeout(() => setGone(seq), 6000)
    return () => clearTimeout(id)
  }, [seq])

  if (!last || seq === null || gone === seq) return null
  const what = t.step(last.label)
  const text = last.kind === 'undo' ? t.undone(what) : last.kind === 'redo' ? t.redone(what) : what
  const back = last.kind === 'undo' ? redo : undo
  return (
    <div
      role="status"
      className="anim-fade-up fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center gap-3 bg-ink py-2 pr-2 pl-4 text-sm text-panel shadow-[4px_4px_0_rgb(0_0_0/0.15)] md:bottom-6"
    >
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <button
        type="button"
        onClick={() => {
          setGone(seq)
          void back()
        }}
        className="flex h-8 shrink-0 items-center gap-1.5 px-3 text-[13px] font-medium tracking-[0.08em] uppercase transition hover:bg-panel/15 focus-visible:outline-2 focus-visible:outline-panel"
      >
        <ArrowCounterClockwise size={14} weight="bold" className={last.kind === 'undo' ? '-scale-x-100' : ''} />
        {last.kind === 'undo' ? t.cmd.redo : t.cmd.undo}
      </button>
      <button type="button" aria-label={t.cancel} onClick={() => setGone(seq)} className="grid size-8 shrink-0 place-items-center transition hover:bg-panel/15 focus-visible:outline-2 focus-visible:outline-panel">
        <X size={14} />
      </button>
    </div>
  )
}

/** Settings card: every command with its keys; + records a new one, × removes one. */
export function ShortcutsCard() {
  const { t, s } = useApp()
  const map = keymap(s.shortcuts)
  const [recording, setRecording] = useState<CommandId | null>(null)
  const [error, setError] = useState<{ id: CommandId; text: string } | null>(null)
  const save = (next: Keymap) => saveSettings({ shortcuts: overrides(next) })

  function bind(id: CommandId, binding: string) {
    setRecording(null)
    if (binding.split(' ').some(reserved)) return setError({ id, text: t.keyReserved })
    const taken = clash(map, binding)
    if (taken === id && map[id].includes(binding)) return setError(null)
    if (taken) return setError({ id, text: t.keyTaken(t.cmd[taken]) })
    setError(null)
    return save({ ...map, [id]: [...map[id], binding] })
  }

  return (
    <Card
      title={t.shortcuts}
      hint={t.shortcutsHint}
      action={
        s.shortcuts && (
          <Button variant="ghost" className="h-8 px-3" onClick={() => save(DEFAULT_KEYS)}>
            {t.resetColors}
          </Button>
        )
      }
    >
      <div id="shortcuts" className="grid scroll-mt-6 gap-6">
        {GROUPS.map((g) => (
          <section key={g}>
            <h3 className="mb-1 text-[11px] font-medium tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400">{t.cmdGroups[g]}</h3>
            <ul>
              {COMMANDS.filter((id) => GROUP[id] === g).map((id) => {
                const changed = map[id].join('\n') !== DEFAULT_KEYS[id].join('\n')
                return (
                  <li key={id} className="border-b border-line py-2 last:border-0">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <span className="min-w-0 text-sm">{t.cmd[id]}</span>
                      <span className="flex flex-wrap items-center justify-end gap-1.5">
                        {map[id].map((b) => (
                          <span key={b} className="inline-flex h-8 items-center gap-1 pl-2 ring-1 ring-line ring-inset">
                            <Keys binding={b} />
                            <button
                              type="button"
                              aria-label={t.removeShortcut(keycaps(b).map((c) => c.join('+')).join(` ${t.then} `))}
                              onClick={() => save({ ...map, [id]: map[id].filter((x) => x !== b) })}
                              className="grid size-7 place-items-center text-zinc-500 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent dark:hover:text-zinc-100"
                            >
                              <X size={12} weight="bold" />
                            </button>
                          </span>
                        ))}
                        {recording === id ? (
                          <Recorder onDone={(b) => bind(id, b)} onCancel={() => setRecording(null)} />
                        ) : (
                          <button
                            type="button"
                            aria-label={t.addShortcut(t.cmd[id])}
                            data-tip={t.addShortcut(t.cmd[id])}
                            onClick={() => {
                              setError(null)
                              setRecording(id)
                            }}
                            className="grid size-8 place-items-center text-zinc-600 ring-1 ring-ink/30 ring-inset transition hover:bg-ink/5 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent dark:text-zinc-400 dark:hover:text-zinc-100"
                          >
                            <Plus size={14} weight="bold" />
                          </button>
                        )}
                        {changed && (
                          <Button variant="ghost" className="h-8 px-2" onClick={() => save({ ...map, [id]: DEFAULT_KEYS[id] })}>
                            {t.resetColor}
                          </Button>
                        )}
                      </span>
                    </div>
                    {error?.id === id && <p className="anim-fade mt-1 text-right text-xs font-medium text-rose-700 dark:text-rose-400">{error.text}</p>}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  )
}

/**
 * Catches the next keys while focused. A combo with Ctrl/Cmd/Alt is done at once; a plain key waits a moment
 * for a second one, to make a sequence. Esc or leaving it cancels.
 */
function Recorder({ onDone, onCancel }: { onDone: (binding: string) => void; onCancel: () => void }) {
  const { t } = useApp()
  const [first, setFirst] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <button
      type="button"
      autoFocus
      onBlur={onCancel}
      onKeyDown={(e) => {
        // Kept from the app's own shortcuts and from the browser's.
        e.preventDefault()
        e.stopPropagation()
        const combo = comboOf(e.nativeEvent)
        if (!combo) return
        clearTimeout(timer.current)
        if (combo === 'Escape') return onCancel()
        if (first) return onDone(`${first} ${combo}`)
        if (chorded(combo)) return onDone(combo)
        setFirst(combo)
        timer.current = setTimeout(() => onDone(combo), 900)
      }}
      className="anim-fade flex h-8 items-center gap-2 bg-accent px-3 text-xs font-medium text-accent-fg focus-visible:outline-none"
    >
      {first ? <Keys binding={first} className="[&_kbd]:text-accent-fg [&_kbd]:ring-accent-fg/50" /> : t.pressKeys}
    </button>
  )
}
