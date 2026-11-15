// Help: a step-by-step guide with pictures of the real app, the questions people ask, and one search across both.
// The words live in help.ts; this file draws them, and draws the pictures the screenshots cannot show (the entry
// form, the jars with the user's own split, the score bands, the user's own shortcuts).
//
// Motion: each picture builds once when it comes on screen (the numbered markers in order, the jars filling, the
// score counting up), the topic filter slides, answers open and close. Steps and rows never fade in on scroll, and
// under reduced motion everything is simply there.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, CaretDown, GithubLogo, Lightbulb, Plus, X } from '@phosphor-icons/react'
import {
  animate,
  AnimatePresence,
  MotionConfig,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type Transition,
  type Variants,
} from 'motion/react'
import { BUCKETS, type Bucket, type Category, type Kind, type Lang } from '../db'
import { helpDicts, highlights, searchHelp, snippet, stepText, termsOf, TOPICS, type Faq, type HelpDict, type HelpPage as Dest, type Step, type Topic } from '../help'
import { keymap } from '../keys'
import { today } from '../lib'
import { Keys } from '../Commands'
import { BUCKET_BG, Button, Card, PageHeader, SearchInput, useApp, useMonthlyIncome } from '../ui'
import { TxForm } from '../TxSheet'
import { ScoreHead, ScoreLines, type ScoreLine } from './Month'
import shotMeta from '../assets/help/shots.json'
import { ExternalLink } from './Settings'

const SPRING: Transition = { type: 'spring', bounce: 0.25, visualDuration: 0.4 }
const POP: Transition = { type: 'spring', bounce: 0.45, visualDuration: 0.35 }
// Heights never bounce: an overshooting answer would shake the rows below it.
const OPEN: Transition = { type: 'spring', bounce: 0, visualDuration: 0.3 }
const EASE_OUT = [0.16, 1, 0.3, 1] as const

/**
 * A picture's build: plays once, when a fifth of it is on screen (a tall form never shows half of itself on a phone). Under reduced motion it starts built: MotionConfig's
 * reducedMotion only drops transforms, and the staggered fades would still keep markers hidden for a moment.
 */
function useBuild() {
  const still = useReducedMotion()
  return still ? ({ initial: 'shown', animate: 'shown' } as const) : ({ initial: 'hidden', whileInView: 'shown', viewport: { once: true, amount: 0.2 } } as const)
}
const stagger = (each: number, after = 0.15): Variants => ({ hidden: {}, shown: { transition: { delayChildren: after, staggerChildren: each } } })
const pop: Variants = { hidden: { scale: 0, opacity: 0 }, shown: { scale: 1, opacity: 1, transition: POP } }
const growX: Variants = { hidden: { scaleX: 0 }, shown: { scaleX: 1, transition: SPRING } }
const growY: Variants = { hidden: { scaleY: 0 }, shown: { scaleY: 1, transition: SPRING } }

// --- Search ---------------------------------------------------------------

/** `text` with every term marked. */
function Hit({ text, terms }: { text: string; terms: string[] }) {
  const out: ReactNode[] = []
  let pos = 0
  for (const [from, to] of highlights(text, terms)) {
    out.push(text.slice(pos, from), <mark key={from} className="bg-wants/30 text-inherit dark:bg-wants/35">{text.slice(from, to)}</mark>)
    pos = to
  }
  out.push(text.slice(pos))
  return <>{out}</>
}

// --- Pictures -------------------------------------------------------------

// The screenshots come from `npm run help-shots` (scripts/help-shots): the real pages filled with a sample account,
// in each language and theme. shots.json holds each picture's size and its markers, measured on that language's
// layout (the Hungarian labels are longer), in percent of the picture.
const SHOTS = import.meta.glob<string>('../assets/help/*.webp', { eager: true, import: 'default' })
const shot = (name: string, lang: Lang, theme: 'light' | 'dark') => SHOTS[`../assets/help/${name}-${lang}-${theme}.webp`]
// JSON arrays type as number[]: the generator always writes pairs.
const META = shotMeta as unknown as Record<string, Record<Lang, { size: [number, number]; marks: [number, number, Side][] }>>

/** A marker: a red dot with its number. The same mark leads its caption in the list; the one in use grows. */
function Mark({ n, on }: { n: number; on?: boolean }) {
  return (
    <motion.span
      aria-hidden
      animate={{ scale: on ? 1.25 : 1 }}
      transition={SPRING}
      className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-strong text-[11px] font-semibold text-white tabular-nums ring-2 ring-panel sm:size-6 sm:text-xs"
    >
      {n}
    </motion.span>
  )
}

/** A marker placed on a picture. It pops in with its picture's build, in number order. */
type Side = 'right' | 'left' | 'top' | 'corner'
// Where a marker goes against its anchor (a point on the edge of what it numbers), 6px clear of it. These use the
// CSS translate property, so they add to the scale motion animates on transform instead of fighting it.
const SIDE: Record<Side, string> = {
  right: 'ml-1.5 -translate-y-1/2',
  left: '-ml-1.5 -translate-x-full -translate-y-1/2',
  top: '-mt-1.5 -translate-x-1/2 -translate-y-full',
  corner: '-translate-x-1/2 -translate-y-1/2',
}

/** A marker on a picture, against its anchor. It pops in with its picture's build, in number order. */
function Pin({ n, on, at: [left, top, side] }: { n: number; on: boolean; at: [number | string, number | string, Side] }) {
  return (
    <motion.span variants={pop} className={`absolute ${SIDE[side]}`} style={{ left, top }}>
      <Mark n={n} on={on} />
    </motion.span>
  )
}

/** A screenshot of the real app in the current language and theme, with its markers on top. */
function Shot({ name, alt, active }: { name: string; alt: string; active: number | null }) {
  const { s } = useApp()
  const { size: [w, h], marks } = META[name][s.lang]
  const build = useBuild()
  return (
    <motion.div {...build} variants={stagger(0.09)} className="relative">
      <img src={shot(name, s.lang, 'light')} width={w} height={h} alt={alt} loading="lazy" decoding="async" className="block h-auto w-full dark:hidden" />
      <img src={shot(name, s.lang, 'dark')} width={w} height={h} alt={alt} loading="lazy" decoding="async" className="hidden h-auto w-full dark:block" />
      {marks.map(([x, y, side], i) => (
        <Pin key={i} n={i + 1} on={active === i} at={[`${x}%`, `${y}%`, side]} />
      ))}
    </motion.div>
  )
}

/** The three jars, filled from the user's own split and an income near their own. */
function JarsPicture() {
  const { s, t, money } = useApp()
  const h = helpDicts[s.lang]
  const avg = useMonthlyIncome()
  // A round figure near what they earn; without income yet, a plain one in their currency.
  const income = avg > 0 ? Number(avg.toPrecision(2)) : s.currency === 'HUF' ? 400_000_00 : 3_000_00
  const build = useBuild()
  return (
    // The split bar draws left to right, then the jars fill one after another.
    <motion.div {...build} variants={stagger(0.12, 0.1)} className="grid gap-5 p-5 sm:p-7">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{h.jarsSay(money(income))}</p>
      <div className="flex h-3 w-full">
        {BUCKETS.map((b) => (
          <motion.span key={b} variants={growX} className={`${BUCKET_BG[b]} block h-full origin-left`} style={{ width: `${s.ratios[b]}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {BUCKETS.map((b) => (
          <Jar key={b} bucket={b} share={s.ratios[b]} amount={money(Math.round((income * s.ratios[b]) / 100))} label={t.bucket[b]} what={h.jarsWhat[b]} />
        ))}
      </div>
    </motion.div>
  )
}

function Jar({ bucket, share, amount, label, what }: { bucket: Bucket; share: number; amount: string; label: string; what: string }) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      {/* The jar: an open-topped outline, filled to exactly its share: a 50% jar is half full. */}
      <div className="relative mx-auto h-28 w-full max-w-24 border-x-2 border-b-2 border-ink sm:h-32">
        <motion.span variants={growY} className={`${BUCKET_BG[bucket]} absolute inset-x-0 bottom-0 origin-bottom`} style={{ height: `${share}%` }} />
      </div>
      <div className="min-w-0 text-center">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="num font-display text-xl leading-tight tracking-[-0.01em] sm:text-2xl">{share}%</p>
        <p className="num truncate text-xs text-zinc-500 dark:text-zinc-400">{amount}</p>
        <p className="mt-1 text-xs leading-snug text-zinc-500 max-sm:hidden dark:text-zinc-400">{what}</p>
      </div>
    </div>
  )
}

// Steps 2 and 3 number different fields, top to bottom, so the pop-ins run 1, 2, 3.
const FIELDS: Record<Kind, string[]> = { income: ['button', 'kind', 'amount', 'category', 'save'], expense: ['kind', 'amount', 'category', 'bucket'] }
const noop = () => {}

/** The category an example entry goes in: the built-in Job or Food (by icon, so a renamed one still counts), else any. */
const exampleCategory = (cats: Category[], kind: Kind) =>
  cats.find((c) => c.kind === kind && c.icon === (kind === 'income' ? 'Briefcase' : 'ForkKnife')) ?? cats.find((c) => c.kind === kind)

/**
 * The real entry form, filled in with an example and out of reach (inert), in a frame like the window it opens in:
 * what steps 2 and 3 point at, in the user's own language, currency and categories. Each marker sits right after
 * the field or button it numbers, measured from the form as it lays out.
 */
function FormPicture({ kind, active }: { kind: Kind; active: number | null }) {
  const { s, t, cats } = useApp()
  const h = helpDicts[s.lang]
  const income = kind === 'income'
  const c = exampleCategory(cats, kind)
  const huf = s.currency === 'HUF'
  const draft = useMemo(
    () => ({ kind, amount: income ? (huf ? 612_000_00 : 3_400_00) : huf ? 11_480_00 : 42_80, categoryId: c?.id ?? '', bucket: income ? null : (c?.bucket ?? 'needs'), note: income ? h.form.salary : h.form.groceries }),
    [kind, income, huf, c, h],
  )
  const fields = FIELDS[kind]
  // The form renders once per example: hovering a caption re-renders the picture, not the form. A new example (another
  // language, currency or category) starts a new form, as TxForm reads its draft only when it mounts.
  const form = useMemo(
    () => <TxForm key={`${draft.kind}|${draft.amount}|${draft.categoryId}|${draft.note}`} draft={draft} defaultDate={today()} onDone={noop} />,
    [draft],
  )
  const ref = useRef<HTMLDivElement>(null)
  const [anchors, setAnchors] = useState<([number, number, Side] | null)[]>([])
  useLayoutEffect(() => {
    const el = ref.current!
    const measure = () => {
      const o = el.getBoundingClientRect()
      // A control is pointed at by its box; a field by the words of its label, so the marker reads as that label's.
      const control = (e: Element | null | undefined, side: Side): [number, number, Side] | null => {
        if (!e) return null
        const r = e.getBoundingClientRect()
        return side === 'corner' ? [r.right - o.left, r.top - o.top, side] : [r.right - o.left, r.top - o.top + r.height / 2, side]
      }
      const words = (e: Element | null | undefined): [number, number, Side] | null => {
        if (!e) return null
        const range = document.createRange()
        range.selectNodeContents(e)
        const r = range.getBoundingClientRect()
        return [r.right - o.left, r.top - o.top + r.height / 2, 'right']
      }
      const legend = [...el.querySelectorAll('legend')].find((l) => l.textContent === t.category)
      const at: Record<string, [number, number, Side] | null> = {
        button: control(el.querySelector('[data-pic="add"] button'), 'right'),
        kind: control(el.querySelector('[role="radiogroup"]'), 'right'),
        amount: words(el.querySelector('input[inputmode="decimal"]')?.closest('label')?.firstElementChild),
        category: words(legend),
        bucket: words([...el.querySelectorAll('button')].find((b) => b.textContent === t.change)),
        // Save ends the row at the form's right edge: a badge on its corner.
        save: control(el.querySelector('button[type="submit"]'), 'corner'),
      }
      const next = fields.map((f) => at[f])
      setAnchors((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }
    measure()
    // Fonts and the category chips settle after the first layout.
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [fields, t, form])
  const build = useBuild()
  return (
    <motion.div ref={ref} {...build} variants={stagger(0.09)} className="relative px-5 py-6 sm:px-7" aria-hidden inert>
      {income && (
        <div data-pic="add" className="mb-6 w-fit">
          <Button variant="primary" tabIndex={-1}>
            <Plus size={16} weight="bold" />
            {t.addTx}
          </Button>
        </div>
      )}
      {/* The window the form opens in: a bordered box with its title, as on a computer. */}
      <div className="border-2 border-ink bg-panel">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <span className="font-display text-2xl leading-tight tracking-[-0.01em]">{t.addTx}</span>
          <X size={18} className="text-zinc-600 dark:text-zinc-400" />
        </div>
        <div className="px-5 pb-5">
          {form}
        </div>
      </div>
      {anchors.map((a, i) => a && <Pin key={i} n={i + 1} on={active === i} at={a} />)}
    </motion.div>
  )
}

const SCORE = 82

/**
 * A finished month's score card, built from the Month page's own parts (ScoreHead, ScoreLines). On screen the
 * score counts up, so its colour and tier change on the way, and the needle walks along the scale.
 */
function ScorePicture() {
  const { t } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  const seen = useInView(ref, { once: true, amount: 0.6 })
  const still = useReducedMotion()
  const score = useMotionValue(0)
  const [shown, setShown] = useState(0)
  useMotionValueEvent(score, 'change', (n) => setShown(Math.round(n)))
  useEffect(() => {
    if (still) return void score.jump(SCORE)
    if (!seen) return
    const run = animate(score, SCORE, { duration: 1.6, ease: EASE_OUT })
    return () => run.stop()
  }, [seen, still, score])
  const pct = new Intl.NumberFormat(t.locale, { style: 'percent', maximumFractionDigits: 0 })
  const lines: ScoreLine[] = [
    { icon: 'ok', text: t.scoreInvested(pct.format(0.2), '20%') },
    { icon: 'ok', text: t.scoreSaved(pct.format(0.25)) },
  ]
  return (
    <div ref={ref} className="px-5 pt-3 sm:px-7" aria-hidden inert>
      <Card title={t.score}>
        <ScoreHead score={shown} />
        <ScoreLines lines={lines} />
        <details className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          <summary className="font-medium text-zinc-700 dark:text-zinc-300">{t.scoreHow}</summary>
        </details>
      </Card>
    </div>
  )
}

/** The shortcuts a beginner needs, with the keys this user has set. */
function KeysPicture() {
  const { s } = useApp()
  const h = helpDicts[s.lang]
  const map = keymap(s.shortcuts)
  const rows: [string, string[]][] = [
    [h.keys.palette, map.palette],
    [h.keys.add, map.add],
    [h.keys.prevNext, [...map.prev.slice(0, 1), ...map.next.slice(0, 1)]],
    [h.keys.today, map.today],
    [h.keys.goMonth, map.goMonth],
    [h.keys.help, map.help],
  ]
  return (
    <ul className="grid p-5 sm:p-7">
      {rows
        .filter(([, keys]) => keys.length)
        .map(([what, keys]) => (
          <li key={what} className="flex min-h-12 items-center justify-between gap-4 border-b border-line last:border-0">
            <span className="text-sm">{what}</span>
            <span className="flex gap-2">
              {keys.map((k) => (
                <Keys key={k} binding={k} className="[&_kbd]:h-7 [&_kbd]:min-w-7 [&_kbd]:px-1.5 [&_kbd]:text-[13px]" />
              ))}
            </span>
          </li>
        ))}
    </ul>
  )
}

function Picture({ step, active }: { step: Step; active: number | null }) {
  const alt = step.title
  const pic: Record<string, ReactNode> = {
    idea: <JarsPicture />,
    income: <FormPicture kind="income" active={active} />,
    expense: <FormPicture kind="expense" active={active} />,
    month: <Shot name="month-top" alt={alt} active={active} />,
    jars: <Shot name="month-split" alt={alt} active={active} />,
    score: <ScorePicture />,
    subs: <Shot name="subs" alt={alt} active={active} />,
    goals: <Shot name="goals" alt={alt} active={active} />,
    year: <Shot name="year" alt={alt} active={active} />,
    categories: <Shot name="categories" alt={alt} active={active} />,
    fix: <Shot name="month-txs" alt={alt} active={active} />,
    keys: <KeysPicture />,
    yours: <Shot name="split" alt={alt} active={active} />,
  }
  // Screenshots fill the frame edge to edge; drawn pictures sit on the panel inside it.
  return <figure className="min-w-0 self-start bg-panel ring-1 ring-line md:sticky md:top-4">{pic[step.id]}</figure>
}

// --- The page -------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

export function HelpPage({ go, onAdd }: { go: (p: Dest) => void; onAdd: () => void }) {
  const { s } = useApp()
  const h = helpDicts[s.lang]
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState<Topic | null>(null)
  const goTo = useRef<string | null>(null)
  const terms = useMemo(() => termsOf(query), [query])
  const searching = terms.length > 0
  const found = useMemo(() => (searching ? searchHelp(h, terms) : null), [h, terms, searching])

  // "Read this step" clears the search, then scrolls once the guide is back.
  const scroll = (id: string) =>
    document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  useEffect(() => {
    if (!goTo.current || searching) return
    scroll(goTo.current)
    goTo.current = null
  }, [searching])
  const jump = (id: string) => {
    if (!searching) return scroll(id)
    goTo.current = id
    setQuery('')
  }
  const act = (dest: Step['go']) => (dest === 'add' ? onAdd() : dest && go(dest))

  return (
    <MotionConfig reducedMotion="user">
      <PageHeader title={h.title} />
      <div className="grid gap-5 pb-8 md:pb-12">
        <p className="max-w-xl text-base text-zinc-600 md:text-lg dark:text-zinc-400">{h.lead}</p>
        <div className="max-w-2xl">
          <SearchInput value={query} onChange={setQuery} placeholder={h.search} className="h-12 text-base" />
          <p aria-live="polite" className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {found ? h.results(found.steps.length + found.faqs.length) : h.searchHint}
          </p>
        </div>
      </div>

      {/* Swapping guide and results fades the new one in. No exit: the guide must be back at once for "Read this step". */}
      <motion.div key={found ? 'results' : 'guide'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
        {found ? <Results h={h} found={found} terms={terms} query={query} jump={jump} /> : <Guide h={h} topic={topic} setTopic={setTopic} jump={jump} act={act} />}
      </motion.div>

      <footer className="mt-12 mb-8 grid gap-3 border-t-2 border-ink pt-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <h2 className="font-display text-2xl leading-tight">{h.stuck}</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{h.stuckHint}</p>
        </div>
        <ExternalLink href="https://github.com/KantorIstvan/leak/issues">
          <GithubLogo size={16} weight="bold" aria-hidden />
          {h.report}
        </ExternalLink>
      </footer>
    </MotionConfig>
  )
}

function Guide({ h, topic, setTopic, jump, act }: { h: HelpDict; topic: Topic | null; setTopic: (t: Topic | null) => void; jump: (id: string) => void; act: (d: Step['go']) => void }) {
  const faqs = topic ? h.faqs.filter((f) => f.topic === topic) : h.faqs
  return (
    <>
      <section aria-labelledby="guide" className="border-t-2 border-ink pt-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <h2 id="guide" className="font-display text-3xl leading-tight tracking-[-0.01em] md:text-4xl">
            {h.guide}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{h.guideHint(h.steps.length)}</p>
        </div>
        {/* The contents: every step, to jump straight to the one you need. */}
        <ol className="mt-6 grid border-t border-line sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-3">
          {h.steps.map((st, i) => (
            <li key={st.id} className="border-b border-line">
              <button type="button" onClick={() => jump(st.id)} className="group flex min-h-12 w-full items-center gap-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-accent">
                <span className="num w-6 shrink-0 text-zinc-500 dark:text-zinc-400">{pad(i + 1)}</span>
                <span className="flex-1 underline-offset-4 group-hover:underline">{st.title}</span>
                <ArrowRight size={14} className="shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-900 dark:group-hover:text-zinc-100" />
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-4">
          {h.steps.map((st, i) => (
            <StepView key={st.id} step={st} i={i} h={h} onGo={act} />
          ))}
        </div>
      </section>

      <section aria-labelledby="faq" className="mt-12 border-t-2 border-ink pt-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <h2 id="faq" className="font-display text-3xl leading-tight tracking-[-0.01em] md:text-4xl">
            {h.faq}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{h.faqHint(h.faqs.length)}</p>
        </div>
        <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 py-1 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label={h.faq}>
          <Chip on={!topic} onClick={() => setTopic(null)}>
            {h.allTopics}
          </Chip>
          {TOPICS.map((tp) => (
            <Chip key={tp} on={topic === tp} onClick={() => setTopic(topic === tp ? null : tp)}>
              {h.topics[tp]}
            </Chip>
          ))}
        </div>
        {/* A new topic's questions slide up into place; the old ones leave quickly. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={topic ?? 'all'}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            <FaqList faqs={faqs} terms={[]} grouped={!topic} h={h} />
          </motion.div>
        </AnimatePresence>
      </section>
    </>
  )
}

/** A topic filter. The ink behind the chosen one slides over from the last one. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(e) => {
        onClick()
        // A phone scrolls the row sideways: bring the chosen one fully into view.
        e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest' })
      }}
      className={`relative isolate flex h-9 shrink-0 items-center px-3 text-sm font-medium whitespace-nowrap ring-1 ring-inset transition-colors active:scale-95 focus-visible:outline-2 focus-visible:outline-accent ${
        on ? 'text-accent-fg ring-accent' : 'text-zinc-800 ring-ink/30 hover:bg-ink/5 hover:ring-ink dark:text-zinc-200'
      }`}
    >
      {on && <motion.span layoutId="help-topic" transition={SPRING} className="absolute inset-0 -z-10 bg-accent" />}
      {children}
    </button>
  )
}

function StepView({ step, i, h, onGo }: { step: Step; i: number; h: HelpDict; onGo: (d: Step['go']) => void }) {
  // The caption under the pointer lights up its marker on the picture.
  const [active, setActive] = useState<number | null>(null)
  return (
    <article id={`step-${step.id}`} className="grid scroll-mt-20 gap-6 border-b border-line py-10 last:border-0 md:scroll-mt-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12 md:py-14">
      <div className="min-w-0">
        <p className="flex items-baseline gap-3">
          <span className="num font-display text-5xl leading-none tracking-[-0.03em] text-zinc-400 md:text-6xl dark:text-zinc-500">{pad(i + 1)}</span>
          <span className="text-[11px] font-medium tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400">{h.step(i + 1)}</span>
        </p>
        <h3 className="mt-4 font-display text-[1.75rem] leading-tight tracking-[-0.015em] md:text-[2rem]">{step.title}</h3>
        <p className="mt-3 text-base leading-relaxed text-zinc-800 md:text-[17px] dark:text-zinc-200">{step.lead}</p>
        {step.points && (
          <ol className="mt-5 grid gap-1">
            {step.points.map((p, n) => (
              <li
                key={n}
                onPointerEnter={() => setActive(n)}
                onPointerLeave={() => setActive(null)}
                className={`-mx-2 flex gap-3 px-2 py-1.5 text-[15px] leading-relaxed transition-colors ${active === n ? 'bg-ink/5' : ''}`}
              >
                <span className="mt-0.5">
                  <Mark n={n + 1} on={active === n} />
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        )}
        {step.body.map((p, n) => (
          <p key={n} className="mt-4 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
            {p}
          </p>
        ))}
        {step.tip && (
          <p className="mt-5 flex gap-3 border-l-2 border-ink py-1 pl-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            <Lightbulb size={18} weight="fill" className="mt-px shrink-0 text-wants" aria-hidden />
            <span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{h.tipLabel}: </span>
              {step.tip}
            </span>
          </p>
        )}
        {step.go && (
          <Button variant="secondary" className="group mt-6" onClick={() => onGo(step.go)}>
            {h.open[step.go]}
            <ArrowRight size={14} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
          </Button>
        )}
      </div>
      <Picture step={step} active={active} />
    </article>
  )
}

/** The questions, closed; while searching, open. Each one can still be opened or closed by hand. */
function FaqList({ faqs, terms, grouped, h }: { faqs: Faq[]; terms: string[]; grouped: boolean; h: HelpDict }) {
  const searching = terms.length > 0
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set())
  const flip = (q: string) =>
    setFlipped((prev) => {
      const next = new Set(prev)
      if (!next.delete(q)) next.add(q)
      return next
    })
  return (
    <div className="mt-4">
      {faqs.map((f, i) => (
        <div key={f.q}>
          {grouped && f.topic !== faqs[i - 1]?.topic && (
            <h3 className={`mb-1 text-[11px] font-medium tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400 ${i ? 'mt-8' : 'mt-2'}`}>{h.topics[f.topic]}</h3>
          )}
          <FaqItem f={f} terms={terms} open={searching !== flipped.has(f.q)} onToggle={() => flip(f.q)} />
        </div>
      ))}
    </div>
  )
}

function FaqItem({ f, terms, open, onToggle }: { f: Faq; terms: string[]; open: boolean; onToggle: () => void }) {
  const id = useId()
  return (
    <div className="border-b border-line">
      <button
        type="button"
        id={`${id}q`}
        aria-expanded={open}
        aria-controls={open ? `${id}a` : undefined}
        onClick={onToggle}
        className="group flex min-h-14 w-full cursor-pointer items-center gap-4 py-3 text-left text-[15px] font-medium transition-colors hover:text-zinc-600 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:text-base dark:hover:text-zinc-300"
      >
        <span className="flex-1">
          <Hit text={f.q} terms={terms} />
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={SPRING} className="grid shrink-0 place-items-center text-zinc-500" aria-hidden>
          <CaretDown size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`${id}a`}
            role="region"
            aria-labelledby={`${id}q`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: OPEN, opacity: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            <div className="grid max-w-3xl gap-3 pb-5 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
              {f.a.split('\n\n').map((p, n) => (
                <p key={n}>
                  <Hit text={p} terms={terms} />
                </p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Results({ h, found, terms, query, jump }: { h: HelpDict; found: ReturnType<typeof searchHelp>; terms: string[]; query: string; jump: (id: string) => void }) {
  if (!found.steps.length && !found.faqs.length)
    return (
      <div className="border-t-2 border-ink pt-6">
        <p className="font-display text-2xl leading-tight">{h.nothing(query.trim())}</p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{h.nothingHint}</p>
      </div>
    )
  return (
    <div className="grid gap-12">
      {found.steps.length > 0 && (
        <section className="border-t-2 border-ink pt-5">
          <h2 className="font-display text-2xl leading-tight">{h.inGuide}</h2>
          <ul className="mt-4">
            {found.steps.map(({ st, i }) => (
              <li key={st.id} className="border-b border-line">
                <button
                  type="button"
                  onClick={() => jump(st.id)}
                  className="group grid w-full gap-1 py-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:grid-cols-[3rem_1fr_auto] sm:items-baseline sm:gap-4"
                >
                  <span className="num font-display text-2xl leading-none text-zinc-400 dark:text-zinc-500">{pad(i + 1)}</span>
                  <span className="min-w-0">
                    <span className="block font-medium underline-offset-4 group-hover:underline">
                      <Hit text={st.title} terms={terms} />
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      <Hit text={snippet(stepText(st), terms)} terms={terms} />
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-medium tracking-[0.08em] uppercase">
                    {h.readStep}
                    <ArrowRight size={14} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {found.faqs.length > 0 && (
        <section className="border-t-2 border-ink pt-5">
          <h2 className="font-display text-2xl leading-tight">{h.inFaq}</h2>
          {/* A new query starts with every match open again. */}
          <FaqList key={terms.join(' ')} faqs={found.faqs} terms={terms} grouped={false} h={h} />
        </section>
      )}
    </div>
  )
}

