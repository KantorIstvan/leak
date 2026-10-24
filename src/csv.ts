// Transactions as a spreadsheet. The same columns go out and come back in, and a hand-made file
// with just some of them (at least date and amount) imports too.
import type { Bucket, Kind, Lang, Tx } from './db'
import { isDay, parseAmount } from './lib'

export const COLUMNS = ['date', 'type', 'amount', 'category', 'bucket', 'note', 'original_amount', 'original_currency'] as const
type Column = (typeof COLUMNS)[number]

/** One transaction as it reads in a file: category by name, not id. */
export interface Row {
  date: string
  kind: Kind
  amount: number // minor units of the base currency
  category: string
  bucket: Bucket | null
  note: string
  origAmount?: number // paid in another currency: the amount in it, minor units
  origCurrency?: string
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

// Header names and values accepted in English and Hungarian, compared without accents.
const HEADERS: Record<string, Column> = {
  date: 'date', datum: 'date',
  type: 'type', kind: 'type', tipus: 'type',
  amount: 'amount', osszeg: 'amount',
  category: 'category', kategoria: 'category',
  bucket: 'bucket', csoport: 'bucket',
  note: 'note', description: 'note', leiras: 'note', megjegyzes: 'note',
  original_amount: 'original_amount', 'original amount': 'original_amount', 'eredeti osszeg': 'original_amount',
  original_currency: 'original_currency', 'original currency': 'original_currency', 'eredeti penznem': 'original_currency',
}
const KINDS: Record<string, Kind> = { income: 'income', bevetel: 'income', expense: 'expense', kiadas: 'expense' }
const BUCKET_NAMES: Record<string, Bucket> = {
  needs: 'needs', szukseglet: 'needs', wants: 'wants', vagy: 'wants', investments: 'investments', befektetes: 'investments',
}

const cell = (v: string) => (/[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** Comma-separated with a BOM, so Excel opens the accents right. */
export function toCsv(txs: Tx[], catName: (id: string) => string) {
  const lines = [...txs]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .map((tx) =>
      [tx.date, tx.kind, String(tx.amount / 100), catName(tx.categoryId), tx.bucket ?? '', tx.note, tx.origAmount ? String(tx.origAmount / 100) : '', tx.origCurrency ?? '']
        .map(cell)
        .join(','),
    )
  return '﻿' + [COLUMNS.join(','), ...lines].join('\r\n') + '\r\n'
}

/** A file's text. Excel's plain "CSV" is saved in the Windows code page, not UTF-8: read it as that, so accents survive. */
export function decodeCsv(bytes: ArrayBuffer, lang: Lang) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder(lang === 'hu' ? 'windows-1250' : 'windows-1252').decode(bytes)
  }
}

/** RFC 4180 cells. The separator is whichever of , and ; the header line uses more (Hungarian Excel saves with ;). */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '')
  const head = text.slice(0, text.search(/\r?\n|$/))
  const sep = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let v = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') v += text[++i]
      else if (c === '"') quoted = false
      else v += c
    } else if (c === '"') quoted = true
    else if (c === sep) {
      row.push(v)
      v = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      rows.push([...row, v])
      row = []
      v = ''
    } else v += c
  }
  if (v || row.length) rows.push([...row, v])
  return rows
}

/**
 * "2026-10-19", "2026.10.19.", "2026. 10. 19." (Hungarian Excel), "2026/10/19", a time after any of them
 * -> "2026-10-19"; null unless it is a real day.
 */
function readDate(s: string) {
  const m = /^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?(?:[\sT]+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(s.trim())
  const date = m && `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return date && isDay(date) ? date : null
}

/**
 * "-4 700 Ft", "4 700-", "4700,5", "1.234,56", "1,234.56", "1.234.567" -> signed minor units. With both separators
 * the last one is the decimal point; one that repeats groups thousands. A lone "1,234" could be either: null.
 */
function readAmount(raw: string) {
  const s = raw.replace(/[−–]/g, '-').replace(/[^\d.,-]/g, '')
  const digits = s.replace(/-/g, '')
  const dot = digits.lastIndexOf('.')
  const comma = digits.lastIndexOf(',')
  const plain =
    dot >= 0 && comma >= 0
      ? dot > comma
        ? digits.replace(/,/g, '')
        : digits.replace(/\./g, '').replace(',', '.')
      : /^\d{1,3}([.,])\d{3}(\1\d{3})+$/.test(digits)
        ? digits.replace(/[.,]/g, '')
        : digits
  const v = parseAmount(plain)
  return v && s.includes('-') ? -v : v
}

/**
 * Reads a transactions file. Without a type column a row is an expense; a leading minus also means expense.
 * Returns null when the header lacks date or amount; `bad` lists the 1-based line numbers it had to skip.
 */
export function readCsv(text: string, fallbackCategory: string): { rows: Row[]; bad: number[] } | null {
  const [header = [], ...lines] = parseCsv(text)
  const at = new Map<Column, number>()
  header.forEach((h, i) => {
    const col = HEADERS[fold(h)]
    if (col && !at.has(col)) at.set(col, i)
  })
  if (!at.has('date') || !at.has('amount')) return null
  const get = (line: string[], c: Column) => (at.has(c) ? (line[at.get(c)!] ?? '').trim() : '')

  const rows: Row[] = []
  const bad: number[] = []
  lines.forEach((line, i) => {
    if (line.every((c) => !c.trim())) return
    const signed = readAmount(get(line, 'amount'))
    const negative = !!signed && signed < 0
    const amount = signed && Math.abs(signed)
    const date = readDate(get(line, 'date'))
    const type = get(line, 'type')
    const kind: Kind | undefined = type ? KINDS[fold(type)] : 'expense'
    if (!amount || !date || !kind || (negative && kind === 'income')) return bad.push(i + 2)
    // The original amount is optional, but one given half (a currency without an amount) is a mistake.
    const currency = get(line, 'original_currency').toUpperCase()
    const orig = get(line, 'original_amount') ? readAmount(get(line, 'original_amount')) : null
    if ((currency || orig) && !(/^[A-Z]{3}$/.test(currency) && orig)) return bad.push(i + 2)
    rows.push({
      ...(currency && { origAmount: Math.abs(orig!), origCurrency: currency }),
      date,
      kind,
      amount,
      category: get(line, 'category') || fallbackCategory,
      bucket: kind === 'income' ? null : (BUCKET_NAMES[fold(get(line, 'bucket'))] ?? null),
      note: get(line, 'note'),
    })
  })
  return { rows, bad }
}

const key = (r: Pick<Row, 'date' | 'kind' | 'amount' | 'category' | 'note'>) => [r.date, r.kind, r.amount, fold(r.category), r.note.trim()].join('|')

/**
 * The rows not in the app yet, so importing the same file twice adds nothing. Counted per identical row:
 * two same coffees in the file against one in the app add one. Bucket is ignored, as it is often edited after.
 */
export function missing(rows: Row[], existing: Tx[], catName: (id: string) => string) {
  const have = new Map<string, number>()
  for (const tx of existing) {
    const k = key({ ...tx, category: catName(tx.categoryId) })
    have.set(k, (have.get(k) ?? 0) + 1)
  }
  return rows.filter((r) => {
    const n = have.get(key(r)) ?? 0
    if (n) have.set(key(r), n - 1)
    return !n
  })
}

export const sameName = (a: string, b: string) => fold(a) === fold(b)
