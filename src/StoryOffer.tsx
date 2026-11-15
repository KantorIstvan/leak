import { useEffect, useRef } from 'react'
import { X } from '@phosphor-icons/react'
import { MotionConfig, motion, type Transition, type Variants } from 'motion/react'
import { Button, useApp } from './ui'

const SPRING: Transition = { type: 'spring', bounce: 0.25, visualDuration: 0.45 }

// The cover builds once: the year's digits rise one after another, then a rule per month grows from the baseline.
const cover: Variants = { shown: { transition: { delayChildren: 0.08, staggerChildren: 0.06 } } }
const digit: Variants = {
  hidden: { y: '0.45em', opacity: 0, filter: 'blur(6px)' },
  shown: { y: 0, opacity: 1, filter: 'blur(0px)', transition: SPRING },
}
const months: Variants = { shown: { transition: { delayChildren: 0.3, staggerChildren: 0.035 } } }
const month: Variants = { hidden: { scaleY: 0 }, shown: { scaleY: 1, transition: SPRING } }

/**
 * The year-end offer of the year story (from 20 December, through January): a modal with the year set like the
 * story's cover. Escape, the backdrop, the close button and Later all count as "later"; the story stays on the
 * Year page either way, so it is offered once per year and device.
 */
export function StoryOffer({ year, onLater, onOpen }: { year: number; onLater: () => void; onOpen: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const down = useRef<EventTarget | null>(null)
  const { t } = useApp()
  // No close() on unmount: it fires `close`, which reads as Later. Under StrictMode's mount, unmount, mount that
  // dismissed the offer before anyone saw it. Removing the element ends the modal by itself.
  useEffect(() => {
    const d = ref.current!
    if (!d.open) d.showModal()
    d.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-labelledby="story-offer-title"
      className="sheet sm:max-w-md"
      onClose={(e) => e.target === e.currentTarget && onLater()}
      onPointerDown={(e) => (down.current = e.target)}
      onClick={(e) => e.target === ref.current && down.current === ref.current && onLater()}
    >
      <MotionConfig reducedMotion="user">
        {/* The cover: ink ground, the year huge in the display serif, a rule per month along the bottom. */}
        <motion.div initial="hidden" animate="shown" className="relative overflow-hidden bg-ink px-6 pt-6 pb-5 text-panel">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-medium tracking-[0.14em] uppercase opacity-70">{t.story.coverKicker}</p>
            <button
              type="button"
              aria-label={t.story.later}
              onClick={onLater}
              className="-mt-2 -mr-2 grid size-10 shrink-0 place-items-center opacity-70 transition hover:bg-panel/10 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-panel"
            >
              <X size={18} />
            </button>
          </div>
          <motion.p
            variants={cover}
            aria-hidden
            className="mt-6 flex font-display text-[clamp(5rem,22vw,8.5rem)] leading-[0.8] font-medium tracking-[-0.04em] tabular-nums"
          >
            {[...String(year)].map((d, i) => (
              <motion.span key={i} variants={digit} className="inline-block">
                {d}
              </motion.span>
            ))}
          </motion.p>
          <motion.div variants={months} aria-hidden className="mt-6 grid grid-cols-12 items-end gap-1">
            {Array.from({ length: 12 }, (_, i) => (
              <motion.span key={i} variants={month} className="block h-3 origin-bottom bg-panel/50" />
            ))}
          </motion.div>
        </motion.div>
      </MotionConfig>
      <div className="grid gap-5 px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="grid gap-1.5">
          <h2 id="story-offer-title" className="font-display text-2xl leading-tight tracking-[-0.01em]">
            {t.story.ready(year)}
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t.story.readyHint}</p>
          <p className="text-sm text-zinc-500">{t.story.readyLater}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onLater}>
            {t.story.later}
          </Button>
          <Button variant="primary" data-autofocus onClick={onOpen}>
            {t.story.open}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
