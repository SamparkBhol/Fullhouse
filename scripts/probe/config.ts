import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const QLOO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const LIVE_DIR = resolve(QLOO_ROOT, "raw/live");
export const CACHE_DIR = resolve(LIVE_DIR, "cache");
export const RECORD_DIR = resolve(LIVE_DIR, "probe");
export const LEDGER_FILE = resolve(CACHE_DIR, "ledger.json");
export const COVERAGE_FILE = resolve(LIVE_DIR, "probe_coverage.txt");
export const SHAPES_FILE = resolve(LIVE_DIR, "probe_shapes.json");

// Total live requests this probe may ever make, retries included, across every run.
export const CALL_CAP = 395;
export const CONCURRENCY = 3;
// Longer than the app's 8 s so slow endpoints are measured instead of cut off.
export const TIMEOUT_MS = 20000;
export const RETRIES = 2;

export const LOVED_RADIUS_M = 1200;
export const HEAT_RADIUS_M = 2000;
export const CITY_RADIUS_MILES = 30;
// Trending answers an empty series unless the window reaches back to May 2026 on the hackathon host.
export const TREND_WEEKS = 26;
export const MATCH_RADIUS_KM = 45;
