#!/usr/bin/env bash
# The street scan, run with the engine's own code. SCAN_CACHE is the folder of kept Qloo answers, SCAN_OUT gets the results.
# LIVE=1 lets answers that are not kept come from the live API, with QLOO_API_KEY read from .dev.vars, up to SCAN_CAP calls.
# SCAN_DISCOVER_ONLY=1 stops after finding the venues.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${SCAN_CACHE:?set SCAN_CACHE to the folder of kept Qloo answers}"
: "${SCAN_OUT:?set SCAN_OUT to the folder for the results}"
mkdir -p "$SCAN_OUT"
cd "$ROOT"
nice -n 15 node --no-warnings scripts/scan/main.ts 2>&1 | tee "$SCAN_OUT/run.log"
