import { isPast, type PublicNight } from "../pages/event.ts";
import { fail, ok, type Out, type VenueDeps } from "./api.ts";
import type { VenueRecords } from "./records.ts";

export async function publicNight(records: VenueRecords, slug: string, browser: string | null): Promise<Out<PublicNight>> {
  const found = await records.nightBySlug(slug);
  if (!found) return fail(404, "night_not_found");
  const { venue, rec } = found;
  const n = rec.night;
  const going = browser ? (await records.store.get<number>(`rsvp:${n.id}:${browser}`)) !== undefined : false;
  const pub: PublicNight = {
    slug,
    nightId: n.id,
    title: n.copy.eventTitle,
    description: n.copy.eventDescription,
    posterHeadline: n.copy.posterHeadline,
    posterSub: n.copy.posterSub,
    writtenBy: n.copy.writtenBy,
    date: n.date,
    start: n.start,
    end: n.end,
    tz: venue.tz,
    venueName: venue.entity.name,
    city: venue.city,
    lat: venue.entity.lat,
    lng: venue.entity.lng,
    why: n.why.map((b) => b.text).filter((t) => typeof t === "string" && t.trim().length > 0),
    rsvps: n.rsvps,
    going,
    published: rec.published,
  };
  if (venue.entity.address) pub.address = venue.entity.address;
  return ok(pub);
}

export async function rsvp(records: VenueRecords, deps: VenueDeps, slug: string, browser: string): Promise<Out<{ count: number; already: boolean }>> {
  const found = await records.nightBySlug(slug);
  if (!found || !found.rec.published.page) return fail(404, "night_not_found");
  const { rec, venue } = found;
  if (isPast({ date: rec.night.date, start: rec.night.start, end: rec.night.end, tz: venue.tz }, deps.now())) {
    return fail(409, "night_passed", "This night has already happened.");
  }
  const key = `rsvp:${rec.night.id}:${browser}`;
  if ((await records.store.get<number>(key)) !== undefined) return ok({ count: rec.night.rsvps, already: true });
  await records.store.put(key, 1);
  rec.night.rsvps += 1;
  await records.store.put(`night:${rec.night.id}`, rec);
  return ok({ count: rec.night.rsvps, already: false });
}
