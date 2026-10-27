import type { Venue } from "../../../shared/contract.ts";
import { QlooError } from "../../qloo/errors.ts";
import { checkLatLng } from "../../qloo/location.ts";

export interface ReadContext {
  venue: Venue;
  entityId: string;
  name: string;
  center: { lat: number; lng: number };
  ownTags: Set<string>;
  now: Date;
}

// The search hit stored at onboarding already holds the id, point and tags, so this step makes no call.
export function resolveVenue(venue: Venue, now: Date): ReadContext {
  const { id, name, lat, lng, tags } = venue.entity;
  if (!id) throw new QlooError("bad_request", 0, "The venue has no Qloo id");
  checkLatLng(lat, lng);
  return { venue, entityId: id, name, center: { lat, lng }, ownTags: new Set(tags), now };
}
