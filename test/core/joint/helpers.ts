import type { LovedPlace, Match, QlooType, Rising } from "../../../src/shared/contract.ts";
import { VENUE_ID } from "../../fixtures/street.ts";

export const PARTNER_ID = "A1B2C3D4-5555-4A2B-9C3D-0E1F2A3B4C15";

export function pick(name: string, type: QlooType, rank: number, venue: number, partner: number): Rising {
  return {
    id: `${type}-${rank}`,
    name,
    type,
    rank,
    trend: "unknown",
    venueSignal: true,
    tags: [],
    because: [{ kind: "explainability", text: `Ranked among 10 for people who like Cafe Lumen and Grand Street Cinema`, provenance: 7 }],
    explain: [
      { entityId: VENUE_ID, share: venue },
      { entityId: PARTNER_ID, share: partner },
    ],
  };
}

export const CINEMA: LovedPlace = {
  id: PARTNER_ID,
  name: "Grand Street Cinema",
  type: "place",
  lat: 40.722,
  lng: -73.957,
  distanceM: 741,
  rank: 5,
  tags: ["urn:tag:genre:place:movie_theater", "urn:tag:genre:place:tourist_attraction"],
  because: [{ kind: "explainability", text: "Ranked among 5 places within 1.2 km for people who like Cafe Lumen", provenance: 2 }],
  url: "https://grandstreetcinema.example",
};

export function matchWith(partner: LovedPlace = CINEMA, at = "2026-10-25T15:00:00.000Z"): Match {
  return {
    partner,
    runnersUp: [],
    shared: [
      { id: "urn:tag:genre:music:jazz", name: "Jazz", namespace: "urn:tag:genre:music", rank: 1 },
      { id: "urn:tag:genre:media:documentary", name: "Documentary", namespace: "urn:tag:genre:media", rank: 2 },
      { id: "urn:tag:ambience:qloo:cozy", name: "Cozy", namespace: "urn:tag:ambience:qloo", rank: 3 },
    ],
    readAt: at,
    provenance: [2, 4, 5],
  };
}
