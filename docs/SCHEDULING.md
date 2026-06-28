# Scheduling

Two paths to run scans unattended. Pick one.

---

## Path 1: Local cron (primary)

**One-step setup:**

```sh
npm run schedule:install
```

This installs an hourly crontab entry that runs `node scan.mjs --notify` in the
project directory and appends output to `scan.log`. The installer is idempotent —
running it twice produces exactly one cron entry.

**What the cron entry looks like:**

```
0 * * * *  cd /path/to/job-board-aggregator && node scan.mjs --notify >> /path/to/job-board-aggregator/scan.log 2>&1
```

**Verify the entry was installed:**

```sh
crontab -l
```

**Remove the entry:**

```sh
crontab -e   # delete the scan.mjs line, save and exit
```

**Requirements:**
- `node` must be on the system PATH (Node 22+)
- `DISCORD_WEBHOOK_URL` must be exported in your shell profile (e.g. `~/.zshrc` or `~/.bashrc`)
  so the cron environment can read it. Example:
  ```sh
  export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
  ```

---

## Path 2: GitHub Actions (cloud alternative)

The workflow is already committed at `.github/workflows/scan.yml`. It triggers
**hourly** (`schedule: cron: '0 * * * *'`) and can also be triggered manually
via **workflow_dispatch** in the GitHub UI.

**One-step setup:**

Add `DISCORD_WEBHOOK_URL` as a repository secret:
> GitHub repo → Settings → Secrets and variables → Actions → New repository secret

Name: `DISCORD_WEBHOOK_URL`
Value: your Discord webhook URL

That's it. The workflow runs automatically once the branch is pushed to GitHub.

**How incremental runs work:**

`data/jobs.db` (the dedup database) is gitignored and not in the repo. On every
GitHub Actions run, `actions/cache` restores the most recent saved snapshot of
`data/jobs.db` before the scan runs, and saves the updated database after. This
means scheduled cloud runs stay incremental — jobs already seen are not
re-notified on the next run.

**Manual trigger (for testing):**

> GitHub repo → Actions → Job Board Scan → Run workflow
