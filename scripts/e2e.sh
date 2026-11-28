#!/usr/bin/env bash
# Runs the end-to-end and accessibility tests (e2e/) against the whole stack in Docker Compose: the API
# repository's compose.yaml (PostgreSQL, migrations, the API, the worker, Mailpit, ...) with e2e/compose.yaml
# adding this SPA's nginx image. Builds both from source, waits for them, runs Playwright, and takes the stack down
# again with its data.
#
#   npm run e2e [-- <playwright arguments>]
#
# PFM_API_DIR    the API repository (default: the clone next to this one, ../personal-finance-manager-api)
# PFM_E2E_PORT   where the SPA is published (8081); PFM_E2E_MAIL_PORT, Mailpit (8026)
# PFM_E2E_KEEP=1 leaves the stack running afterwards, to look around or to run again sooner (only what changed is
#                rebuilt); docker compose -p pfm-e2e down -v takes it down.
set -euo pipefail

spa=$(cd "$(dirname "$0")/.." && pwd)
api=$(cd "${PFM_API_DIR:-$spa/../personal-finance-manager-api}" && pwd)
export PFM_SPA_DIR=$spa PFM_API_DIR=$api
export PFM_E2E_PORT=${PFM_E2E_PORT:-8081} PFM_E2E_MAIL_PORT=${PFM_E2E_MAIL_PORT:-8026}
compose=(docker compose -p pfm-e2e -f "$api/compose.yaml" -f "$spa/e2e/compose.yaml")

if [ "${PFM_E2E_KEEP:-}" != 1 ]; then
  trap '"${compose[@]}" down -v --remove-orphans' EXIT
fi

# The worker commits imports.
"${compose[@]}" up --build --detach spa worker

# The API answers once it has started; until then nginx answers 502.
echo "Waiting for the API behind http://localhost:$PFM_E2E_PORT ..."
for _ in $(seq 1 120); do
  status=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PFM_E2E_PORT/api/v1/auth/antiforgery" || true)
  if [ "$status" = 200 ]; then break; fi
  sleep 1
done
if [ "$status" != 200 ]; then
  "${compose[@]}" logs api migrate
  echo "The API did not start (last answer: $status)." >&2
  exit 1
fi

# A user with a year of sample data, for the accessibility checks to see full screens. A new one each run, as the
# seed refuses an email that already has a user.
PFM_E2E_SAMPLE_EMAIL="sample-$(date +%s)@example.com"
export PFM_E2E_SAMPLE_EMAIL PFM_E2E_SAMPLE_PASSWORD="sample data password"
"${compose[@]}" run --rm api seed --email "$PFM_E2E_SAMPLE_EMAIL" --password "$PFM_E2E_SAMPLE_PASSWORD"

npx playwright test "$@"
