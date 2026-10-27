import type { HeatLayer, StreetRead, Venue } from "../../shared/contract.ts";
import type { Qloo } from "../qloo/client.ts";
import { QlooError } from "../qloo/errors.ts";
import { withStreetTags } from "./because.ts";
import { createRunner, type Runner } from "./runner.ts";
import { settleProvenance } from "./settle.ts";
import { compareStep } from "./steps/compare.ts";
import { crossDomain } from "./steps/cross_domain.ts";
import { demographicsStep } from "./steps/demographics.ts";
import { streetHeat, venueHeat } from "./steps/heat.ts";
import { readLimits } from "./steps/limits.ts";
import { LOVED_RADIUS_M, lovedPlaces } from "./steps/loved_places.ts";
import { applyMomentum } from "./steps/momentum.ts";
import { resolveVenue } from "./steps/resolve.ts";
import { streetFingerprint } from "./steps/street_tags.ts";
import { venueFingerprint } from "./steps/venue_tags.ts";

export const READ_CAP = 30;
export const CONCURRENCY = 3;
const HEAT_TAGS = 3;

export interface ReadOptions {
  previous?: StreetRead;
}

// When not one call answered, throwing keeps the venue's last good read instead of storing an empty one.
function assertAnswered(run: Runner): void {
  if (run.answered() > 0) return;
  throw run.firstError() ?? new QlooError("server", 0, "Qloo answered none of the calls for this read");
}

export async function readStreet(q: Qloo, venue: Venue, opts: ReadOptions = {}): Promise<StreetRead> {
  const ctx = resolveVenue(venue, q.now?.() ?? new Date());
  const run = createRunner(q, READ_CAP, CONCURRENCY);

  const [street, audience, loved, venueMap, cross, demo] = await Promise.all([
    streetFingerprint(run, ctx),
    venueFingerprint(run, ctx),
    lovedPlaces(run, ctx),
    venueHeat(run, ctx),
    crossDomain(run, ctx),
    demographicsStep(run, ctx),
  ]);
  const places = loved.loved?.places ?? [];
  const [compared, streetMap] = await Promise.all([
    compareStep(run, ctx, { partners: places, street: street.street, audience: audience.audience }),
    streetHeat(run, ctx, street.street?.tags.slice(0, HEAT_TAGS) ?? []),
  ]);
  const moved = applyMomentum(cross.rising, opts.previous, ctx);
  assertAnswered(run);

  const { rows, rowOf } = run.provenance();
  const stepNotes = [street, audience, loved, venueMap, streetMap, compared, cross, moved, demo].flatMap((s) => s.limits);
  const heat = [venueMap.layer, streetMap.layer].filter((l): l is HeatLayer => l !== null);
  return settleProvenance(
    {
      venueId: venue.id,
      at: ctx.now.toISOString(),
      center: ctx.center,
      radiusM: LOVED_RADIUS_M,
      heat,
      streetTags: street.street?.tags ?? [],
      venueTags: audience.audience?.tags ?? [],
      shared: compared.shared,
      gaps: compared.gaps,
      lovedPlaces: withStreetTags(places, street.street),
      rising: withStreetTags(moved.rising, street.street),
      ...(demo.demographics ? { demographics: demo.demographics } : {}),
      limits: readLimits(run.notes(), stepNotes, rows),
    },
    rows,
    rowOf,
  );
}
