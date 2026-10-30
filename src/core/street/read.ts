import type { EntityRef, HeatLayer, StreetRead, Venue } from "../../shared/contract.ts";
import type { Qloo } from "../qloo/client.ts";
import { QlooError } from "../qloo/errors.ts";
import { withStreetTags } from "./because.ts";
import { createRunner, type Runner } from "./runner.ts";
import { settleProvenance } from "./settle.ts";
import { pairStep } from "../pair/engine.ts";
import { likedFor } from "../pair/taste.ts";
import { crossDomain } from "./steps/cross_domain.ts";
import { conceptHeat, venueHeat } from "./steps/heat.ts";
import { readLimits } from "./steps/limits.ts";
import { LOVED_RADIUS_M, lovedPlaces } from "./steps/loved_places.ts";
import { noteChanges } from "./steps/momentum.ts";
import { resolveVenue } from "./steps/resolve.ts";
import { streetFingerprint } from "./steps/street_tags.ts";
import { venueFingerprint } from "./steps/venue_tags.ts";

export { READ_CAP } from "../../shared/engine.ts";
import { READ_CAP } from "../../shared/engine.ts";
export const CONCURRENCY = 3;
const CONCEPT_TAGS = 2;

export const NO_DEMOGRAPHICS =
  "This read does not ask Qloo for the age or gender of anyone's audience, so it says nothing about who your customers are.";

export interface ReadOptions {
  previous?: StreetRead;
  exclude?: EntityRef[];
}

// When not one call answered, throwing keeps the venue's last good read instead of storing an empty one.
function assertAnswered(run: Runner): void {
  if (run.answered() > 0) return;
  throw run.firstError() ?? new QlooError("server", 0, "Qloo answered none of the calls for this read");
}

export async function readStreet(q: Qloo, venue: Venue, opts: ReadOptions = {}): Promise<StreetRead> {
  const ctx = resolveVenue(venue, q.now?.() ?? new Date());
  const run = createRunner(q, READ_CAP, CONCURRENCY);

  const [street, audience, loved, venueMap] = await Promise.all([
    streetFingerprint(run, ctx),
    venueFingerprint(run, ctx),
    lovedPlaces(run, ctx),
    venueHeat(run, ctx),
  ]);
  const places = loved.loved?.places ?? [];
  const venueTags = audience.audience?.tags ?? [];
  const concepts = venueTags.filter((t) => t.namespace === "urn:tag:genre:place").slice(0, CONCEPT_TAGS);
  const readAt = ctx.now.toISOString();
  const [matched, conceptMap, cross] = await Promise.all([
    pairStep(run, ctx, venue, places, loved.loved?.ref ?? null, readAt, loved.loved?.aside ?? []),
    conceptHeat(run, ctx, concepts),
    crossDomain(run, ctx, { exclude: opts.exclude ?? [], anchors: [] }),
  ]);
  const moved = noteChanges(cross.rising, opts.previous, ctx);
  assertAnswered(run);

  const { rows, rowOf } = run.provenance();
  const stepNotes = [...[street, audience, loved, venueMap, conceptMap, matched, cross, moved].flatMap((s) => s.limits), NO_DEMOGRAPHICS];
  const heat = [venueMap.layer, conceptMap.layer].filter((l): l is HeatLayer => l !== null);
  return settleProvenance(
    {
      venueId: venue.id,
      at: readAt,
      center: ctx.center,
      radiusM: LOVED_RADIUS_M,
      heat,
      streetTags: street.street?.tags ?? [],
      venueTags: audience.audience?.tags ?? [],
      likedFor: likedFor(audience.audience?.tags ?? [], places),
      shared: matched.match?.shared ?? [],
      gaps: matched.gaps,
      lovedPlaces: withStreetTags(places, street.street, audience.audience, ctx.name),
      rising: withStreetTags(moved.rising, street.street, audience.audience, ctx.name),
      ...(matched.match ? { match: matched.match } : {}),
      limits: readLimits(run.notes(), stepNotes, rows),
    },
    rows,
    rowOf,
  );
}
