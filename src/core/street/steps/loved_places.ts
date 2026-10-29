import type { LovedPlace } from "../../../shared/contract.ts";
import { parseEntities, type QEntity } from "../../qloo/entities.ts";
import { locationFilter } from "../../qloo/location.ts";
import { TYPE_URN } from "../../qloo/urns.ts";
import { sameId } from "../../qloo/values.ts";
import { parseWarnings } from "../../qloo/warnings.ts";
import { rankBecause, tiedToVenue } from "../because.ts";
import { haversineM } from "../../../shared/geo.ts";
import { rankBy } from "../rank.ts";
import { hostsPeople } from "../hosts.ts";
import { kindOf } from "../../pair/groups.ts";
import type { Runner } from "../runner.ts";
import { plural, possessive } from "../../../shared/words.ts";
import type { ReadContext } from "./resolve.ts";

export { LOVED_RADIUS_M, LOVED_TAKE } from "../../../shared/engine.ts";
import { LOVED_RADIUS_M, LOVED_TAKE } from "../../../shared/engine.ts";
const WITHIN = `within ${LOVED_RADIUS_M / 1000} km`;

export interface LovedRead {
  places: LovedPlace[];
  ref: number;
}

function toPlace(e: QEntity, rank: number, n: number, tied: boolean, ctx: ReadContext, ref: number): LovedPlace {
  const lat = e.lat as number;
  const lng = e.lng as number;
  const of = plural(n, "place", "places");
  const reason = rankBecause(
    { ranked: `Ranked among ${of} ${WITHIN} for people who like ${ctx.name}`, area: `Listed among ${of} ${WITHIN} of ${ctx.name}` },
    e,
    tied,
    ctx,
    ref,
  );
  const p: LovedPlace = {
    id: e.id,
    name: e.name,
    type: "place",
    lat,
    lng,
    distanceM: Math.round(e.distanceM ?? haversineM(ctx.center, { lat, lng })),
    rank,
    tags: e.tags.map((t) => t.id),
    because: [reason],
  };
  const address = e.address ?? e.disambiguation;
  if (address) p.address = address;
  if (e.image) p.image = e.image;
  if (e.url) p.url = e.url;
  if (e.hours) p.hours = e.hours;
  const kind = kindOf(p);
  if (kind.group) p.kind = kind.word;
  p.hosts = hostsPeople(p);
  return p;
}

function placeLimits(found: number, unmapped: number, tied: boolean, ctx: ReadContext): string[] {
  const out: string[] = [];
  if (!found) out.push(`No places ${WITHIN} of ${ctx.name} came back.`);
  else if (found < 3) out.push(`Only ${plural(found, "place", "places")} ${WITHIN} came back from Qloo, so this part of the read is thin.`);
  if (found && !tied) out.push(`The nearby places came back with no tie to ${possessive(ctx.name)} audience, so their order is not a ranking of taste.`);
  if (unmapped) out.push(`${plural(unmapped, "place", "places")} came back without coordinates and ${unmapped === 1 ? "is" : "are"} not on the map.`);
  return out;
}

export async function lovedPlaces(run: Runner, ctx: ReadContext): Promise<{ loved: LovedRead | null; limits: string[] }> {
  const got = await run.call(
    "loved_places",
    "/v2/insights",
    {
      "filter.type": TYPE_URN.place,
      ...locationFilter(ctx.center.lat, ctx.center.lng, LOVED_RADIUS_M),
      "signal.interests.entities": ctx.entityId,
      "filter.exclude.entities": ctx.entityId,
      "feature.explainability": "true",
      take: String(LOVED_TAKE),
    },
    "Nearby places",
  );
  if (!got) return { loved: null, limits: [] };
  const all = rankBy(
    parseEntities(got.body).filter((e) => !sameId(e.id, ctx.entityId) && !e.closed),
    (e) => e.affinity,
  );
  const mapped = all.filter((e) => e.lat !== null && e.lng !== null);
  const venueDropped = parseWarnings(got.body).notFound.some((id) => sameId(id, ctx.entityId));
  const tied = !venueDropped && mapped.some((e) => tiedToVenue(e, ctx));
  const places = mapped.map((e, i) => toPlace(e, i + 1, mapped.length, tied, ctx, got.ref));
  return { loved: { places, ref: got.ref }, limits: placeLimits(mapped.length, all.length - mapped.length, tied, ctx) };
}
