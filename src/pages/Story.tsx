/**
 * The year story: a full-screen, scene-by-scene review of a year. On a desktop it reads like a product page, each
 * scene a tall section whose sticky stage plays as you scroll through it (useScroll → one 0..1 progress value). On a
 * phone it is a stack of full-height snap cards, each playing once it is in view (a spring runs its progress to 1),
 * with a segmented bar on top and tap zones to step. Every scene draws itself from the same progress value, so the two
 * layouts share one component per scene. Under reduced motion the progress is a constant 1 and nothing is hidden.
 *
 * Motion+ has ready parts for several of these (AnimateNumber, split text); as with Badge.tsx, these are our own.
 */
import { motion, useInView, useMotionTemplate, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowLeft, Hash, X } from '@phosphor-icons/react'
import { db, type Category } from '../db'
import { ratiosFor, savingsIncome } from '../lib'
import { markStorySeen, yearStory, type Story } from '../story'
import { squarify } from '../charts'
import { ICONS } from '../icons'
import { Button, useApp, usePhone } from '../ui'

// --- Progress helpers -----------------------------------------------------

type P = MotionValue<number>

/**
 * A copy of a scroll value that stays on the JS path. Motion marks useScroll's values for hardware acceleration and
 * turns anything derived from them and bound to `style` into a native ScrollTimeline/ViewTimeline animation, whose
 * range is not the offset asked for here; copying through a plain value keeps one behaviour in every WebView.
 */
function useScrollCopy(v: P) {
  const copy = useMotionValue(v.get())
  useMotionValueEvent(v, 'change', (x) => copy.set(x))
  return copy
}

/** The slice [from, to] of the scene's progress as 0..1, clamped. */
const useWindow = (p: P, from: number, to: number) => useTransform(p, [from, to], [0, 1], { clamp: true })

/** Text that rises, sharpens and fades in over a slice of the progress. */
function Reveal({ p, from = 0, to = 0.3, y = 28, className = '', children, style }: { p: P; from?: number; to?: number; y?: number; className?: string; children: ReactNode; style?: CSSProperties }) {
  const k = useWindow(p, from, to)
  const ty = useTransform(k, [0, 1], [y, 0])
  const blur = useTransform(k, [0, 1], [8, 0])
  const filter = useMotionTemplate`blur(${blur}px)`
  return (
    <motion.div className={className} style={{ opacity: k, y: ty, filter, ...style }}>
      {children}
    </motion.div>
  )
}

/** A figure counting up from zero over a slice of the progress, formatted on every frame. */
function Count({ p, from = 0.05, to = 0.5, value, format, step = 100, className = '' }: { p: P; from?: number; to?: number; value: number; format: (n: number) => string; step?: number; className?: string }) {
  const k = useWindow(p, from, to)
  // Ease out: the last digits settle slowly, as a counter should. `step`: money counts in whole units, not fillér.
  const v = useTransform(k, (x) => value * (1 - Math.pow(1 - x, 3)))
  const text = useTransform(v, (n) => format(Math.round(n / step) * step))
  return <motion.span className={`num ${className}`}>{text}</motion.span>
}

// --- Scene shell -----------------------------------------------------------

/** paper: the page's own colours. ink: the inverse of them, so the scenes alternate in light and dark alike. dark: always dark. */
type Ground = 'paper' | 'ink' | 'dark'

interface SceneDef {
  id: string
  ground: Ground
  aura?: string // a colour to glow behind the stage
  render: (p: P) => ReactNode
}

const GROUND: Record<Ground, string> = {
  paper: 'bg-panel text-ink',
  ink: 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900',
  dark: 'bg-zinc-950 text-zinc-50',
}
/** The colour of the chrome (close button, segments) over each ground. */
const SEG: Record<Ground, string> = { paper: 'text-ink', ink: 'text-zinc-50 dark:text-zinc-900', dark: 'text-zinc-50' }
const CHROME: Record<Ground, string> = {
  paper: 'text-ink hover:bg-ink/10',
  ink: 'text-zinc-50 hover:bg-white/10 dark:text-zinc-900 dark:hover:bg-black/10',
  dark: 'text-zinc-50 hover:bg-white/10',
}

/**
 * One scene. Desktop: a tall section with a sticky, screen-high stage; its progress is how far the section has
 * scrolled through. Phone: one screen-high snap card; its progress springs to 1 once it is mostly in view.
 */
function Scene({ def, index, scroller, phone, still, setRef }: { def: SceneDef; index: number; scroller: RefObject<HTMLDivElement | null>; phone: boolean; still: boolean; setRef: (i: number, el: HTMLElement | null) => void }) {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, container: scroller, offset: ['start start', 'end end'] })
  const scrolled = useScrollCopy(scrollYProgress)
  const inView = useInView(ref, { root: scroller, amount: 0.6 })
  const spring = useSpring(0, { visualDuration: 1.1, bounce: 0 })
  useEffect(() => {
    if (phone) spring.set(inView ? 1 : 0)
  }, [phone, inView, spring])
  const one = useMotionValue(1)
  const p = still ? one : phone ? spring : scrolled
  const auraScale = useTransform(p, [0, 0.6], [0.6, 1])
  const auraOpacity = useTransform(p, [0, 0.4], [0, 1])

  return (
    <section
      ref={(el) => {
        ref.current = el
        setRef(index, el)
      }}
      aria-label={def.id}
      className={`relative ${phone ? 'h-dvh snap-start' : 'min-h-[190vh]'} ${GROUND[def.ground]}`}
    >
      <div className={`${phone ? 'h-full' : 'sticky top-0 h-dvh'} overflow-hidden`}>
        {def.aura && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ scale: auraScale, opacity: auraOpacity, background: `radial-gradient(ellipse 55% 50% at 50% 55%, ${def.aura}55, transparent 70%)` }}
          />
        )}
        <div className={`relative mx-auto flex h-full w-full max-w-5xl flex-col justify-center px-6 ${phone ? 'pt-16 pb-[max(2rem,env(safe-area-inset-bottom))]' : 'px-10'}`}>
          {def.render(p)}
        </div>
      </div>
    </section>
  )
}

// --- Shared bits -----------------------------------------------------------

const kicker = 'text-[11px] font-medium tracking-[0.14em] uppercase opacity-70'
const h2 = 'font-display text-[clamp(2rem,5vw,4rem)] leading-[1.02] tracking-[-0.03em]'
const big = 'font-display text-[clamp(3.25rem,11vw,9rem)] leading-[0.95] tracking-[-0.045em]'
const sub = 'mt-5 max-w-xl text-base leading-relaxed opacity-80 md:text-xl'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A name set as large as its longest word allows in half a wrap, so it never breaks inside a word. */
function fitName(name: string) {
  const longest = Math.max(...name.split(/\s+/).map((w) => w.length))
  const size = longest <= 6 ? big : longest <= 9 ? 'font-display text-[clamp(2.75rem,7.5vw,6.5rem)] leading-[0.95] tracking-[-0.04em]' : longest <= 13 ? 'font-display text-[clamp(2.25rem,5vw,4.5rem)] leading-[1] tracking-[-0.03em]' : h2
  return `${size} text-balance`
}

function useFormats() {
  const { t } = useApp()
  return useMemo(
    () => ({
      pct: new Intl.NumberFormat(t.locale, { style: 'percent', maximumFractionDigits: 0 }),
      change: new Intl.NumberFormat(t.locale, { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' }),
      int: new Intl.NumberFormat(t.locale),
      month: (i: number) => cap(new Intl.DateTimeFormat(t.locale, { month: 'long' }).format(new Date(2000, i, 1))),
      monthShort: (i: number) => new Intl.DateTimeFormat(t.locale, { month: 'short' }).format(new Date(2000, i, 1)).replace('.', ''),
      weekday: (i: number) => cap(new Intl.DateTimeFormat(t.locale, { weekday: 'long' }).format(new Date(Date.UTC(2024, 0, 1 + i)))), // 2024-01-01 was a Monday
      day: (d: string) => cap(new Intl.DateTimeFormat(t.locale, { month: 'long', day: 'numeric' }).format(new Date(`${d}T00:00:00`))),
    }),
    [t.locale],
  )
}

// --- Scenes ----------------------------------------------------------------

function Cover({ s, phone }: { s: Story; phone: boolean }) {
  const { t } = useApp()
  // The hero enters once on load, not with the scroll.
  const enter = (d: number) => ({ initial: { opacity: 0, y: 24, filter: 'blur(8px)' }, animate: { opacity: 1, y: 0, filter: 'blur(0px)' }, transition: { duration: 0.7, delay: d, ease: [0.16, 1, 0.3, 1] as const } })
  return (
    <div>
      <motion.p className={kicker} {...enter(0.1)}>
        {t.story.coverKicker}
      </motion.p>
      <motion.h1 className={`${big} mt-4`} {...enter(0.25)}>
        {s.year}
      </motion.h1>
      <motion.p className={sub} {...enter(0.5)}>
        {t.story.coverSub(s.txCount)}
      </motion.p>
      <motion.div className="mt-12 flex items-center gap-2 text-sm opacity-60" initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} transition={{ delay: 1.2, duration: 0.6 }}>
        <motion.span animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }} className="motion-reduce:hidden">
          <ArrowDown size={16} />
        </motion.span>
        {phone ? t.story.tapHint : t.story.scrollHint}
      </motion.div>
    </div>
  )
}

function Kept({ p, s }: { p: P; s: Story }) {
  const { t, money } = useApp()
  const f = useFormats()
  const share = Math.max(0, Math.min(1, s.keptShare))
  const k = useWindow(p, 0.5, 0.8)
  const fill = useTransform(k, [0, 1], [0, share])
  return (
    <div>
      <Reveal p={p} from={0} to={0.15}>
        <p className={kicker}>{t.story.earned}</p>
      </Reveal>
      <Reveal p={p} from={0.03} to={0.2}>
        <p className={`${h2} mt-2`}>
          <Count p={p} from={0.05} to={0.35} value={s.income} format={money} />
        </p>
      </Reveal>
      <Reveal p={p} from={0.35} to={0.5} className="mt-10 md:mt-14">
        <p className={kicker}>{s.kept >= 0 ? t.story.keptTitle : t.story.overspent}</p>
      </Reveal>
      <Reveal p={p} from={0.38} to={0.55}>
        <p className={`${big} mt-3 ${s.kept < 0 ? 'text-expense' : ''}`}>
          <Count p={p} from={0.4} to={0.8} value={Math.abs(s.kept)} format={money} />
        </p>
      </Reveal>
      <Reveal p={p} from={0.5} to={0.65} className="mt-8 max-w-xl">
        <div className="h-1 w-full bg-current/15">
          <motion.div className="h-full origin-left bg-income" style={{ scaleX: fill }} aria-hidden />
        </div>
        <p className="num mt-2 text-sm opacity-80">
          {t.story.keptShare(f.pct.format(s.keptShare))}
          {s.invested > 0 && ` · ${t.story.invested(money(s.invested))}`}
        </p>
      </Reveal>
    </div>
  )
}

/** One month's two bars, rising in turn with the scroll. */
function MonthBars({ p, i, income, spent, max, label, mark }: { p: P; i: number; income: number; spent: number; max: number; label: string; mark?: string }) {
  const k = useWindow(p, 0.08 + (i / 12) * 0.55, 0.08 + (i / 12) * 0.55 + 0.18)
  const sy = useTransform(k, [0, 1], [0, 1])
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <div className="flex h-full w-full items-end justify-center gap-[3px]">
        <motion.div className="w-full max-w-5 origin-bottom bg-income" style={{ height: `${(income / max) * 100}%`, scaleY: sy }} />
        <motion.div className="w-full max-w-5 origin-bottom bg-expense" style={{ height: `${(spent / max) * 100}%`, scaleY: sy }} />
      </div>
      <motion.span className="truncate text-[10px] tracking-wide uppercase opacity-70 md:text-xs" style={{ opacity: k }}>
        <span className="md:hidden">{label.slice(0, 1)}</span>
        <span className="max-md:hidden">{label}</span>
      </motion.span>
      <span className={`h-4 text-[10px] font-medium md:text-xs ${mark ? '' : 'invisible'}`}>{mark ?? '·'}</span>
    </div>
  )
}

function Rhythm({ p, s }: { p: P; s: Story }) {
  const { t } = useApp()
  const f = useFormats()
  const max = Math.max(1, ...s.months.flatMap((m) => [m.income, m.spent]))
  return (
    <div className="flex h-full max-h-[80vh] flex-col justify-center">
      <Reveal p={p} from={0} to={0.12}>
        <h2 className={h2}>{t.story.rhythmTitle}</h2>
        <p className={sub}>{t.story.rhythmSub}</p>
      </Reveal>
      <div className="mt-10 grid h-[32vh] min-h-40 grid-cols-12 gap-1 md:h-[36vh] md:gap-3">
        {s.months.map((m, i) => (
          <MonthBars key={i} p={p} i={i} income={m.income} spent={m.spent} max={max} label={f.monthShort(i)} mark={i === s.best ? '★' : i === s.hardest ? '▽' : undefined} />
        ))}
      </div>
      <Reveal p={p} from={0.6} to={0.75} className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-sm opacity-80">
        <span className="flex items-center gap-2">
          <span className="size-2.5 bg-income" aria-hidden />
          {t.income}
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 bg-expense" aria-hidden />
          {t.expenses}
        </span>
        {s.counted > 0 && <span className="num">{t.story.targetHit(s.hit, s.counted)}</span>}
      </Reveal>
    </div>
  )
}

function Best({ p, s }: { p: P; s: Story }) {
  const { t } = useApp()
  const f = useFormats()
  const m = s.months[s.best!]
  const kept = m.income ? (m.income - m.spent) / m.income : 0
  const hard = s.hardest !== undefined ? s.months[s.hardest] : null
  return (
    <div>
      <Reveal p={p} from={0} to={0.15}>
        <p className={kicker}>{t.story.bestTitle}</p>
      </Reveal>
      <Reveal p={p} from={0.05} to={0.3}>
        <h2 className={`${big} mt-3`}>{f.month(s.best!)}</h2>
      </Reveal>
      <Reveal p={p} from={0.25} to={0.4}>
        <p className={sub}>{t.story.bestSub(m.score ?? 0, f.pct.format(kept))}</p>
      </Reveal>
      {hard && (
        <Reveal p={p} from={0.55} to={0.75} className="mt-14 border-t border-current/20 pt-6">
          <p className={kicker}>{t.story.hardestTitle}</p>
          <p className={`${h2} mt-2`}>{f.month(s.hardest!)}</p>
          <p className="mt-2 text-base opacity-80 md:text-lg">{t.story.hardestSub(hard.score ?? 0)}</p>
        </Reveal>
      )}
    </div>
  )
}

/** The spending treemap, its tiles growing out of their centres in order of size. */
function Tiles({ p, s, cat }: { p: P; s: Story; cat: Map<string, Category> }) {
  const { money } = useApp()
  const f = useFormats()
  const rows = s.categories.slice(0, 9)
  const W = 100
  const H = 62
  const rects = useMemo(() => squarify(rows.map((r) => r.amount), W, H), [rows])
  return (
    <motion.div className="relative w-full" style={{ aspectRatio: `${W} / ${H}`, '--k': p } as CSSProperties}>
      {rects.map((r, i) => {
        const c = cat.get(rows[i].id)
        const start = 0.05 + (i / rects.length) * 0.5
        const bigTile = r.w * r.h > 400
        return (
          <div
            key={rows[i].id}
            className="absolute flex flex-col justify-end overflow-hidden p-2 text-white md:p-3"
            style={{
              left: `${r.x}%`,
              top: `${(r.y / H) * 100}%`,
              width: `${r.w}%`,
              height: `${(r.h / H) * 100}%`,
              background: c?.color ?? '#a1a1aa',
              boxShadow: 'inset 0 0 0 1px var(--panel)',
              // One progress variable drives every tile: no hook per tile.
              opacity: `clamp(0, calc((var(--k) - ${start}) * 6), 1)`,
              scale: `clamp(0.6, calc(0.6 + (var(--k) - ${start}) * 2.4), 1)`,
            }}
          >
            {bigTile && (
              <>
                <span className="truncate text-xs font-medium md:text-sm">{c?.name ?? '?'}</span>
                <span className="num text-[11px] opacity-90 md:text-xs">
                  {money(rows[i].amount, true)} · {f.pct.format(rows[i].share)}
                </span>
              </>
            )}
          </div>
        )
      })}
    </motion.div>
  )
}

function Categories({ p, s }: { p: P; s: Story }) {
  const { t, money, cat } = useApp()
  const f = useFormats()
  return (
    <div className="grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-center md:gap-14">
      <div className="order-2 md:order-1">
        <Tiles p={p} s={s} cat={cat} />
      </div>
      <div className="order-1 md:order-2">
        <Reveal p={p} from={0} to={0.15}>
          <h2 className={h2}>{t.story.catsTitle}</h2>
          <p className={sub}>{t.story.catsSub(s.categories.length)}</p>
        </Reveal>
        <ol className="mt-6 hidden md:block">
          {s.categories.slice(0, 5).map((r, i) => (
            <Reveal key={r.id} p={p} from={0.4 + i * 0.07} to={0.5 + i * 0.07} y={12}>
              <li className="num flex items-baseline gap-3 border-t border-current/15 py-2.5 text-sm">
                <span className="w-5 opacity-50">{i + 1}</span>
                <span className="flex items-center gap-2 truncate">
                  <span className="size-2.5 shrink-0" style={{ background: cat.get(r.id)?.color }} aria-hidden />
                  {cat.get(r.id)?.name ?? '?'}
                </span>
                <span className="ml-auto pl-4">{money(r.amount)}</span>
                <span className="w-12 text-right opacity-60">{f.pct.format(r.share)}</span>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </div>
  )
}

function Top({ p, s }: { p: P; s: Story }) {
  const { t, money, cat } = useApp()
  const f = useFormats()
  const c = cat.get(s.top!.id)
  const I = c?.icon ? ICONS[c.icon] : undefined
  const k = useWindow(p, 0, 0.3)
  const scale = useTransform(k, [0, 1], [0.5, 1])
  const rotate = useTransform(k, [0, 1], [-12, 0])
  return (
    <div className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
      <motion.div className="grid place-items-center" style={{ scale, rotate, opacity: k, color: c?.color }}>
        {I ? <I size={200} weight="duotone" className="md:size-[280px]" /> : <span className="size-40 rounded-full" style={{ background: c?.color }} />}
      </motion.div>
      <div>
        <Reveal p={p} from={0.2} to={0.35}>
          <p className={kicker}>{t.story.topTitle}</p>
        </Reveal>
        <Reveal p={p} from={0.25} to={0.45}>
          <h2 className={`${fitName(c?.name ?? '?')} mt-3`}>{c?.name ?? '?'}</h2>
        </Reveal>
        <Reveal p={p} from={0.45} to={0.6}>
          <p className={sub}>
            {t.story.topSub(money(s.top!.amount), f.pct.format(s.top!.share), s.top!.count)} {t.story.topMonth(f.month(s.top!.month))}
          </p>
        </Reveal>
      </div>
    </div>
  )
}

function Habits({ p, s }: { p: P; s: Story }) {
  const { t } = useApp()
  const f = useFormats()
  const max = Math.max(1, ...s.weekdays)
  const hmax = s.hours ? Math.max(1, ...s.hours) : 1
  const hsum = s.hours ? Math.max(1, s.hours.reduce((a, b) => a + b, 0)) : 1
  const topHour = s.hours ? s.hours.indexOf(hmax) : 0
  return (
    <div>
      <Reveal p={p} from={0} to={0.15}>
        <h2 className={h2}>{t.story.habitsTitle}</h2>
        {s.topWeekday !== undefined && <p className={sub}>{t.story.weekdayLine(f.weekday(s.topWeekday))}</p>}
      </Reveal>
      <motion.div className="mt-10 grid grid-cols-7 gap-2 md:gap-4" style={{ '--k': p } as CSSProperties}>
        {s.weekdays.map((v, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="flex h-36 w-full items-end md:h-48">
              <div
                className={`w-full origin-bottom ${i === s.topWeekday ? 'bg-expense' : 'bg-current/25'}`}
                style={{ height: `${Math.max(2, (v / max) * 100)}%`, scale: `1 clamp(0, calc((var(--k) - ${0.15 + i * 0.05}) * 5), 1)` }}
              />
            </div>
            <span className="text-[11px] tracking-wide uppercase opacity-70">{f.weekday(i).slice(0, 3)}</span>
          </div>
        ))}
      </motion.div>
      {s.hours && (
        <Reveal p={p} from={0.55} to={0.7} className="mt-10">
          <p className={kicker}>{t.story.hoursSub}</p>
          <p className="mt-2 text-base md:text-lg">{t.story.hoursLine(t.story.hours[topHour], f.pct.format(s.hours[topHour] / hsum))}</p>
          <div className="num mt-4 grid grid-cols-4 gap-2 md:gap-4">
            {s.hours.map((v, i) => (
              <div key={i}>
                <div className="flex h-10 items-end md:h-14">
                  <div className={`w-full ${i === topHour ? 'bg-expense' : 'bg-current/25'}`} style={{ height: `${Math.max(4, (v / hmax) * 100)}%` }} />
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-1 text-[11px]">
                  <span className="truncate opacity-70">{t.story.hours[i]}</span>
                  <span>{f.pct.format(v / hsum)}</span>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      )}
    </div>
  )
}

/** The year as a grid of days, one cell a day, lighting up in order of the calendar. */
function Days({ p, s }: { p: P; s: Story }) {
  const { t, money } = useApp()
  const f = useFormats()
  const cells = useMemo(() => {
    const out: { key: string; week: number; dow: number; v: number }[] = []
    const first = new Date(Date.UTC(s.year, 0, 1))
    const offset = (first.getUTCDay() + 6) % 7
    for (let d = new Date(first), i = 0; d.getUTCFullYear() === s.year; d.setUTCDate(d.getUTCDate() + 1), i++) {
      const key = d.toISOString().slice(0, 10)
      out.push({ key, week: Math.floor((i + offset) / 7), dow: (i + offset) % 7, v: s.days.get(key) ?? 0 })
    }
    return out
  }, [s])
  const weeks = cells[cells.length - 1].week + 1
  const max = Math.max(1, ...cells.map((c) => c.v))
  return (
    <div>
      <Reveal p={p} from={0} to={0.15}>
        <h2 className={h2}>{t.story.daysTitle}</h2>
        <p className={sub}>{t.story.activeDays(s.activeDays)}</p>
      </Reveal>
      <motion.svg viewBox={`0 0 ${weeks * 10} 70`} className="mt-8 w-full" style={{ '--k': p } as CSSProperties} aria-hidden>
        {cells.map((c, i) => {
          const start = 0.1 + (i / cells.length) * 0.55
          return (
            <rect
              key={c.key}
              x={c.week * 10}
              y={c.dow * 10}
              width={8.5}
              height={8.5}
              className={c.v ? 'fill-expense' : 'fill-current'}
              style={{ opacity: `clamp(0, calc((var(--k) - ${start}) * 12), ${c.v ? 0.35 + 0.65 * Math.sqrt(c.v / max) : 0.12})` }}
            />
          )
        })}
      </motion.svg>
      <Reveal p={p} from={0.7} to={0.85} className="mt-8 grid gap-3 text-base md:grid-cols-2 md:text-lg">
        {s.costliestDay && <p>{t.story.costliestDay(f.day(s.costliestDay.date), money(s.costliestDay.amount), s.costliestDay.count)}</p>}
        {s.streak && <p>{t.story.streak(s.streak.days)}</p>}
      </Reveal>
    </div>
  )
}

function Regular({ p, s }: { p: P; s: Story }) {
  const { t, money } = useApp()
  const r = s.regular!
  const lines: [string, string][] = [
    [t.story.receiptTimes(r.count), ''],
    [t.story.receiptTotal, money(r.amount)],
    [t.story.receiptAvg, money(Math.round(r.amount / r.count / 100) * 100)],
  ]
  return (
    <div className="grid items-center gap-10 md:grid-cols-2">
      <Reveal p={p} from={0} to={0.15}>
        <p className={kicker}>{t.story.regularTitle}</p>
        <h2 className={`${big} mt-3 break-words`}>{r.note}</h2>
      </Reveal>
      <div className="num mx-auto w-full max-w-sm bg-zinc-50 px-6 py-5 font-mono text-sm text-zinc-900 shadow-[6px_6px_0_rgb(0_0_0/0.15)]">
        <Reveal p={p} from={0.3} to={0.4} y={8} className="border-b border-dashed border-zinc-400 pb-3 text-center text-xs tracking-[0.2em] uppercase">
          {s.year}
        </Reveal>
        {lines.map(([a, b], i) => (
          <Reveal key={a} p={p} from={0.42 + i * 0.1} to={0.5 + i * 0.1} y={8} className="flex justify-between py-2">
            <span>{a}</span>
            <span>{b}</span>
          </Reveal>
        ))}
        <Reveal p={p} from={0.75} to={0.85} y={8} className="mt-2 border-t border-dashed border-zinc-400 pt-3 text-center text-xs text-zinc-500">
          ★ ★ ★
        </Reveal>
      </div>
    </div>
  )
}

function Subs({ p, s }: { p: P; s: Story }) {
  const { t, money } = useApp()
  const x = s.subs!
  return (
    <div>
      <Reveal p={p} from={0} to={0.15}>
        <p className={kicker}>{t.story.subsTitle}</p>
      </Reveal>
      <Reveal p={p} from={0.05} to={0.25}>
        <p className={`${big} mt-3`}>
          <Count p={p} from={0.1} to={0.5} value={x.yearly} format={money} />
        </p>
      </Reveal>
      <Reveal p={p} from={0.4} to={0.55}>
        <p className={sub}>
          {t.story.subsSub(x.count, money(x.yearly))} {t.story.subsTop(x.priciest.name, money(x.priciest.yearly))}
        </p>
      </Reveal>
    </div>
  )
}

function Abroad({ p, s }: { p: P; s: Story }) {
  const { t, money } = useApp()
  const a = s.abroad!
  return (
    <div>
      <Reveal p={p} from={0} to={0.15}>
        <h2 className={h2}>{t.story.abroadTitle}</h2>
      </Reveal>
      <div className="mt-8 flex flex-wrap gap-3">
        {a.currencies.map((c, i) => (
          <Reveal key={c} p={p} from={0.15 + i * 0.08} to={0.28 + i * 0.08} y={16}>
            <span className="num inline-block border border-current px-5 py-2.5 font-display text-2xl tracking-wide md:text-4xl">{c}</span>
          </Reveal>
        ))}
      </div>
      <Reveal p={p} from={0.5} to={0.65}>
        <p className={sub}>{t.story.abroadSub(a.count, money(a.amount))}</p>
      </Reveal>
    </div>
  )
}

function Tags({ p, s }: { p: P; s: Story }) {
  const { t, money } = useApp()
  return (
    <div>
      <Reveal p={p} from={0} to={0.15}>
        <h2 className={h2}>{t.story.tagsTitle}</h2>
      </Reveal>
      <ul className="mt-8">
        {s.tags.map((x, i) => (
          <Reveal key={x.tag} p={p} from={0.2 + i * 0.15} to={0.35 + i * 0.15}>
            <li className="flex flex-wrap items-baseline justify-between gap-x-6 border-t border-current/20 py-4">
              <span className="flex items-center gap-1 font-display text-[clamp(1.75rem,5vw,3.5rem)] leading-none tracking-[-0.03em] break-all">
                <Hash className="shrink-0 opacity-50" size={28} />
                {x.tag}
              </span>
              <span className="num text-lg opacity-80 md:text-2xl">{money(x.amount)}</span>
            </li>
          </Reveal>
        ))}
      </ul>
    </div>
  )
}

function Goals({ p, s, goals }: { p: P; s: Story; goals: { id: string; name: string; target: number; saved: number }[] }) {
  const { t, money } = useApp()
  const g = s.goals!
  return (
    <div>
      <Reveal p={p} from={0} to={0.15}>
        <h2 className={h2}>{t.story.goalsTitle}</h2>
        <p className={sub}>
          {t.story.goalsSub(money(g.saved), money(g.target))} {t.story.goalsReached(g.reached, g.count)}
        </p>
      </Reveal>
      <motion.ul className="mt-8 grid gap-4" style={{ '--k': p } as CSSProperties}>
        {goals.slice(0, 5).map((x, i) => (
          <li key={x.id} className="num">
            <div className="flex justify-between text-sm">
              <span className="truncate">{x.name}</span>
              <span className="pl-4 opacity-70">
                {money(x.saved)} / {money(x.target)}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full bg-current/15">
              <div
                className={`h-full origin-left ${x.target > 0 && x.saved >= x.target ? 'bg-income' : 'bg-current'}`}
                style={{ width: `${x.target ? Math.min(100, (x.saved / x.target) * 100) : 0}%`, scale: `clamp(0, calc((var(--k) - ${0.25 + i * 0.08}) * 3), 1) 1` }}
              />
            </div>
          </li>
        ))}
      </motion.ul>
    </div>
  )
}

function Versus({ p, s }: { p: P; s: Story }) {
  const { t, money } = useApp()
  const f = useFormats()
  const v = s.vsLast!
  const rows: { label: string; now: number; prev: number; goodUp: boolean }[] = [
    { label: t.story.vsIncome, now: v.income, prev: v.prevIncome, goodUp: true },
    { label: t.story.vsSpent, now: v.spent, prev: v.prevSpent, goodUp: false },
    { label: t.story.vsKept, now: v.kept, prev: v.prevKept, goodUp: true },
  ]
  return (
    <div>
      <Reveal p={p} from={0} to={0.15}>
        <h2 className={h2}>{t.story.vsTitle(s.year - 1)}</h2>
      </Reveal>
      <div className="mt-8 grid gap-6 md:grid-cols-3 md:gap-10">
        {rows.map((r, i) => {
          const delta = r.prev ? r.now / r.prev - 1 : null
          const good = delta === null ? null : delta === 0 ? null : delta > 0 === r.goodUp
          return (
            <Reveal key={r.label} p={p} from={0.15 + i * 0.15} to={0.3 + i * 0.15} className="border-t-2 border-current pt-3">
              <p className={kicker}>{r.label}</p>
              <p className="num mt-2 font-display text-[clamp(1.75rem,3.4vw,3rem)] leading-none tracking-[-0.03em]">
                <Count p={p} from={0.15 + i * 0.15} to={0.5 + i * 0.15} value={r.now} format={money} />
              </p>
              <p className={`num mt-2 text-base ${good === null ? 'opacity-70' : good ? 'text-income' : 'text-expense'}`}>
                {delta === null ? money(r.prev) : f.change.format(delta)} <span className="opacity-60">· {money(r.prev)}</span>
              </p>
            </Reveal>
          )
        })}
      </div>
    </div>
  )
}

function Close({ p, s, onClose }: { p: P; s: Story; onClose: () => void }) {
  const { t, money } = useApp()
  const f = useFormats()
  const cells: [string, string][] = [
    [t.story.earned, money(s.income)],
    [t.story.vsKept, money(s.kept)],
    [t.story.entries, f.int.format(s.txCount)],
    ...(s.best !== undefined ? ([[t.recapBest, f.month(s.best)]] as [string, string][]) : []),
  ]
  return (
    <div className="grid items-center gap-10 md:grid-cols-2">
      <div>
        <Reveal p={p} from={0} to={0.2}>
          <h2 className={h2}>{t.story.closeTitle(s.year)}</h2>
          <p className={sub}>{t.story.closeSub}</p>
        </Reveal>
        <Reveal p={p} from={0.3} to={0.45} className="mt-8">
          <Button onClick={onClose}>
            <ArrowLeft size={16} />
            {t.story.back}
          </Button>
        </Reveal>
      </div>
      <Reveal p={p} from={0.15} to={0.4} className="border-t-2 border-current pt-4">
        <p className="font-display text-5xl tracking-[-0.03em]">{s.year}</p>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5">
          {cells.map(([a, b]) => (
            <div key={a} className="min-w-0">
              <dt className={kicker}>{a}</dt>
              <dd className="num mt-1 truncate font-display text-2xl tracking-[-0.02em]">{b}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </div>
  )
}

/** Desktop: how far through the whole story, as one rule across the top. Its own component, mounted with the scroller. */
function ProgressRule({ scroller }: { scroller: RefObject<HTMLDivElement | null> }) {
  const { scrollYProgress } = useScroll({ container: scroller })
  const overall = useScrollCopy(scrollYProgress)
  return <motion.div className="h-0.5 origin-left bg-accent-strong" style={{ scaleX: overall }} aria-hidden />
}

// --- The page --------------------------------------------------------------

export function YearStory({ year, onClose }: { year: number; onClose: () => void }) {
  const { t, s: settings, cats } = useApp()
  const phone = usePhone()
  const still = !!useReducedMotion()
  const scroller = useRef<HTMLDivElement>(null)
  const sections = useRef<(HTMLElement | null)[]>([])
  const [at, setAt] = useState(0)

  const txs = useLiveQuery(() => db.txs.where('date').between(`${year}-01-01`, `${year}-12-31`, true, true).toArray(), [year])
  const prevTxs = useLiveQuery(() => db.txs.where('date').between(`${year - 1}-01-01`, `${year - 1}-12-31`, true, true).toArray(), [year])
  const subs = useLiveQuery(() => db.subs.toArray(), [])
  const goals = useLiveQuery(() => db.goals.toArray(), [])

  const story = useMemo(
    () => (txs && prevTxs && subs && goals ? yearStory({ txs, prevTxs, subs, goals, cats, year, ratiosAt: (m) => ratiosFor(settings.ratios, settings.ratioHistory, m), fromSavings: savingsIncome(cats) }) : null),
    [txs, prevTxs, subs, goals, cats, year, settings.ratios, settings.ratioHistory],
  )

  useEffect(() => {
    markStorySeen(year)
  }, [year])

  const { cat } = useApp()
  const scenes = useMemo<SceneDef[]>(() => {
    if (!story) return []
    const s = story
    const list: (SceneDef | false)[] = [
      { id: 'cover', ground: 'dark', render: () => <Cover s={s} phone={phone} /> },
      s.income > 0 && { id: 'kept', ground: 'paper', render: (p) => <Kept p={p} s={s} /> },
      { id: 'rhythm', ground: 'paper', render: (p) => <Rhythm p={p} s={s} /> },
      s.best !== undefined && { id: 'best', ground: 'ink', render: (p) => <Best p={p} s={s} /> },
      s.categories.length > 1 && { id: 'categories', ground: 'paper', render: (p) => <Categories p={p} s={s} /> },
      !!s.top && { id: 'top', ground: 'ink', aura: cat.get(s.top.id)?.color, render: (p) => <Top p={p} s={s} /> },
      s.spent > 0 && { id: 'habits', ground: 'paper', render: (p) => <Habits p={p} s={s} /> },
      s.activeDays > 0 && { id: 'days', ground: 'paper', render: (p) => <Days p={p} s={s} /> },
      !!s.regular && { id: 'regular', ground: 'ink', render: (p) => <Regular p={p} s={s} /> },
      !!s.subs && { id: 'subs', ground: 'paper', render: (p) => <Subs p={p} s={s} /> },
      !!s.abroad && { id: 'abroad', ground: 'ink', render: (p) => <Abroad p={p} s={s} /> },
      s.tags.length > 0 && { id: 'tags', ground: 'paper', render: (p) => <Tags p={p} s={s} /> },
      !!s.goals && { id: 'goals', ground: 'paper', render: (p) => <Goals p={p} s={s} goals={goals ?? []} /> },
      !!s.vsLast && { id: 'versus', ground: 'ink', render: (p) => <Versus p={p} s={s} /> },
      { id: 'close', ground: 'paper', render: (p) => <Close p={p} s={s} onClose={onClose} /> },
    ]
    return list.filter((x): x is SceneDef => !!x)
  }, [story, phone, cat, goals, onClose])

  // Which scene the viewport is in, for the segmented bar and stepping.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const on = () => {
      const mid = el.scrollTop + el.clientHeight / 2
      let i = 0
      sections.current.forEach((sec, j) => sec && sec.offsetTop <= mid && (i = j))
      setAt(i)
    }
    on()
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  }, [scenes.length])

  const go = (i: number) => {
    const sec = sections.current[Math.max(0, Math.min(scenes.length - 1, i))]
    const el = scroller.current
    if (!sec || !el) return
    // Desktop: land where the scene has played most of the way, not on its blank first frame.
    const top = phone ? sec.offsetTop : sec.offsetTop + Math.max(0, sec.offsetHeight - el.clientHeight) * 0.7
    el.scrollTo({ top, behavior: still ? 'auto' : 'smooth' })
  }

  useEffect(() => {
    scroller.current?.focus({ preventScroll: true })
  }, [story])

  if (!story) return null

  return (
    <div
      ref={scroller}
      tabIndex={-1}
      role="dialog"
      aria-modal
      aria-label={t.story.open}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
        else if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
          e.preventDefault()
          go(at + 1)
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
          e.preventDefault()
          go(at - 1)
        }
      }}
      className={`fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-panel text-ink outline-none ${phone ? 'snap-y snap-mandatory' : ''}`}
    >
      {/* Top: the progress (one rule on a desktop, one segment a scene on a phone) and the close button. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-10 pt-[env(safe-area-inset-top)]">
        {phone ? (
          <div className="flex gap-1 px-3 pt-3" role="progressbar" aria-valuemin={1} aria-valuemax={scenes.length} aria-valuenow={at + 1} aria-label={t.story.progress(at + 1, scenes.length)}>
            {scenes.map((sc, i) => (
              <span key={sc.id} className={`h-0.5 flex-1 transition-colors duration-300 ${SEG[scenes[at].ground]} ${i <= at ? 'bg-current' : 'bg-current/25'}`} />
            ))}
          </div>
        ) : (
          <ProgressRule scroller={scroller} />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t.story.close}
          className={`pointer-events-auto absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-3 grid size-11 place-items-center transition-colors md:top-4 md:right-4 ${CHROME[scenes[at].ground]}`}
        >
          <X size={20} />
        </button>
      </div>

      {/* Phone: tap the left edge to step back, anywhere else on the right to step on. Scrolling still works; the
          last scene keeps its button free. */}
      {phone && at < scenes.length - 1 && (
        <div className="pointer-events-none fixed inset-y-24 inset-x-0 z-[5] grid grid-cols-[1fr_2fr]">
          <button type="button" className="pointer-events-auto opacity-0" aria-label={t.story.prev} onClick={() => go(at - 1)} />
          <button type="button" className="pointer-events-auto opacity-0" aria-label={t.story.next} onClick={() => go(at + 1)} />
        </div>
      )}

      {scenes.map((def, i) => (
          <Scene key={def.id} def={def} index={i} scroller={scroller} phone={phone} still={still} setRef={(j, el) => (sections.current[j] = el)} />
      ))}
    </div>
  )
}
