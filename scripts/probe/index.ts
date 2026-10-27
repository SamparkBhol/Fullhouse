import { diskCache } from "./cache.ts";
import { createProbeClient } from "./client.ts";
import { CACHE_DIR, CALL_CAP, CONCURRENCY, LEDGER_FILE, RECORD_DIR, RETRIES, TIMEOUT_MS } from "./config.ts";
import type { ProbeContext } from "./context.ts";
import { openLedger } from "./ledger.ts";
import { writeReports } from "./report.ts";
import { createRunner } from "./runner.ts";
import { cityStage, experimentStage, globalStage, resolveStage, streetStage } from "./stages.ts";
import { VENUES, type ProbeVenue } from "./venues.ts";

function selectedVenues(): ProbeVenue[] {
  const only = (process.env.PROBE_VENUES ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  return only.length ? VENUES.filter((v) => only.includes(v.slug)) : VENUES;
}

// Pinning the date keeps trending windows, and so their cache keys, stable across reruns.
function probeDate(): Date {
  const pinned = process.env.PROBE_DATE;
  const d = pinned ? new Date(`${pinned}T12:00:00Z`) : new Date();
  if (Number.isNaN(d.getTime())) throw new RangeError("PROBE_DATE must be YYYY-MM-DD");
  return d;
}

async function main(): Promise<void> {
  const offline = process.env.PROBE_OFFLINE === "1";
  const apiKey = process.env.QLOO_API_KEY?.trim() || (offline ? "unused" : "");
  if (!apiKey) {
    console.error("QLOO_API_KEY is not set.");
    process.exitCode = 1;
    return;
  }
  const now = probeDate();
  const venues = selectedVenues();
  const ledger = await openLedger(LEDGER_FILE, CALL_CAP);
  const client = createProbeClient({ apiKey, offline, cache: diskCache(CACHE_DIR), ledger, concurrency: CONCURRENCY, timeoutMs: TIMEOUT_MS, retries: RETRIES });
  const runner = createRunner(client, RECORD_DIR);

  const localities = await cityStage(runner, venues);
  const gameUrn = await globalStage(runner, localities, now);
  const resolutions = await resolveStage(runner, venues, localities);
  const resolved = venues.flatMap((v) => resolutions.get(v.slug)?.resolved ?? []);
  const followUps = await streetStage(runner, resolved, gameUrn, now);
  const experimentSlugs = await experimentStage(runner, resolutions, followUps, gameUrn, now);
  await ledger.flush();

  const ctx: ProbeContext = {
    now,
    venues,
    localities,
    resolutions,
    gameUrn,
    experimentSlugs,
    records: runner.records(),
    calls: { thisRun: ledger.spentThisRun(), ever: ledger.spentEver(), cap: ledger.cap },
  };
  const written = await writeReports(ctx);
  const cached = ctx.records.filter((r) => r.cached).length;
  console.log(`${ctx.records.length} requests, ${cached} from cache, ${ctx.calls.thisRun} live this run, ${ctx.calls.ever} of ${ctx.calls.cap} live overall.`);
  console.log(`Resolved ${resolutions.size} of ${venues.length} venues. Video game type: ${gameUrn}.`);
  for (const file of written) console.log(`Wrote ${file}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
