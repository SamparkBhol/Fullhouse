import type { Venue } from "../../src/shared/contract.ts";
import { DEFAULT_SLOT, READ_CAP } from "../../src/shared/engine.ts";
import { cityNamed } from "../../src/shared/cities.ts";
import { walkMinutes } from "../../src/shared/walk.ts";
import type { Qloo } from "../../src/core/qloo/client.ts";
import { createRunner } from "../../src/core/street/runner.ts";
import { CONCURRENCY } from "../../src/core/street/read.ts";
import { lovedPlaces } from "../../src/core/street/steps/loved_places.ts";
import { resolveVenue } from "../../src/core/street/steps/resolve.ts";
import { pairStep } from "../../src/core/pair/engine.ts";
import { evenings } from "../../src/core/pair/fit.ts";
import { groupOf } from "../../src/core/pair/groups.ts";
import { pairFormat } from "../../src/core/night/grammar.ts";
import { WALK_MAX } from "./config.ts";
import type { Found } from "./discover.ts";
import type { PairResult, VenueResult } from "./totals.ts";

function venueOf(f: Found, now: Date): Venue {
  return {
    id: "scan",
    entity: f.candidate,
    city: f.city,
    tz: cityNamed(f.city)?.tz ?? "UTC",
    quietSlot: { ...DEFAULT_SLOT },
    createdAt: now.toISOString(),
    assumed: { slot: true, room: true },
  };
}

// The same two steps a street read runs to pick the partner: the venue's crowd's list, then the reverse reads and compare.
export async function scanVenue(q: Qloo, f: Found, now: Date): Promise<VenueResult> {
  const venue = venueOf(f, now);
  const ctx = resolveVenue(venue, now);
  const run = createRunner(q, READ_CAP, CONCURRENCY);
  const loved = await lovedPlaces(run, ctx);
  const places = loved.loved?.places ?? [];
  const base: VenueResult = {
    city: f.city,
    area: f.area,
    via: f.via,
    id: f.candidate.id,
    name: f.candidate.name,
    ...(f.candidate.address ? { address: f.candidate.address } : {}),
    ...(f.candidate.url ? { url: f.candidate.url } : {}),
    kind: f.kind,
    group: f.group,
    read: places.length > 0,
    calls: 0,
    notes: [],
    partner: null,
    twoWay: false,
    openTogether: false,
    board: [],
  };
  if (!base.read) return { ...base, calls: run.answered(), notes: [...loved.limits, ...run.notes()] };
  const step = await pairStep(run, ctx, venue, places, loved.loved?.ref ?? null, now.toISOString(), loved.loved?.aside ?? []);
  const done = { ...base, calls: run.answered(), notes: [...loved.limits, ...step.limits, ...run.notes()], board: step.match?.considered ?? [] };
  const m = step.match?.partner;
  if (!m?.fit) return done;
  const pass = (key: string) => m.fit?.checks.find((c) => c.key === key)?.pass === true;
  const def = pairFormat(groupOf(venue.entity), groupOf(m));
  const ev = evenings({ venue, partner: m });
  const back = m.reverseRank ?? { checked: false, rank: null, of: 0 };
  const partner: PairResult = {
    id: m.id,
    name: m.name,
    ...(m.address ? { address: m.address } : {}),
    kind: m.kind ?? "place",
    group: m.group ?? null,
    walkMin: m.walkMin ?? walkMinutes(m.distanceM),
    distanceM: m.distanceM,
    fit: m.fit.score,
    forward: { rank: m.rank, of: places.length },
    back: { checked: back.checked, rank: back.rank, of: back.of },
    crowdPass: pass("crowd"),
    backPass: pass("back"),
    evenings: ev,
    format: def.format,
    label: def.label,
    sentences: m.fit.checks.map((c) => `${c.label} ${c.points} of ${c.max}. ${c.sentence}`),
  };
  return { ...done, partner, twoWay: partner.crowdPass && partner.backPass && partner.walkMin <= WALK_MAX, openTogether: ev.opened >= 1 };
}
