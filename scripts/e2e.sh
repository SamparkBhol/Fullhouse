#!/usr/bin/env bash
# Builds the web app, starts the fake Qloo server and wrangler dev without the AI binding, runs the Playwright
# specs and stops everything.
# The first pass runs the app with a key. The second pass restarts the Worker without one for the key missing page.
# Arguments go to the first Playwright pass, for example a spec file or --trace on.
# Exits non zero when a spec fails or something does not start.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.tmp/e2e"
source "$ROOT/scripts/local/lib.sh"

if [ -e "$ROOT/.dev.vars" ]; then
  echo ".dev.vars exists, so a dev server may be running. Stop it first: e2e runs its own Worker." >&2
  exit 1
fi
rm -rf "$RUN_DIR"
mkdir -p "$RUN_DIR"
cleanup() {
  stop_all
  rm -f "$RUN_DIR"/*.env
}
trap cleanup EXIT
trap 'exit 130' INT TERM

echo "Building the web app"
build_web "$RUN_DIR/build.log"

key="fake-$(random_secret)"
secret="$(random_secret)"
start_fake "$key" "$RUN_DIR/fake.log"
no_ai_config
write_env "$RUN_DIR/app.env" "QLOO_API_KEY=$key" "QLOO_BASE_URL=$FAKE_URL" "QLOO_IMAGE_BASE=$FAKE_URL" "TOKEN_SECRET=$secret"
write_env "$RUN_DIR/nokey.env" "QLOO_BASE_URL=$FAKE_URL" "TOKEN_SECRET=$secret"
unset key secret

playwright() {
  (cd "$ROOT" && E2E_BASE_URL="$WORKER_URL" FAKE_QLOO_URL="$FAKE_URL" nice -n 15 "$BIN/playwright" test --config e2e/playwright.config.ts "$@")
}

status=0
echo "Starting the Worker with the fake Qloo key"
start_worker app "$RUN_DIR/app.env" "$RUN_DIR/wrangler-app.log" --local --config "$NO_AI_CONFIG"
playwright --project=app "$@" || status=$?
stop_pid "$WORKER_PID"

echo "Starting the Worker without a Qloo key"
start_worker nokey "$RUN_DIR/nokey.env" "$RUN_DIR/wrangler-nokey.log" --local --config "$NO_AI_CONFIG"
playwright --project=nokey || status=$?
stop_pid "$WORKER_PID"

if [ "$status" -ne 0 ]; then
  echo "e2e failed. Logs are in $RUN_DIR" >&2
fi
exit "$status"
