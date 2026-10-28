import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createQloo, findVenues, readStreet, type Qloo } from "../src/core/index.ts";
import type { Venue, VenueCandidate } from "../src/shared/contract.ts";
import { qlooDiskCache } from "./live/disk_cache.ts";
import { summarise } from "./live/summary.ts";
import { diskCache } from "./probe/cache.ts";
import { openLedger } from "./probe/ledger.ts";

// QLOO_API_KEY=... npm run live-read [-- "<venue name>" "<city>"], or LIVE_OFFLINE=1 to answer from the disk cache only.
// Answers already in the probe's disk cache are reused, so a rerun costs no live calls.

const QLOO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CACHE_DIR = resolve(QLOO_ROOT, "raw/live/cache");
const LEDGER_FILE = resolve(CACHE_DIR, "ledger_live_read.json");
const LIVE_CALL_CAP = 150;

interface DemoVenue {
  name: string;
  city: string;
  tz: string;
}

const DEMO: DemoVenue[] = [
  { name: "Housing Works Bookstore Cafe", city: "New York", tz: "America/New_York" },
  { name: "City Lights Booksellers", city: "San Francisco", tz: "America/Los_Angeles" },
  { name: "The Photographers' Gallery", city: "London", tz: "Europe/London" },
];

function asVenue(demo: DemoVenue, entity: VenueCandidate, i: number): Venue {
  return {
    id: `live-read-${i + 1}`,
    entity,
    city: demo.city,
    tz: demo.tz,
    quietSlot: { weekday: 2, start: "19:00", durationMin: 180 },
    createdAt: new Date().toISOString(),
  };
}

async function readOne(q: Qloo, demo: DemoVenue, i: number): Promise<string[]> {
  const candidates = await findVenues(q, demo.name, demo.city);
  const picked = candidates[0];
  const head = [`${demo.name}, ${demo.city}`];
  head.push(`  Search: ${candidates.length} candidates; first three ${candidates.slice(0, 3).map((c) => `${c.name} (${c.address ?? "no address"})`).join("; ")}`);
  if (!picked) return [...head, "  Nothing came back from the venue search."];
  head.push(`  Picked: ${picked.name}, ${picked.address ?? "no address"}, ${picked.tags.length} tags`);
  const started = Date.now();
  const read = await readStreet(q, asVenue(demo, picked, i));
  return [...head, ...summarise(read, Date.now() - started)];
}

function venuesToRead(args: string[]): DemoVenue[] {
  const [name, city] = args;
  return name && city ? [{ name, city, tz: "UTC" }] : DEMO;
}

async function main(): Promise<void> {
  const offline = process.env.LIVE_OFFLINE === "1";
  const apiKey = offline ? "offline" : (process.env.QLOO_API_KEY ?? "");
  if (!apiKey) throw new Error("Set QLOO_API_KEY, or LIVE_OFFLINE=1 to answer from the cache only");
  const ledger = await openLedger(LEDGER_FILE, LIVE_CALL_CAP);
  const q = createQloo({
    apiKey,
    cache: qlooDiskCache(diskCache(CACHE_DIR)),
    budget: async () => !offline && ledger.reserve(),
    timeoutMs: 20000,
  });
  for (const [i, demo] of venuesToRead(process.argv.slice(2)).entries()) {
    console.log((await readOne(q, demo, i)).join("\n"));
    console.log("");
  }
  await ledger.flush();
  console.log(`Live calls this run: ${ledger.spentThisRun()}, all runs: ${ledger.spentEver()} of ${ledger.cap}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : "live read failed");
  process.exitCode = 1;
});
