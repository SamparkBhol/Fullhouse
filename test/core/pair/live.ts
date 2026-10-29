import { readFileSync } from "node:fs";
import type { LovedPlace, Venue, VenueCandidate } from "../../../src/shared/contract.ts";
import { parseEntities, type QEntity } from "../../../src/core/qloo/entities.ts";

export function liveBody(name: string): any {
  return JSON.parse(readFileSync(new URL(`../../fixtures/live/${name}.json`, import.meta.url), "utf8")).body;
}

export function liveEntities(name: string): QEntity[] {
  return parseEntities(liveBody(name));
}

function candidateOf(e: QEntity): VenueCandidate {
  const c: VenueCandidate = { id: e.id, name: e.name, type: "place", lat: e.lat ?? 0, lng: e.lng ?? 0, tags: e.tags.map((t) => t.id) };
  if (e.address) c.address = e.address;
  if (e.hours) c.hours = e.hours;
  if (e.url) c.url = e.url;
  if (e.neighborhood) c.neighborhood = e.neighborhood;
  return c;
}

export function liveVenue(search: string, id: string, city: string): Venue {
  const entity = candidateOf(liveEntities(search)[0]!);
  return {
    id,
    entity,
    city,
    tz: "America/New_York",
    quietSlot: { weekday: 2, start: "19:00", durationMin: 180 },
    capacity: 40,
    createdAt: "2026-10-20T10:00:00.000Z",
  };
}

// The loved places as the read keeps them: Qloo's order, ranked from 1.
export function livePlaces(name: string): LovedPlace[] {
  return liveEntities(name)
    .filter((e) => e.lat !== null && e.lng !== null && !e.closed)
    .map((e, i) => {
      const p: LovedPlace = {
        id: e.id,
        name: e.name,
        type: "place",
        lat: e.lat as number,
        lng: e.lng as number,
        distanceM: Math.round(e.distanceM ?? 0),
        rank: i + 1,
        tags: e.tags.map((t) => t.id),
        because: [{ kind: "explainability", text: "Ranked among the places nearby", provenance: 2 }],
      };
      if (e.address) p.address = e.address;
      if (e.hours) p.hours = e.hours;
      if (e.url) p.url = e.url;
      if (e.image) p.image = e.image;
      return p;
    });
}

export const REGGIO = (): Venue => liveVenue("reggio_search", "reggio", "New York");
export const HOUSING_WORKS = (): Venue => liveVenue("hw_search", "housing-works", "New York");

export function placeNamed(places: LovedPlace[], name: string): LovedPlace {
  const p = places.find((x) => x.name === name);
  if (!p) throw new Error(`no ${name} in the fixture`);
  return p;
}
