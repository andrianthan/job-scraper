# job-board-aggregator

Finance / business / HR **internship** aggregator and notifier for underclassmen
(incoming sophomores/juniors) hunting next-summer internships — a niche the
CS-heavy GitHub internship repos underserve.

Fetches postings from public ATS APIs (Greenhouse, Lever, Ashby, Workday) —
no login, proxy, or captcha required. Zero npm dependencies. **Node 22+**
(uses built-in `node:sqlite` and native `fetch`). The scan is **zero-token**:
it never fetches individual job pages and never calls an LLM.

## Setup

### 1. Clone

```sh
git clone <repo-url>
cd job-board-aggregator
```

### 2. Prerequisites

Node 22 or later is required (built-in `node:sqlite` and native `fetch`).
No `npm install` needed — zero npm dependencies.

```sh
node --version   # must be ≥ 22.0.0
```

### 3. Edit the board list — `portals.config.mjs`

The file ships with 14 live boards (fintech + banks) and 6 disabled ones.
Add, remove, or adjust entries in `trackedCompanies`. Run `npm run verify`
after editing to drop dead slugs before relying on the list.

### 4. Configure notification channel (optional)

Copy `.env.example` to `.env` and fill in the values you want:

```sh
cp .env.example .env
# Edit .env — add DISCORD_WEBHOOK_URL and/or NOTIFY_EMAIL + RESEND_API_KEY
```

If no channels are configured, new jobs print to stdout — useful for a first
dry run.

### 5. First run

```sh
node scan.mjs              # scan + print new jobs (stdout)
node scan.mjs --notify     # scan + send digest to configured channels
node scan.mjs --json       # scan + dump new jobs as JSON to stdout
```

Output: `📊 scanned N · parked N · failed N · N new jobs`

### 6. Schedule (unattended scans)

See [docs/SCHEDULING.md](docs/SCHEDULING.md) for the full setup. Quick paths:

- **Local cron (hourly):** `npm run schedule:install` — idempotent, adds one
  crontab entry that runs `node scan.mjs --notify` and appends to `scan.log`
- **GitHub Actions:** already committed at `.github/workflows/scan.yml` — add
  `DISCORD_WEBHOOK_URL` as a repo secret and push; runs hourly automatically

## Configuration Reference

| Setting | File / Source | What it does | Example | Default |
|---------|--------------|--------------|---------|---------|
| `trackedCompanies` | `portals.config.mjs` | Companies to scan. Each entry needs `name` and `careers_url`; ATS is auto-detected. Add `provider: 'greenhouse'` to force a provider. Set `enabled: false` to park a board. | `{ name: 'Stripe', careers_url: 'https://stripe.com/jobs', provider: 'greenhouse' }` | 14 live boards |
| `titleFilter.positive` | `portals.config.mjs` | Title must contain **at least one** keyword. Intern-signal gate — titles without a keyword are dropped. | `['Intern', 'Summer Analyst', 'Co-op']` | 20 keywords |
| `titleFilter.negative` | `portals.config.mjs` | Title must contain **none** of these. Drops senior / full-time roles even if a positive keyword matched. | `['Senior', 'Engineer', 'Manager']` | 14 keywords |
| `locationFilter.alwaysAllow` | `portals.config.mjs` | Locations that bypass all other location checks. | `['United States', 'New York', 'Remote']` | US + Remote |
| `locationFilter.allow` | `portals.config.mjs` | Locations to accept (if not alwaysAllow). Jobs with empty/missing location always pass. | `['Boston', 'Chicago', 'Los Angeles']` | 10 US cities |
| `locationFilter.block` | `portals.config.mjs` | Locations to reject (checked after alwaysAllow). | `['London', 'Singapore']` | 6 non-US regions |
| `DISCORD_WEBHOOK_URL` | env / `.env` | Discord channel webhook. When set, `--notify` posts the digest as embeds. Alias: `DISCORD_WEBHOOK`. | `https://discord.com/api/webhooks/123/abc` | none (stdout fallback) |
| `NOTIFY_EMAIL` | env / `.env` | Recipient email address for digest emails. Requires `RESEND_API_KEY`. | `you@example.com` | none |
| `RESEND_API_KEY` | env / `.env` | Resend API key for email delivery ([resend.com](https://resend.com)). | `re_AbcXyz123` | none |
| `NOTIFY_EMAIL_FROM` | env / `.env` | Sender address for email notifications. | `scanner@yourdomain.com` | `onboarding@resend.dev` |
| Schedule interval | cron / `.github/workflows/scan.yml` | How often the scan runs unattended. | `0 * * * *` (every hour) | hourly |
| `DB_PATH` | env | Path to the SQLite dedup database. Auto-created on first run. Override in tests. | `data/jobs.db` | `data/jobs.db` |

## How it works

```
portals.config.mjs ──► scan.mjs
                          │  loadProviders()  auto-imports providers/*.mjs
                          │  for each company: detect ATS → fetch JSON feed
                          │  filter: title gate (word-boundary) → location
                          │  dedup: data/jobs.db  (SQLite — URL + fuzzy title)
                          │  NEW jobs ─► console / --json / --notify
                          ▼
                       notify.mjs ──► Discord webhook / Resend email
```

Zero-token: never fetches individual job pages, never calls an LLM.

## Adding a board

1. Add an entry to `trackedCompanies` in `portals.config.mjs` — `name` +
   `careers_url` is all that is required; ATS is auto-detected.
2. Run `npm run verify` to confirm the slug is live before relying on it.

19 providers ship in `providers/`. Adding a new ATS = drop a `providers/x.mjs`
exporting `{ id, detect, fetch }` — `scan.mjs` auto-loads it.

## Seasonality note

Postings for a given summer open the **prior fall**. Near-zero results in
spring/summer for next-summer roles is expected, not a bug.

## Attribution

Provider modules, `_http.mjs`, `role-matcher.mjs` © career-ops contributors,
MIT. See https://github.com/santifer/career-ops.
