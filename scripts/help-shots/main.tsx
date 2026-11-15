// One page of the app, filled with the sample account (sample.ts), for shoot.mjs to photograph:
// ?page=month|year|subs|goals|categories|split &lang=en|hu &theme=light|dark
// The real page components render from the local Dexie mirror, which this page fills directly (nothing reaches
// Supabase). window.__locate(name) tells the shooter what to cut out and where each numbered marker goes.
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/newsreader'
import './shots.css'
import { db, type Lang } from '../../src/db'
import { dicts } from '../../src/i18n'
import { formatMoney } from '../../src/lib'
import { Ctx, type AppCtx } from '../../src/ui'
import { MonthPage } from '../../src/pages/Month'
import { YearPage } from '../../src/pages/Year'
import { SubsPage } from '../../src/pages/Subs'
import { GoalsPage } from '../../src/pages/Goals'
import { CategoriesPage } from '../../src/pages/Categories'
import { Ratios } from '../../src/pages/Settings'
import { sample } from './sample'

const q = new URLSearchParams(location.search)
const page = q.get('page') ?? 'month'
const lang = (q.get('lang') ?? 'en') as Lang
const dark = q.get('theme') === 'dark'
const t = dicts[lang]
document.documentElement.classList.toggle('dark', dark)
document.documentElement.lang = lang

const noop = () => {}

function Shell() {
  const settings = useLiveQuery(() => db.settings.get('app'))
  const cats = useLiveQuery(() => db.categories.toArray())
  const ctx = useMemo<AppCtx | null>(
    () =>
      settings && cats
        ? { s: settings, t, cats, cat: new Map(cats.map((c) => [c.id, c])), money: (m, compact) => formatMoney(m, settings.currency, t.locale, compact) }
        : null,
    [settings, cats],
  )
  if (!ctx) return null
  const pages: Record<string, ReactNode> = {
    month: <MonthPage month="2026-10" setMonth={noop} onAdd={noop} onEdit={noop} />,
    year: <YearPage year={2026} setYear={noop} openMonth={noop} openStory={noop} />,
    subs: <SubsPage />,
    goals: <GoalsPage />,
    categories: <CategoriesPage />,
    split: <Ratios />,
  }
  // The app's page panel: the same width and padding as <main> on a desktop window.
  return (
    <Ctx.Provider value={ctx}>
      <main id="panel" className="mx-auto max-w-6xl bg-panel px-10 pt-10 pb-10">
        {pages[page]}
      </main>
    </Ctx.Provider>
  )
}

// --- What to photograph ----------------------------------------------------

type Box = { x: number; y: number; width: number; height: number }
const box = (e: Element): Box => {
  const r = e.getBoundingClientRect()
  return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }
}
/** The rectangle around a run of elements with `pad` to spare; `wide` spans the whole panel instead of just them. */
const around = (els: Element[], pad = 24, wide = false): Box => {
  // Closed dialogs and other hidden parts measure 0 × 0 at the page's corner: they would stretch the crop.
  const boxes = els.map(box).filter((b) => b.width && b.height)
  const panel = box(document.getElementById('panel')!)
  const left = wide ? panel.x + 16 : Math.min(...boxes.map((b) => b.x)) - pad
  const right = wide ? panel.x + panel.width - 16 : Math.max(...boxes.map((b) => b.x + b.width)) + pad
  const top = Math.min(...boxes.map((b) => b.y)) - pad
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad
  return { x: left, y: top, width: right - left, height: bottom - top }
}
const byText = (sel: string, text: string) => [...document.querySelectorAll(sel)].find((e) => e.textContent?.trim() === text)!
const heading = (text: string) => byText('h2', text).closest('section')!
// A marker is an anchor on the edge of what it numbers, plus the side it sits on: the Help page puts the marker
// against that point with a gap in screen pixels, so it stays snug at any size the picture is drawn.
type Side = 'right' | 'left' | 'top' | 'corner'
type Mark = [x: number, y: number, side: Side]

/** The box of the visible text inside `e` (not of `e`: a label's row may be far wider than its words). */
const ink = (e: Element) => {
  const range = document.createRange()
  range.selectNodeContents(e)
  const r = range.getBoundingClientRect()
  return { left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY, mid: r.top + scrollY + r.height / 2 }
}
/** Just after the words of `e`, on their middle. */
const after = (e: Element): Mark => [ink(e).right, ink(e).mid, 'right']
/** Just before the words (or contents) of `e`, on their middle. */
const before = (e: Element): Mark => [ink(e).left, ink(e).mid, 'left']
/** Over the middle of what a control shows (its icon and label, not its padding); an input by its box. */
const above = (e: Element): Mark => {
  if (e instanceof HTMLInputElement) {
    // An input's box is taller than its line: anchor at the top of the placeholder's line, level with the buttons' labels.
    const b = box(e)
    const line = parseFloat(getComputedStyle(e).fontSize) * 1.2
    return [b.x + b.width / 2, b.y + (b.height - line) / 2, 'top']
  }
  const r = ink(e)
  return [(r.left + r.right) / 2, r.top, 'top']
}
/** On a button's top right corner, like a badge, where there is no room beside it. */
const corner = (e: Element): Mark => {
  const b = box(e)
  return [b.x + b.width, b.y, 'corner']
}

const LOCATE: Record<string, () => { clip: Box; marks: Mark[] }> = {
  'month-top': () => {
    const panel = document.getElementById('panel')!
    const [header, stats] = [panel.children[0], panel.children[1]]
    // The big figure of each tile: what the caption explains.
    const figure = (label: string) => byText('#panel div', label).nextElementSibling!
    return {
      clip: around([header, stats], 20, true),
      marks: [
        after(header.querySelector('h1')!),
        before(header.querySelector(`[aria-label="${t.prev}"]`)!.parentElement!),
        corner(byText('button', t.add)),
        after(figure(t.remaining)),
        after(figure(t.income)),
        after(figure(t.expenses)),
      ],
    }
  },
  'month-split': () => {
    const card = heading(t.plan)
    const [head, , foot] = card.querySelector('li')!.children
    return {
      clip: around([card]),
      marks: [before(head.children[1]), after(foot.children[0]), before(foot.children[1])],
    }
  },
  'month-txs': () => {
    const card = heading(t.transactions)
    const rows = [...card.querySelectorAll('li')].slice(0, 4)
    return {
      clip: around([card.querySelector('h2')!, ...rows], 20),
      marks: [
        above(card.querySelector(`input[placeholder="${t.searchTx}"]`)!),
        above(card.querySelector(`[aria-label="${t.filters}"]`)!),
        above(card.querySelector(`[aria-label="${t.sortLabel}"]`) ?? byText('button', t.sorts['date-desc'])),
        above(card.querySelector(`[aria-label="${t.select}"]`)!),
        // The first entry's description: "click any entry".
        after(rows[0].querySelector('.font-medium')!),
      ],
    }
  },
  year: () => ({ clip: around([document.getElementById('panel')!.children[0], heading(t.trend)], 20, true), marks: [] }),
  subs: () => {
    const panel = document.getElementById('panel')!
    const c = around([...panel.children], 20, true)
    return { clip: { ...c, height: Math.min(c.height, 640) }, marks: [] }
  },
  goals: () => ({ clip: around([...document.getElementById('panel')!.children], 20, true), marks: [] }),
  categories: () => ({ clip: around([...document.getElementById('panel')!.children], 20, true), marks: [] }),
  split: () => ({ clip: around([document.getElementById('panel')!.firstElementChild!], 20), marks: [] }),
}

declare global {
  interface Window {
    __ready?: boolean
    __locate?: (name: string) => { clip: Box; marks: Mark[] }
  }
}
window.__locate = (name) => LOCATE[name]()

// Fill the mirror, then draw; __ready tells the shooter the page has its data and fonts.
const data = sample(lang, dark)
await db.transaction('rw', [db.txs, db.categories, db.goals, db.subs, db.settings], async () => {
  await Promise.all([db.txs.clear(), db.categories.clear(), db.goals.clear(), db.subs.clear(), db.settings.clear()])
  await Promise.all([db.txs.bulkPut(data.txs), db.categories.bulkPut(data.cats), db.goals.bulkPut(data.goals), db.subs.bulkPut(data.subs), db.settings.put(data.settings)])
})
createRoot(document.getElementById('root')!).render(<Shell />)
await document.fonts.ready
window.__ready = true
