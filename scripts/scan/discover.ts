import type { KindGroup, VenueCandidate } from "../../src/shared/contract.ts";
import type { Qloo } from "../../src/core/qloo/client.ts";
import { findVenues } from "../../src/core/street/venues.ts";
import { canHost } from "../../src/core/street/hosts.ts";
import { kindOf } from "../../src/core/pair/groups.ts";
import { CHAINS, PER_CITY, SCANNED_GROUPS, type CityPlan } from "./config.ts";

export interface Found {
  city: string;
  area: string;
  via: string;
  candidate: VenueCandidate;
  group: KindGroup;
  kind: string;
}

export interface Skipped {
  name: string;
  why: string;
}

const BRANCHES = 3;

function plain(s: string): string {
  return ` ${s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9']+/g, " ").trim()} `;
}

// The first answer to a name has to carry the name's first two words, so a search that lands on another place is dropped.
function sameName(typed: string, found: string): boolean {
  const have = new Set(plain(found).replace(/'/g, "").split(" "));
  const want = plain(typed).replace(/'/g, "").split(" ").filter((w) => w.length >= 3 && w !== "the" && w !== "and").slice(0, 2);
  return want.every((w) => have.has(w));
}

function chainNamed(name: string): boolean {
  const n = plain(name);
  return CHAINS.some((c) => n.includes(plain(c)));
}

async function search(q: Qloo, name: string, city: string, near?: { lat: number; lng: number }): Promise<VenueCandidate[]> {
  try {
    return await findVenues(q, name, city, near ? { near } : {});
  } catch (err) {
    console.log(`search for ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// Kinds take turns, in the order the searches first found them, so one busy kind cannot fill a city.
function spread(list: Found[], n: number): Found[] {
  const byGroup = new Map<KindGroup, Found[]>();
  for (const f of list) byGroup.set(f.group, [...(byGroup.get(f.group) ?? []), f]);
  const out: Found[] = [];
  while (out.length < n && [...byGroup.values()].some((l) => l.length)) {
    for (const l of byGroup.values()) {
      const next = l.shift();
      if (next && out.length < n) out.push(next);
    }
  }
  return out;
}

export async function discover(q: Qloo, plan: CityPlan): Promise<{ picked: Found[]; skipped: Skipped[] }> {
  const seen: Array<{ c: VenueCandidate; area: string; via: string; seed: boolean }> = [];
  for (const seed of plan.seeds) {
    const top = (await search(q, seed, plan.city))[0];
    if (top && !sameName(seed, top.name)) console.log(`${seed} found ${top.name} first, left out`);
    else if (top) seen.push({ c: top, area: "seed", via: `name search "${seed}"`, seed: true });
  }
  for (const s of plan.searches) {
    const area = plan.areas.find((a) => a.name === s.area);
    if (!area) continue;
    for (const c of await search(q, s.query, plan.city, { lat: area.lat, lng: area.lng })) seen.push({ c, area: area.name, via: `"${s.query}" near ${area.name}`, seed: false });
  }
  const branches = new Map<string, Set<string>>();
  for (const s of seen) branches.set(plain(s.c.name), (branches.get(plain(s.c.name)) ?? new Set()).add(s.c.id.toUpperCase()));
  const skipped: Skipped[] = [];
  const ids = new Set<string>();
  const seeds: Found[] = [];
  const rest: Found[] = [];
  for (const s of seen) {
    const id = s.c.id.toUpperCase();
    if (ids.has(id)) continue;
    ids.add(id);
    const kind = kindOf(s.c);
    const why = !canHost(s.c)
      ? "not a room that hosts people, or no website to find its owner"
      : !kind.group || !SCANNED_GROUPS.includes(kind.group)
        ? `a ${kind.word}, not a room that runs evenings`
        : chainNamed(s.c.name)
          ? "a chain"
          : (branches.get(plain(s.c.name))?.size ?? 0) >= BRANCHES
            ? "a name with several branches"
            : null;
    if (why || !kind.group) {
      skipped.push({ name: s.c.name, why: why ?? "no kind" });
      continue;
    }
    (s.seed ? seeds : rest).push({ city: plan.city, area: s.area, via: s.via, candidate: s.c, group: kind.group, kind: kind.word });
  }
  const named = seeds.slice(0, PER_CITY);
  return { picked: [...named, ...spread(rest, PER_CITY - named.length)], skipped };
}
