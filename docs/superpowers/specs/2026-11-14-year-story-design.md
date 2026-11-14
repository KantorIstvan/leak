# Year story (éves visszatekintő) — design

## Intent

The year page's "2025 in short" card shows six facts and feels thin. Replace it with a full-screen,
scroll-driven year review: on a desktop it reads like an Apple product page (sticky scenes, big serif
figures that count up as you scroll, charts that build themselves), on a phone like Spotify Wrapped
(full-height snap cards, a segmented progress bar, tap left/right to step). It appears at the end of
the year and any earlier year can be reopened from the year page.

## Goals / non-goals / anti-goals

- Goals: 12-15 scenes of real, personal detail from the user's own data; motion that follows the
  scroll (desktop) or the card entrance (phone); every scene degrades to a still, complete layout
  under reduced motion; works offline (all data is local Dexie).
- Non-goals: sharing/exporting an image (later), server-side anything, new data collection.
- Anti-goals: stock photographs standing in for categories; a generic dashboard; scroll-jacking;
  a fade-in on every block. The data is the picture: giant category icon in its own colour, serif
  numbers, the app's own chart shapes rebuilt as scenes.

## Constraints

- Existing stack: React 19, Tailwind 4, `motion` 12 (`motion/react`), Dexie, Phosphor icons,
  Newsreader (display) + Geist. Square corners, rules not boxes, ink on paper.
- Motion+ components (AnimateNumber, splitText, scroll image reveal) are paid; we write our own
  equivalents (as `Badge.tsx` already does for the multi-state badge).
- Phone/desktop split goes through `usePhone()` (<768px).

## Approaches considered

1. **One scroll document, two layouts** (chosen). One component tree and one data layer; each scene
   receives a 0..1 progress `MotionValue`. Desktop: from `useScroll` over a tall sticky section.
   Phone: from a spring that runs 0→1 when the card is in view. One codebase, no drift.
2. Two separate components (desktop page + phone story player): finer control, every scene written twice.
3. Story player everywhere, scroll only pages: simpler, loses the scroll-linked desktop feel asked for.

## The parts decided

### Data: `src/story.ts` (pure, tested in `story.test.ts`)

`yearStory({ txs, prevTxs, subs, goals, cats, year, ratiosAt, fromSavings })` returns a `Story`
object. Each optional part is `undefined` when there is not enough data, and its scene is skipped.

- `income`, `spent` (needs+wants), `kept` (= income − spent), `keptShare`, `invested`, `txCount`.
- `months[12]`: `{ income, spent, score|null }`; `best`, `hardest` (lowest score with income).
- `categories`: ranked spending with share and tx count; `top` with its count and busiest month.
- `weekdays[7]`: spending by day of week; `topWeekday`. `hours[4]` (night/morning/afternoon/evening)
  from `createdAt`, only when ≥ 60% of txs carry one.
- `days`: map `YYYY-MM-DD → spent`; `costliestDay`; `streak` (longest run of days with no spending,
  only inside days ≤ today for the running year); `activeDays`.
- `regular`: the note logged most (≥ 3 times) with count and total (existing `yearRecap` logic).
- `subs`: count, yearly cost in base currency, priciest — from `subs` + charges in `txs`.
- `abroad`: tx count, total and distinct currencies, when any `origCurrency`.
- `tags`: top 3 by amount.
- `goals`: total saved / total target, count reached.
- `vsLast`: income, spent, kept deltas when the previous year has any tx.

### Scenes (in order; each skips itself when its part is missing)

1. Cover: the year set huge, "your year in money", a scroll hint (desktop) / tap hint (phone).
2. Kept: income counts up, then "kept X" with the share; a rule fills to the share.
3. Rhythm: 12 bars rise one after another with the scroll; best and hardest month labelled.
4. Best month: its name in display serif, score, kept share.
5. Categories: treemap tiles grow in from their centre; top 5 listed beside.
6. Top category: its icon at 240px in its colour on a radial aura, amount, share, count, busiest month.
7. Habits: weekday bars (7) and the time-of-day split; a sentence: "most on Saturdays".
8. Days: 365-cell grid lights up cell by cell; costliest day, longest no-spend streak, active days.
9. The regular: a receipt that prints line by line: note, count, total, average.
10. Subscriptions: count, yearly cost, the priciest.
11. Abroad: currencies as chips, count, total.
12. Tags: top three as large hashtags with amounts.
13. Goals: one bar per goal filling.
14. Versus last year: three deltas, each coloured by direction.
15. Close: a summary tile with four figures and the year, a "Back to the year" button.

### Layout and motion

- `src/pages/Story.tsx` exports `YearStory({ year, onClose })`, rendered by App as a
  `fixed inset-0 z-40` overlay with its own scroller (`overflow-y-auto`); Escape and a top-left
  close button leave it. Desktop: each scene is `min-h-[180vh]` with a sticky `h-screen` stage; the
  scene's progress is `useScroll({ target, offset: ['start start', 'end end'] })`. Phone: the
  scroller is `snap-y snap-mandatory`, each scene `h-dvh snap-start`; progress is a `useSpring`
  driven to 1 by `useInView` (amount 0.6), back to 0 when out; invisible left/right tap zones step
  to the previous/next card; a segmented bar across the top shows position. Desktop also steps with
  arrow keys and shows a 2px progress rule at the top (`scaleX` of the scroller's progress).
- Shared primitives inside Story.tsx: `Scene` (gives children `p: MotionValue<number>`), `Count`
  (money or integer counting via `useTransform` + formatter), `Reveal` (y/opacity/blur from a
  progress window), `Stage` grounds alternating paper / ink (dark band) with an optional aura colour.
- `useReducedMotion()` → every progress is a constant 1; nothing hidden.
- Figures use `money()` from `useApp`; dates and month names via `Intl` with `t.locale`.

### Entry points

- Year page: a "The year's story" button in the page header (phone: under the stats); the old
  `Recap` card is replaced by a one-line teaser band with the same button when the year is finished
  or it is December.
- App: from 20 December for the running year, and all of January for the previous year, a
  dismissible banner above the page ("Your 2025 is ready") opens it; dismissing or opening stores
  `storySeen: year` in Settings (new optional field, synced like the rest).

### Copy

New `story.*` keys in `i18n.ts`, English and Hungarian, plain sentences, numbers formatted by the app.

## Left to the builder

Exact easing windows per scene, the receipt's typography, bar colours (use the data colours and the
category colours already in the app), how the 365-grid wraps on a phone (weeks as rows is fine).
