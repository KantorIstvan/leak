import { useState, type ChangeEvent } from 'react'
import { DownloadSimple, UploadSimple } from '@phosphor-icons/react'
import { BUCKETS, db, exportBackup, importBackup, wipeAll, type Bucket, type Settings } from '../db'
import { today } from '../lib'
import { Button, Card, ConfirmButton, Field, inputCls, PageHeader, Segmented, useApp } from '../ui'

const CURRENCIES = ['HUF', 'EUR', 'USD', 'GBP', 'CHF', 'CZK', 'PLN', 'RON', 'SEK', 'NOK', 'DKK', 'JPY', 'CAD', 'AUD']

const update = (p: Partial<Settings>) => db.settings.update('app', p)

export function SettingsPage() {
  const { t, s } = useApp()
  const names = new Intl.DisplayNames([t.locale], { type: 'currency' })

  return (
    <>
      <PageHeader title={t.nav.settings} />
      <div className="grid max-w-3xl gap-4">
        <Card>
          <div className="grid gap-6">
            <div className="grid gap-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.language}</span>
              <Segmented
                label={t.language}
                value={s.lang}
                onChange={(lang) => update({ lang })}
                options={[
                  { value: 'hu', label: 'Magyar' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.theme}</span>
              <Segmented
                label={t.theme}
                value={s.theme}
                onChange={(theme) => update({ theme })}
                options={(['system', 'light', 'dark'] as const).map((v) => ({ value: v, label: t.themes[v] }))}
              />
            </div>
            <div className="max-w-xs">
              <Field label={t.currency} hint={t.currencyHint}>
                <select className={inputCls} value={s.currency} onChange={(e) => update({ currency: e.target.value })}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c} · {names.of(c)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </Card>

        <Ratios />
        <DataCard />
      </div>
    </>
  )
}

function Ratios() {
  const { t, s } = useApp()
  const [r, setR] = useState(s.ratios)
  const [done, setDone] = useState(false)
  const total = BUCKETS.reduce((a, b) => a + r[b], 0)
  const dirty = BUCKETS.some((b) => r[b] !== s.ratios[b])

  const set = (b: Bucket) => (e: ChangeEvent<HTMLInputElement>) => {
    setDone(false)
    setR({ ...r, [b]: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })
  }

  return (
    <Card title={t.ratios} hint={t.ratiosHint}>
      <div className="grid grid-cols-3 gap-3">
        {BUCKETS.map((b) => (
          <Field key={b} label={t.bucket[b]}>
            <div className="relative">
              <input className={`${inputCls} num pr-8`} type="number" min={0} max={100} inputMode="numeric" value={r[b]} onChange={set(b)} />
              <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-zinc-500">%</span>
            </div>
          </Field>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className={`num text-sm ${total === 100 ? 'text-zinc-600 dark:text-zinc-400' : 'font-medium text-rose-700 dark:text-rose-400'}`}>
          {done ? t.saved_ : t.ratiosSum(total)}
        </span>
        <Button
          variant="primary"
          disabled={total !== 100 || !dirty}
          onClick={async () => {
            await update({ ratios: r })
            setDone(true)
          }}
        >
          {t.save}
        </Button>
      </div>
    </Card>
  )
}

function DataCard() {
  const { t } = useApp()
  const [pending, setPending] = useState<unknown>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function download() {
    const blob = new Blob([JSON.stringify(await exportBackup(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `leak-backup-${today()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setPending(JSON.parse(await file.text()))
      setMsg(null)
    } catch {
      setMsg({ ok: false, text: t.importFailed })
    }
  }

  async function confirmImport() {
    try {
      await importBackup(pending)
      setMsg({ ok: true, text: t.imported })
    } catch {
      setMsg({ ok: false, text: t.importFailed })
    }
    setPending(null)
  }

  return (
    <Card title={t.data} hint={t.dataHint}>
      <div className="flex flex-wrap gap-2">
        <Button onClick={download}>
          <DownloadSimple size={16} />
          {t.exportBackup}
        </Button>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-zinc-800 ring-1 ring-zinc-200 transition focus-within:outline-2 focus-within:outline-accent hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800">
          <UploadSimple size={16} />
          {t.importBackup}
          <input type="file" accept="application/json,.json" className="sr-only" onChange={pick} />
        </label>
      </div>

      {pending !== null && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          <span className="flex-1">{t.importConfirm}</span>
          <Button variant="ghost" onClick={() => setPending(null)}>
            {t.cancel}
          </Button>
          <Button variant="primary" onClick={confirmImport}>
            {t.importBackup}
          </Button>
        </div>
      )}
      {msg && <p className={`mt-3 text-sm ${msg.ok ? 'text-zinc-700 dark:text-zinc-300' : 'font-medium text-rose-700 dark:text-rose-400'}`}>{msg.text}</p>}

      <div className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800">
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">{t.wipeConfirm}</p>
        <ConfirmButton label={t.wipe} onConfirm={wipeAll} />
      </div>
    </Card>
  )
}
