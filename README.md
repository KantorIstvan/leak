# Leak

A personal finance tracker built around the **50/30/20 rule**: every month your income is split into
**Needs** (50%), **Wants** (30%) and **Investments** (20%), and Leak shows how your spending tracks against that plan.

Desktop app (Windows, macOS, Linux) built with Tauri. Works on small screens too. Sign in with Google, GitHub or an
email code, and your data syncs to your account so it survives a lost or broken computer.

## Features

- Monthly view: income, expenses, what's left, and a live budget split per bucket
- Yearly view: income vs expenses chart, month-by-month table with averages and totals, category breakdown
- Categories (tags) for income and expenses, with a default bucket per category, fully editable
- Saving goals with an estimate of how many months are left at your current pace
- Any display currency, Hungarian and English UI, light and dark mode
- Sync across devices after signing in; the last synced data stays readable offline
- JSON backup export and import

## Install

Download the installer for your system from the [latest release](https://github.com/KantorIstvan/leak/releases/latest).

| System | File |
|---|---|
| Windows | `Leak_x.y.z_x64-setup.exe` |
| macOS, Apple Silicon (M1 or newer) | `Leak_x.y.z_aarch64.dmg` |
| macOS, Intel | `Leak_x.y.z_x64.dmg` |
| Linux | `.AppImage` (any distro), `.deb` (Debian/Ubuntu), `.rpm` (Fedora) |

The app is not code-signed yet, so the first launch needs one extra step:

- **Windows:** on the "Windows protected your PC" screen click **More info**, then **Run anyway**.
- **macOS:** open the `.dmg` and drag Leak to Applications. On first launch macOS blocks it; go to
  **System Settings > Privacy & Security**, scroll down and click **Open Anyway**.
- **Linux (AppImage):** make it executable with `chmod +x Leak_*.AppImage`, then run it.

Your data lives in your account, so it is there on every device you sign in on. On first sign-in, data from an older
version of Leak on that computer is uploaded automatically.

## Tech stack

| Layer | Choice |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app) |
| UI | React 19, TypeScript, Vite |
| Styling | Tailwind CSS 4 |
| Charts | Recharts |
| Sign-in | [Clerk](https://clerk.com) |
| Storage | [Supabase](https://supabase.com) Postgres with row level security; Dexie as the local mirror |
| Tests | Vitest |

Amounts are stored as integer minor units (cents) to avoid floating-point rounding errors.

## Getting started

Requirements: [Node.js](https://nodejs.org) 20+, and for the desktop build [Rust and the Tauri prerequisites](https://tauri.app/start/prerequisites/).

Development runs against its own Clerk development instance and Supabase project, so it never touches real users.
Put their publishable keys in `.env.development.local` (git-ignored):

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_SUPABASE_URL=https://<dev-project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Create the tables by running [supabase/schema.sql](supabase/schema.sql) in the project's SQL editor. Builds
(`npm run build`, `tauri build`, the release workflow) use the production keys committed in `.env.production`.

```bash
npm install
npm run dev          # web version at http://localhost:5173
npm run tauri dev    # desktop app
npm run tauri build  # installer in src-tauri/target/release/bundle
npm test             # unit tests
```

To publish a release, bump the version in `package.json` and `src-tauri/tauri.conf.json`, then push a tag:
`git tag v0.1.1 && git push origin v0.1.1`. GitHub Actions builds every platform and creates a draft release.

Open `http://localhost:5173/?demo` in dev mode to fill an empty database with a sample year.

## Project layout

```
src/
  db.ts          data model, default categories, backup
  lib.ts         money parsing/formatting, monthly and yearly summaries (tested in lib.test.ts)
  i18n.ts        Hungarian and English strings
  ui.tsx         shared components
  TxSheet.tsx    add / edit transaction form
  pages/         Month, Year, Goals, Categories, Settings
src-tauri/       desktop shell (Rust)
```

## License

[AGPL-3.0-or-later](LICENSE)
