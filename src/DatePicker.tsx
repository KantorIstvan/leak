import { DayPicker } from 'react-day-picker'
import { enUS, hu } from 'react-day-picker/locale'
import { CalendarBlank, X } from '@phosphor-icons/react'
import { today } from './lib'
import { triggerCls, useApp, usePopover } from './ui'

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const chip = (on: boolean) =>
  `h-8 px-3 text-sm font-medium ring-1 ring-ink ring-inset transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent ${
    on ? 'bg-accent text-accent-fg' : 'text-zinc-800 hover:bg-ink/5 dark:text-zinc-200'
  }`

/**
 * Date field: a button showing the date, quick Today/Yesterday chips, and a calendar popover that floats over the content below.
 * With a placeholder it is optional: it may be empty, shows a clear button and drops the quick chips.
 */
export function DatePicker({
  label,
  value,
  onChange,
  placeholder,
  defaultMonth,
  align = 'left',
}: {
  label: string
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  defaultMonth?: string // YYYY-MM-DD shown when the field is empty
  align?: 'left' | 'right'
}) {
  const { t, s } = useApp()
  const { open, setOpen, ref, onKeyDown } = usePopover()
  const selected = value ? toDate(value) : undefined
  const now = new Date()
  const yesterday = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const quick = placeholder === undefined

  return (
    <div ref={ref} className="relative grid gap-2" onKeyDown={onKeyDown}>
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className={`${triggerCls} w-full text-base sm:text-sm ${quick ? 'h-11' : 'h-10 pr-9'}`}
          >
            <CalendarBlank size={18} className="shrink-0 text-zinc-500" />
            <span className={`truncate first-letter:uppercase ${selected ? '' : 'text-zinc-500'}`}>
              {selected
                ? new Intl.DateTimeFormat(t.locale, quick ? { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' } : { month: 'short', day: 'numeric' }).format(selected)
                : placeholder}
            </span>
          </button>
          {!quick && value && (
            <button
              type="button"
              aria-label={t.clear}
              onClick={() => onChange('')}
              className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>
        {quick && (
          <>
            <button type="button" aria-pressed={value === today()} className={chip(value === today())} onClick={() => onChange(today())}>
              {t.today}
            </button>
            <button type="button" aria-pressed={value === yesterday} className={chip(value === yesterday)} onClick={() => onChange(yesterday)}>
              {t.yesterday}
            </button>
          </>
        )}
      </div>

      {open && (
        <div
          className={`anim-pop absolute top-full z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-panel p-3 shadow-[6px_6px_0] ring-1 shadow-ink/10 ring-ink dark:shadow-black/50 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <DayPicker
            mode="single"
            required
            selected={selected}
            defaultMonth={selected ?? (defaultMonth ? toDate(defaultMonth) : undefined)}
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
