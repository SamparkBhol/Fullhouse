#!/usr/bin/env bash
# Runs Full House locally with wrangler dev, against the fake Qloo server by default.
# LIVE=1 uses the live Qloo API with QLOO_API_KEY from the environment, or the host in QLOO_BASE_URL when it is set,
# such as a local caching proxy in front of the live API.
# With CLOUDFLARE_API_TOKEN in the environment the AI binding runs remotely. Without it, or when the remote
# binding does not start, the Worker runs without the binding and plans use template copy.
# The secrets go into a .dev.vars only this user can read, and it is deleted when the script stops.
# A live run also deletes its local Worker state on exit, because that state caches Qloo answers.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.tmp/dev"
DEV_VARS="$ROOT/.dev.vars"
source "$ROOT/scripts/local/lib.sh"

if [ -e "$DEV_VARS" ]; then
  echo ".dev.vars already exists. Move it away first: dev.sh writes its own and deletes it on exit." >&2
  exit 1
fi
mkdir -p "$RUN_DIR"
# A live run's Worker state holds Qloo answers in its cache table, so it is removed with the run.
cleanup() {
  stop_all
  rm -f "$DEV_VARS"
  if [ "${LIVE:-0}" = "1" ]; then rm -rf "$RUN_DIR"/state-*; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

echo "Building the web app"
build_web "$RUN_DIR/build.log"

base=""
images=""
if [ "${LIVE:-0}" = "1" ]; then
  if [ -z "${QLOO_API_KEY:-}" ]; then
    echo "LIVE=1 needs QLOO_API_KEY in the environment." >&2
    exit 1
  fi
  key="$QLOO_API_KEY"
  base="${QLOO_BASE_URL:-}"
  qloo_line="live API${base:+ through $base}"
else
  key="fake-$(random_secret)"
  start_fake "$key" "$RUN_DIR/fake.log"
  base="$FAKE_URL"
  images="$FAKE_URL"
  qloo_line="fake server at $base, log at $base/__fake/log"
fi
write_env "$DEV_VARS" "QLOO_API_KEY=$key" "TOKEN_SECRET=$(random_secret)" ${base:+"QLOO_BASE_URL=$base"} ${images:+"QLOO_IMAGE_BASE=$images"}
unset key QLOO_API_KEY QLOO_BASE_URL

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && start_worker app "$DEV_VARS" "$RUN_DIR/wrangler-remote-ai.log"; then
  ai="remote binding"
else
  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then echo "The remote AI binding did not start, so this run uses template copy." >&2; fi
  no_ai_config
  start_worker app "$DEV_VARS" "$RUN_DIR/wrangler.log" --local --config "$NO_AI_CONFIG"
  ai="off, template copy"
fi

echo
echo "Full House   $WORKER_URL"
echo "Qloo         $qloo_line"
echo "AI           $ai"
echo "Logs         $RUN_DIR"
echo "Ctrl+C stops everything and deletes .dev.vars."
wait
