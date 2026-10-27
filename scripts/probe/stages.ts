import type { Resolution } from "./context.ts";
import { followUpFrom, gameUrnFrom, localitiesFrom, resolveVenue } from "./derive.ts";
import { experimentCalls } from "./experiments.ts";
import { cityCall, followUpCalls, globalCalls, resolveCalls, streetCalls, type CityLocalities, type FollowUp, type ResolvedVenue } from "./plan.ts";
import type { Runner } from "./runner.ts";
import { EXPERIMENT_PREFERENCE, citiesOf, type ProbeVenue } from "./venues.ts";

// The app's route comes first so a venue counts as resolved the way the app would resolve it whenever that works.
const RESOLVE_ORDER = ["search_near", "search_near_city", "search_name_city", "search_name_only", "search_untyped"];
const EMPTY_CITY: CityLocalities = { app: null, best: null, all: [] };

export async function cityStage(runner: Runner, venues: ProbeVenue[]): Promise<Map<string, CityLocalities>> {
  const cities = citiesOf(venues);
  const records = await runner.runAll(cities.map(cityCall));
  return new Map(cities.map((c, i) => [c, localitiesFrom(records[i])]));
}

export async function globalStage(runner: Runner, localities: Map<string, CityLocalities>, now: Date): Promise<string> {
  const anchor = [...localities.values()].map((l) => l.best).find((l) => l && l.lat !== null && l.lng !== null);
  if (!anchor || anchor.lat === null || anchor.lng === null) throw new Error("No city resolved to coordinates; check the key and the search endpoint.");
  return gameUrnFrom(await runner.runAll(globalCalls({ lat: anchor.lat, lng: anchor.lng }, now)));
}

export async function resolveStage(runner: Runner, venues: ProbeVenue[], localities: Map<string, CityLocalities>): Promise<Map<string, Resolution>> {
  const out = new Map<string, Resolution>();
  await Promise.all(
    venues.map(async (v) => {
      const loc = localities.get(v.city) ?? EMPTY_CITY;
      const recs = await runner.runAll(resolveCalls(v, loc));
      const ordered = RESOLVE_ORDER.flatMap((call) => recs.filter((r) => r.call === call));
      const hit = resolveVenue(v, ordered, loc);
      if (hit) out.set(v.slug, hit);
    }),
  );
  return out;
}

export async function streetStage(runner: Runner, resolved: ResolvedVenue[], gameUrn: string, now: Date): Promise<Map<string, FollowUp>> {
  await Promise.all(resolved.map((v) => runner.runAll(streetCalls(v, gameUrn))));
  const followUps = new Map(resolved.map((v) => [v.venue.slug, followUpFrom(v, runner.byScope(v.venue.slug), gameUrn)]));
  await Promise.all(resolved.map((v) => runner.runAll(followUpCalls(v, followUps.get(v.venue.slug)!, now))));
  return followUps;
}

export async function experimentStage(
  runner: Runner,
  resolutions: Map<string, Resolution>,
  followUps: Map<string, FollowUp>,
  gameUrn: string,
  now: Date,
): Promise<string[]> {
  const slugs = EXPERIMENT_PREFERENCE.filter((slug) => resolutions.has(slug) && followUps.has(slug)).slice(0, 3);
  await Promise.all(slugs.map((slug, slot) => runner.runAll(experimentCalls(resolutions.get(slug)!.resolved, followUps.get(slug)!, gameUrn, now, slot))));
  return slugs;
}
