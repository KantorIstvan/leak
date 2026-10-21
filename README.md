<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="96" alt="Leak icon">

# Leak

**See where your money leaks.** A personal finance tracker built around the 50/30/20 rule.

[![Latest release](https://img.shields.io/github/v/release/KantorIstvan/leak?style=flat-square&color=18181b&label=release)](https://github.com/KantorIstvan/leak/releases/latest)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-18181b?style=flat-square)](#install)
[![License](https://img.shields.io/badge/license-AGPL--3.0-18181b?style=flat-square)](LICENSE)

[**Download**](https://github.com/KantorIstvan/leak/releases/latest) &nbsp;&nbsp;&nbsp; [Features](#features) &nbsp;&nbsp;&nbsp; [Development](#development)

</div>

<br>

## How it works

Every month your income is split into three buckets, and Leak shows how your spending tracks against that plan.

| Needs | Wants | Investments |
|:---:|:---:|:---:|
| **50%** | **30%** | **20%** |
| Rent, groceries, bills | Eating out, games, travel | Savings and investing |

The split is yours to change: drag the handles in Settings or pick a preset.

Leak is a desktop app for Windows, macOS and Linux, built with Tauri, and it works on small screens too. Sign in with
Google, GitHub or an email code and your data syncs to your account, so it survives a lost or broken computer.

## Features

<table>
<tr>
<td width="50%" valign="top">

**Track**

- Monthly view: income, expenses, what's left, and a live budget split per bucket
- Yearly view: income vs expenses chart, month-by-month table with averages and totals, category breakdown
- Search, filters and bulk edit for transactions
- Subscriptions, added to every month automatically

</td>
<td width="50%" valign="top">

**Plan**

- Adjustable budget split, 50/30/20 by default
- Saving goals with an estimate of how many months are left at your current pace
- Categories for income and expenses, each with an icon and a default bucket

</td>
</tr>
<tr>
<td valign="top">

**Your data**

- Syncs across devices after signing in
- The last synced data stays readable offline
- CSV import and export, also from other apps
- JSON backup export and import

</td>
<td valign="top">

**Make it yours**

- Any display currency
- Hungarian and English UI
- Light and dark mode, custom colours
- Colour-blind mode
- 12 or 24-hour clock

</td>
</tr>
</table>

## Install

Download the installer for your system from the **[latest release](https://github.com/KantorIstvan/leak/releases/latest)**.

| System | File |
|---|---|
| Windows | `Leak_x.y.z_x64-setup.exe` |
| macOS, Apple Silicon (M1 or newer) | `Leak_x.y.z_aarch64.dmg` |
| macOS, Intel | `Leak_x.y.z_x64.dmg` |
| Linux | `.AppImage` (any distro), `.deb` (Debian/Ubuntu), `.rpm` (Fedora) |

> [!NOTE]
> The app is not code-signed yet, so the first launch needs one extra step:
>
> - **Windows:** on the "Windows protected your PC" screen click **More info**, then **Run anyway**.
> - **macOS:** open the `.dmg` and drag Leak to Applications. On first launch macOS blocks it; go to
>   **System Settings > Privacy & Security**, scroll down and click **Open Anyway**.
> - **Linux (AppImage):** make it executable with `chmod +x Leak_*.AppImage`, then run it.

After that, Leak offers new versions on launch and installs them in place.

Your data lives in your account, so it is there on every device you sign in on. On first sign-in, data from an older
version of Leak on that computer is uploaded automatically.

## Development

### Requirements

- [Node.js](https://nodejs.org) 20+
- For the desktop build: [Rust and the Tauri prerequisites](https://tauri.app/start/prerequisites/)

### Environment

Development runs against its own Clerk development instance and Supabase project, so it never touches real users.
Put their publishable keys in `.env.development.local` (git-ignored):

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_SUPABASE_URL=https://<dev-project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Create the tables by running [supabase/schema.sql](supabase/schema.sql) in the project's SQL editor. Builds
(`npm run build`, `tauri build`, the release workflow) use the production keys committed in `.env.production`.

### Commands

```bash
npm install
npm run dev          # web version at http://localhost:5173
npm run tauri dev    # desktop app
npm run tauri build  # installer in src-tauri/target/release/bundle
npm test             # unit tests
```

> [!TIP]
> Open `http://localhost:5173/?demo` in dev mode to fill an empty database with a sample year.

### Releasing

Bump the version in `package.json` and `src-tauri/tauri.conf.json`, then push a tag:

```bash
git tag v0.1.1 && git push origin v0.1.1
```

GitHub Actions builds every platform and creates a draft release.

### Tech stack

| Layer | Choice |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app) |
| UI | React 19, TypeScript, Vite |
| Styling | Tailwind CSS 4 |
| Charts | Recharts |
| Sign-in | [Clerk](https://clerk.com) |
| Storage | [Supabase](https://supabase.com) Postgres with row level security, Dexie as the local mirror |
| Tests | Vitest |

Amounts are stored as integer minor units (cents) to avoid floating-point rounding errors.

### Project layout

```
src/
├── db.ts           data model, default categories, backup
├── cloud.ts        Supabase sync; every write reaches the server before the local mirror
├── lib.ts          money parsing/formatting, monthly and yearly summaries (tested in lib.test.ts)
├── csv.ts          CSV import and export
├── i18n.ts         Hungarian and English strings
├── ui.tsx          shared components
├── TxSheet.tsx     add / edit transaction form
├── TxBrowser.tsx   transaction list with search, filters and bulk edit
└── pages/          Month, Year, Subscriptions, Goals, Categories, Settings
src-tauri/          desktop shell (Rust)
supabase/           database schema
```

## License

[AGPL-3.0-or-later](LICENSE)
