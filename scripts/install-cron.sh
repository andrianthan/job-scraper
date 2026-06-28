#!/usr/bin/env sh
# install-cron.sh — idempotently install an hourly cron entry for job-board-aggregator.
# Usage:  sh scripts/install-cron.sh
#         npm run schedule:install
#
# Installs: 0 * * * *  cd <projdir> && node scan.mjs --notify >> <projdir>/scan.log 2>&1
# Guard:    does nothing if this project's scan.mjs entry already exists in crontab.

set -e

PROJ_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRON_CMD="0 * * * * cd $PROJ_DIR && node scan.mjs --notify >> $PROJ_DIR/scan.log 2>&1"

# Idempotency guard: exit cleanly if already installed
if crontab -l 2>/dev/null | grep -qF "cd $PROJ_DIR && node scan.mjs"; then
  printf 'Cron entry already installed for %s. Nothing to do.\n' "$PROJ_DIR"
  exit 0
fi

# Append to existing crontab (preserves other entries)
{ crontab -l 2>/dev/null; printf '%s\n' "$CRON_CMD"; } | crontab -

printf 'Installed cron entry:\n  %s\n' "$CRON_CMD"
printf 'Verify with: crontab -l\n'
printf 'Remove with: crontab -e  (delete the line manually)\n'
