// Takes the Help page's screenshots: every picture in English and Hungarian, light and dark, from the real pages
// filled with the sample account (main.tsx, sample.ts). Writes src/assets/help/<name>-<lang>-<theme>.webp and
// src/assets/help/shots.json (each picture's size and its numbered markers' anchors, per language).
//
//   npm run help-shots
//
// Needs Chrome or Chromium: set CHROME to its path, or have Playwright's (npx playwright install chromium-headless-shell).
// Runs its own Vite server with its own dependency cache, so a running `tauri dev` is left alone.
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const out = join(root, 'src/assets/help')

// What to photograph: the page each picture comes from. Several pictures can share one page load.
const PAGES = { month: ['month-top', 'month-split', 'month-txs'], year: ['year'], subs: ['subs'], goals: ['goals'], categories: ['categories'], split: ['split'] }
const LANGS = ['en', 'hu']
const THEMES = ['light', 'dark']
const WIDTH = 1100 // CSS pixels: the page panel of a desktop window. Shot at 2x.

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME
  const pw = join(homedir(), '.cache/ms-playwright')
  if (existsSync(pw))
    for (const dir of readdirSync(pw).filter((d) => d.startsWith('chromium')).sort().reverse()) {
      for (const sub of readdirSync(join(pw, dir))) {
        for (const bin of ['headless_shell', 'chrome']) if (existsSync(join(pw, dir, sub, bin))) return join(pw, dir, sub, bin)
      }
    }
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']) if (existsSync(p)) return p
  throw new Error('No Chrome found. Set CHROME to a Chrome or Chromium binary.')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Placeholders when there is no .env: the pages only construct these clients, they never call them.
process.env.VITE_SUPABASE_URL ||= 'http://localhost'
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||= 'placeholder'
process.env.VITE_CLERK_PUBLISHABLE_KEY ||= 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k'

const server = await createServer({
  configFile: false,
  root: here,
  envDir: root,
  cacheDir: join(root, 'node_modules/.vite-help-shots'),
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: '"0.0.0"' },
  server: { port: 0, strictPort: false, fs: { allow: [root] } },
  logLevel: 'error',
})
await server.listen()
const base = server.resolvedUrls.local[0]

const profile = mkdtempSync(join(tmpdir(), 'leak-shots-'))
const port = 9500 + Math.floor(Math.random() * 400)
const chrome = spawn(findChrome(), ['--headless=new', '--no-sandbox', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })

try {
  let targets
  for (let i = 0; i < 50 && !targets; i++) {
    await sleep(200)
    targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json(), () => undefined)
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0
  const waiting = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && waiting.has(m.id)) waiting.get(m.id)(m)
    if (m.method === 'Runtime.exceptionThrown') console.error('page error:', m.params.exceptionDetails.exception?.description)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.error('page console:', m.params.args.map((x) => x.value ?? x.description).join(' '))
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') console.error('page log:', m.params.entry.text, m.params.entry.url ?? '')
  })
  const send = (method, params = {}) =>
    new Promise((ok, fail) => {
      const id = ++seq
      waiting.set(id, (m) => (waiting.delete(id), m.error ? fail(new Error(`${method}: ${m.error.message}`)) : ok(m.result)))
      ws.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(`${expression}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
    return r.result.value
  }

  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 2400, deviceScaleFactor: 2, mobile: false })
  // Charts and bars settle at once: the shots must not catch them mid-animation.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })

  // Everything goes to a fresh folder first and replaces the old pictures only once the whole run worked, so a run that
  // fails part-way leaves the Help page's pictures and shots.json as they were.
  const fresh = mkdtempSync(join(tmpdir(), 'leak-help-shots-'))
  const meta = {}
  for (const lang of LANGS)
    for (const theme of THEMES)
      for (const [page, names] of Object.entries(PAGES)) {
        await send('Page.navigate', { url: `${base}?page=${page}&lang=${lang}&theme=${theme}` })
        for (let i = 0; i < 100 && !(await evaluate('window.__ready === true').catch(() => false)); i++) await sleep(100)
        if (!(await evaluate('window.__ready === true'))) throw new Error(`${page} (${lang}, ${theme}) never got ready`)
        await sleep(1200) // live queries, charts, lazy layout
        for (const name of names) {
          const found = await evaluate(`window.__locate(${JSON.stringify(name)})`)
          // Whole CSS pixels, so the picture's size is exactly twice the clip's.
          const clip = Object.fromEntries(['x', 'y', 'width', 'height'].map((k) => [k, Math.round(found.clip[k])]))
          const marks = found.marks
          const shot = await send('Page.captureScreenshot', { format: 'webp', quality: 82, captureBeyondViewport: true, clip: { ...clip, scale: 1 } })
          writeFileSync(join(fresh, `${name}-${lang}-${theme}.webp`), Buffer.from(shot.data, 'base64'))
          // Markers in percent of the picture, so they stay put at any width the Help page draws it.
          if (theme === 'light')
            (meta[name] ??= {})[lang] = {
              size: [Math.round(clip.width * 2), Math.round(clip.height * 2)],
              // [x %, y %, side]: the anchor on the numbered thing's edge, and which side of it the marker goes.
              marks: marks.map(([x, y, side]) => [+(((x - clip.x) / clip.width) * 100).toFixed(2), +(((y - clip.y) / clip.height) * 100).toFixed(2), side]),
            }
          console.log(`${name}-${lang}-${theme}`)
        }
      }
  writeFileSync(join(fresh, 'shots.json'), JSON.stringify(meta, null, 2) + '\n')
  mkdirSync(out, { recursive: true })
  for (const f of readdirSync(out)) if (f.endsWith('.webp') || f === 'shots.json') rmSync(join(out, f))
  for (const f of readdirSync(fresh)) copyFileSync(join(fresh, f), join(out, f))
  rmSync(fresh, { recursive: true, force: true })
  ws.close()
} finally {
  chrome.kill()
  await server.close()
  rmSync(profile, { recursive: true, force: true })
}
