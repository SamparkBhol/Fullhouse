import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BACK_CHECKS, LOVED_RADIUS_M, LOVED_TAKE } from "../../src/shared/engine.ts";
import { createQloo } from "../../src/core/qloo/client.ts";
import { CITY_PLANS, LIVE_CAP, VENUE_CALLS, WALK_MAX } from "./config.ts";
import { discover, type Found, type Skipped } from "./discover.ts";
import { diskFetch } from "./disk.ts";
import { scanVenue } from "./read.ts";
import { reportOf } from "./report.ts";
import { methodOf, recordOf, type VenueResult } from "./totals.ts";

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function keyFromDevVars(root: string): string {
  const line = readFileSync(join(root, ".dev.vars"), "utf8")
    .split("\n")
    .find((l) => l.startsWith("QLOO_API_KEY="));
  const key = line?.slice("QLOO_API_KEY=".length).trim();
  if (!key) throw new Error("QLOO_API_KEY is not in .dev.vars");
  return key;
}

const root = process.cwd();
const cacheDir = need("SCAN_CACHE");
const outDir = need("SCAN_OUT");
const live = process.env.LIVE === "1";
const cap = Number.parseInt(process.env.SCAN_CAP ?? "", 10) || LIVE_CAP;
const disk = diskFetch(cacheDir, live, cap);
const q = createQloo({ apiKey: live ? keyFromDevVars(root) : "kept-answers-only", fetch: disk.fetch });

const byCity: Found[][] = [];
const skipped: Array<Skipped & { city: string }> = [];
for (const plan of CITY_PLANS) {
  const found = await discover(q, plan);
  byCity.push(found.picked);
  skipped.push(...found.skipped.map((s) => ({ ...s, city: plan.city })));
  console.log(`${plan.city}: ${found.picked.length} venues picked, ${found.skipped.length} left out. Live calls so far ${disk.ledger.live}.`);
}
// The cities take turns, so a scan stopped by its cap still covers both.
const picked = Array.from({ length: Math.max(...byCity.map((l) => l.length)) }, (_, i) => byCity.flatMap((l) => (l[i] ? [l[i]] : []))).flat();
writeFileSync(join(outDir, "discovery.json"), JSON.stringify({ picked, skipped }, null, 2));
if (process.env.SCAN_DISCOVER_ONLY === "1") process.exit(0);

const rows: VenueResult[] = [];
for (const f of picked) {
  if (live && disk.ledger.left() < VENUE_CALLS) {
    console.log(`Stopped before ${f.candidate.name}: ${disk.ledger.left()} live calls left.`);
    break;
  }
  const r = await scanVenue(q, f, new Date());
  rows.push(r);
  const p = r.partner;
  console.log(`${r.name}: ${p ? `${p.name}, fit ${p.fit}, ${p.walkMin} min, back ${p.back.rank ?? "none"} of ${p.back.of}, two way ${r.twoWay ? "yes" : "no"}` : r.read ? "no partner" : "not read"}. live ${disk.ledger.live}`);
}

const record = recordOf(rows, {
  at: new Date().toISOString(),
  calls: disk.ledger.answered,
  method: methodOf({ take: LOVED_TAKE, radiusM: LOVED_RADIUS_M, checks: BACK_CHECKS, walkMax: WALK_MAX }),
  walkMax: WALK_MAX,
  cities: CITY_PLANS.map((p) => p.city),
});
writeFileSync(join(outDir, "full.json"), JSON.stringify({ record, ledger: { live: disk.ledger.live, cached: disk.ledger.cached }, rows }, null, 2));
writeFileSync(join(outDir, "record.json"), `${JSON.stringify(record, null, 2)}\n`);
writeFileSync(join(outDir, "report.txt"), `${reportOf(rows, record, disk.ledger)}\n`);
console.log(`Done. ${record.overall.venues} venues, ${record.overall.twoWay} two way. Live calls ${disk.ledger.live}, kept answers ${disk.ledger.cached}.`);
