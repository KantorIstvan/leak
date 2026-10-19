import { useEffect, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { Button, Sheet, useApp } from './ui'

/** On launch, asks GitHub for a newer release and offers to install it. The installer replaces the old version in place. */
export function Updater() {
  const { t } = useApp()
  const [update, setUpdate] = useState<Update | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return // plain browser (npm run dev)
    check().then(setUpdate, () => {}) // offline or no release yet: try again next launch
  }, [])

  const install = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await update!.downloadAndInstall()
      await relaunch()
    } catch {
      setBusy(false)
      setFailed(true)
    }
  }

  return (
    <Sheet open={update !== null} onClose={() => setUpdate(null)} title={t.updateTitle}>
      {update && (
        <div className="grid gap-5">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t.updateBody(update.version)}</p>
          {failed && <p className="text-sm text-rose-700 dark:text-rose-300">{t.updateFailed}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setUpdate(null)}>
              {t.updateLater}
            </Button>
            <Button variant="primary" disabled={busy} onClick={install}>
              {busy ? t.updating : t.updateInstall}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
