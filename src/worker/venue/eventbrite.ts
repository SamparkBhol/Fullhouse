import type { Venue } from "../../shared/contract.ts";
import { eventbriteOrganization } from "../actions/eventbrite.ts";
import { seal, unseal } from "../tokens.ts";
import { fail, noVenue, ok, type Out, type VenueDeps } from "./api.ts";
import type { EventbriteRecord, VenueRecords } from "./records.ts";

// The private token is checked with one call, then kept sealed with a key derived from TOKEN_SECRET.
export async function connectEventbrite(records: VenueRecords, deps: VenueDeps, token: string): Promise<Out<{ organization: string }>> {
  const venue = await records.venue();
  if (!venue) return noVenue();
  const org = await eventbriteOrganization(token, deps.fetch);
  if (!org.ok) return fail(400, "eventbrite_rejected", org.reason);
  const rec: EventbriteRecord = {
    sealed: await seal(deps.secret, venue.id, token),
    organizationId: org.org.id,
    organization: org.org.name,
  };
  await records.store.put("eventbrite", rec);
  await records.store.put("venue", { ...venue, eventbrite: { organization: org.org.name } });
  return ok({ organization: org.org.name });
}

export async function disconnectEventbrite(records: VenueRecords): Promise<Out<{ disconnected: true }>> {
  const venue = await records.venue();
  if (!venue) return noVenue();
  await records.store.delete("eventbrite");
  const { eventbrite: _drop, ...rest } = venue;
  await records.store.put("venue", rest);
  return ok({ disconnected: true });
}

export async function eventbriteToken(records: VenueRecords, deps: VenueDeps, venue: Venue): Promise<{ token: string; organizationId: string } | null> {
  const rec = await records.store.get<EventbriteRecord>("eventbrite");
  if (!rec) return null;
  try {
    return { token: await unseal(deps.secret, venue.id, rec.sealed), organizationId: rec.organizationId };
  } catch {
    console.error("eventbrite token could not be decrypted");
    return null;
  }
}
