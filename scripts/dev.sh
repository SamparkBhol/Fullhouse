#!/usr/bin/env bash
# Runs Full House locally with wrangler dev, against the fake Qloo server by default.
# LIVE=1 uses the live Qloo API with QLOO_API_KEY from the environment.
# CLOUDFLARE_API_TOKEN in the environment lets the AI binding run remotely; without it plans use template copy.
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
cleanup() {
  stop_all
  rm -f "$DEV_VARS"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

base=""
if [ "${LIVE:-0}" = "1" ]; then
  if [ -z "${QLOO_API_KEY:-}" ]; then
    echo "LIVE=1 needs QLOO_API_KEY in the environment." >&2
    exit 1
  fi
  key="$QLOO_API_KEY"
else
  key="fake-$(random_secret)"
  start_fake "$key" "$RUN_DIR/fake.log"
  base="$FAKE_URL"
fi

(
  umask 077
  printf 'QLOO_API_KEY=%s\nTOKEN_SECRET=%s\n' "$key" "$(random_secret)" >"$DEV_VARS"
  if [ -n "$base" ]; then printf 'QLOO_BASE_URL=%s\n' "$base" >>"$DEV_VARS"; fi
)
unset key

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && start_worker app "" "$RUN_DIR/wrangler.log"; then
  ai="remote binding"
else
  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then echo "The remote AI binding did not start, so this run uses template copy." >&2; fi
  start_worker app "" "$RUN_DIR/wrangler.log" --local
  ai="off, template copy"
fi

echo
echo "Full House   $WORKER_URL"
if [ -n "$base" ]; then
  echo "Qloo         fake server at $base"
  echo "Qloo log     $base/__fake/log"
else
  echo "Qloo         live API"
fi
echo "AI           $ai"
echo "Logs         $RUN_DIR"
echo "Ctrl+C stops everything and deletes .dev.vars."
wait
