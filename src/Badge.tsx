/**
 * A status chip that moves between idle, busy, done and failed in one place: its width follows the label (measured with
 * resize(), as the sign-in form's fields are), the icon pops and draws itself in, the label blurs across, and a failure
 * shakes. After Motion's Multi-state Badge example (motion.dev/examples/react-multi-state-badge); its animation code
 * is Motion+ only, so this is our own take on the same idea, in the app's square ink look.
 */
import { AnimatePresence, MotionConfig, motion, resize, useAnimate, useTime, useTransform, type Transition } from 'motion/react'
import { useCallback, useEffect, useState, type ReactElement } from 'react'

export type BadgeState = 'idle' | 'busy' | 'done' | 'error'

const SPRING: Transition = { type: 'spring', bounce: 0.25, visualDuration: 0.35 }
const ICON = {
  initial: { opacity: 0, scale: 0.4, filter: 'blur(4px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 0.4, filter: 'blur(4px)' },
}
const LABEL = {
  initial: { opacity: 0, y: 8, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -8, filter: 'blur(6px)' },
}
const TONE: Record<BadgeState, string> = {
  idle: 'text-zinc-700 ring-ink/30 dark:text-zinc-300',
  busy: 'text-zinc-700 ring-ink/30 dark:text-zinc-300',
  done: 'text-income ring-income/40 bg-income/5 dark:text-emerald-300 dark:ring-emerald-300/40 dark:bg-emerald-300/5',
  error: 'text-rose-700 ring-rose-700/40 bg-rose-700/5 dark:text-rose-400 dark:ring-rose-400/40 dark:bg-rose-400/5',
}

/** A quarter-open ring turning on Motion's clock, so it keeps one speed whatever React renders meanwhile. */
function Spin() {
  const time = useTime()
  const rotate = useTransform(time, [0, 800], [0, 360], { clamp: false })
  return (
    <motion.svg viewBox="0 0 16 16" className="size-full" style={{ rotate }}>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={2} />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </motion.svg>
  )
}

/** Strokes that draw themselves in, a little after the icon has popped. */
function Drawn({ paths }: { paths: string[] }) {
  return (
    <svg viewBox="0 0 16 16" className="size-full" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => (
        <motion.path key={d} d={d} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.1 + i * 0.08, ease: 'easeOut' }} />
      ))}
    </svg>
  )
}

const ICONS: Record<Exclude<BadgeState, 'idle'>, () => ReactElement> = {
  busy: () => <Spin />,
  done: () => <Drawn paths={['M3.5 8.5 6.5 11.5 12.5 4.5']} />,
  error: () => <Drawn paths={['M4.5 4.5 11.5 11.5', 'M11.5 4.5 4.5 11.5']} />,
}

/** `live`: announce changes to screen readers; off for a status that changes by itself (sync on every window focus). */
export function StatusBadge({ state, label, live = true, className = '' }: { state: BadgeState; label: string; live?: boolean; className?: string }) {
  const [width, setWidth] = useState<number | 'auto'>('auto')
  const measure = useCallback((el: HTMLSpanElement | null) => (el ? resize(el, (_, size) => setWidth(size.width)) : undefined), [])
  const [scope, animate] = useAnimate()
  // A failure shakes the chip once, as it lands.
  useEffect(() => {
    if (state === 'error' && scope.current) void animate(scope.current, { x: [0, -6, 6, -4, 4, -2, 0] }, { duration: 0.45, ease: 'easeOut', delay: 0.15 })
  }, [state, animate, scope])
  const Icon = state === 'idle' ? null : ICONS[state]

  return (
    <MotionConfig transition={SPRING} reducedMotion="user">
      <motion.span
        ref={scope}
        role={live ? 'status' : undefined}
        aria-live={live ? 'polite' : undefined}
        initial={false}
        animate={{ width }}
        className={`inline-flex h-8 max-w-full items-center overflow-hidden text-sm font-medium ring-1 ring-inset transition-[color,background-color,box-shadow] duration-300 ${TONE[state]} ${className}`}
      >
        <span ref={measure} className="flex items-center gap-2 px-3 whitespace-nowrap">
          <AnimatePresence initial={false} mode="popLayout">
            {Icon && (
              <motion.span key={state} {...ICON} className="grid size-4 shrink-0 place-items-center">
                <Icon />
              </motion.span>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span key={label} {...LABEL} className="truncate">
              {label}
            </motion.span>
          </AnimatePresence>
        </span>
      </motion.span>
    </MotionConfig>
  )
}
