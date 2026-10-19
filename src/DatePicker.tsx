import { useEffect, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { enUS, hu } from 'react-day-picker/locale'
import { CalendarBlank } from '@phosphor-icons/react'
import { today } from './lib'
import { useApp } from './ui'

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const chip = (on: boolean) =>
  `h-8 rounded-full px-3 text-sm font-medium transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent ${
    on ? 'bg-accent text-accent-fg' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
  }`

/** Date field: a button showing the date, quick Today/Yesterday chips, and a calendar popover that floats over the content below. */
export function DatePicker({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => void }) {
  const { t, s } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])
  const selected = toDate(value)
  const now = new Date()
  const yesterday = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))

  return (
    <div
      ref={ref}
      className="relative grid gap-2"
      onKeyDown={(e) => {
        // Esc closes the calendar only, not the surrounding dialog.
        if (e.key === 'Escape' && open) {
          e.preventDefault()
          e.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex h-11 flex-1 items-center gap-2 rounded-lg bg-white px-3 text-left text-base ring-1 ring-zinc-300 transition hover:ring-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-sm dark:bg-zinc-950 dark:ring-zinc-700 dark:hover:ring-zinc-500"
        >
          <CalendarBlank size={18} className="shrink-0 text-zinc-500" />
          <span className="truncate first-letter:uppercase">
            {new Intl.DateTimeFormat(t.locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(selected)}
          </span>
        </button>
        <button type="button" className={chip(value === today())} onClick={() => onChange(today())}>
          {t.today}
        </button>
        <button type="button" className={chip(value === yesterday)} onClick={() => onChange(yesterday)}>
          {t.yesterday}
        </button>
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 rounded-xl bg-white p-3 shadow-xl ring-1 shadow-zinc-900/10 ring-zinc-200 sm:right-auto sm:w-80 dark:bg-zinc-900 dark:shadow-black/40 dark:ring-zinc-700">
          <DayPicker
            mode="single"
            required
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              onChange(toIso(d))
              setOpen(false)
            }}
            locale={s.lang === 'hu' ? hu : enUS}
            weekStartsOn={1}
            showOutsideDays
            classNames={{
              root: 'w-full',
              months: 'relative',
              month: 'grid gap-2',
              month_caption: 'flex h-9 items-center px-1',
              caption_label: 'text-sm font-semibold first-letter:uppercase',
              nav: 'absolute top-0 right-0 flex gap-1',
              button_previous:
                'grid size-9 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
              button_next:
                'grid size-9 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
              chevron: 'size-4 fill-current',
              month_grid: 'w-full border-collapse',
              weekday: 'pb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400',
              day: 'p-0.5 text-center',
              day_button:
                'num mx-auto grid size-9 place-items-center rounded-full text-sm transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-accent dark:hover:bg-zinc-800',
              today: 'font-bold underline underline-offset-4',
              selected: '[&>button]:bg-accent [&>button]:text-accent-fg [&>button]:hover:bg-accent',
              outside: 'text-zinc-400 dark:text-zinc-600',
            }}
          />
        </div>
      )}
    </div>
  )
}
