import type { Invite, LovedPlace, Night } from "../../shared/contract.ts";
import { proxiedImage } from "../../shared/images.ts";
import { plainName } from "../../shared/words.ts";
import { isPast, type PublicNight, type PublicPartner } from "../pages/event.ts";
import { featureArt } from "../pages/event_art.ts";
import { guestLine, guestSource } from "../pages/guest.ts";
import { recordEvent } from "../stats/events.ts";
import { rsvpEvent } from "../stats/makers.ts";
import { fail, ok, type Out, type VenueDeps } from "./api.ts";
import { kindOf, walkMinutes } from "./invites.ts";
import { publicStops } from "../pages/stops.ts";
import { counted, knownVia, sideOf, viaCodes } from "./ledger.ts";
import type { VenueRecords } from "./records.ts";

function placeOf(n: Night, invite: Invite): LovedPlace | undefined {
  const id = invite.partner.id.toUpperCase();
  return [n.match?.partner, ...n.partners].find((p): p is LovedPlace => Boolean(p) && (p as LovedPlace).id.toUpperCase() === id);
}

// A partner is named in public only once its invite says accepted. The page says how the yes was given, and whether
// the partner confirmed its own stop or only pressed a button.
function partnerView(n: Night, invite: Invite): { view: PublicPartner; place: LovedPlace | undefined } {
  const place = placeOf(n, invite);
  const hosts = n.match?.host === "partner" && n.match.partner.id.toUpperCase() === invite.partner.id.toUpperCase();
  const c = invite.confirmed;
  const view: PublicPartner = {
    name: plainName(invite.partner.name),
    walkMin: walkMinutes(place?.distanceM ?? 0),
    hosts,
    answered: "link",
    confirmed: Boolean(c && (c.start || c.what)),
    tellsRegulars: c?.tellsRegulars === true,
  };
  const image = proxiedImage(place?.image ?? invite.partner.image);
  if (image) view.image = image;
  return { view, place };
}

export async function publicNight(records: VenueRecords, slug: string, browser: string | null, via?: string): Promise<Out<PublicNight>> {
  const found = await records.nightBySlug(slug);
  if (!found) return fail(404, "night_not_found");
  const { venue, rec } = found;
  const n = rec.night;
  const going = browser ? (await records.store.get<number>(`rsvp:${n.id}:${browser}`)) !== undefined : false;
  const accepted = await records.accepted(n.id);
  const partner = accepted ? partnerView(n, accepted) : null;
  const partnerName = partner ? plainName(partner.view.name) : undefined;
  const pub: PublicNight = {
    slug,
    nightId: n.id,
    title: n.copy.eventTitle,
    description: n.copy.eventDescription,
    posterHeadline: n.copy.posterHeadline,
    posterSub: n.copy.posterSub,
    writtenBy: n.copy.editedByOwner ? "owner" : n.copy.writtenBy,
    date: n.date,
    start: n.start,
    end: n.end,
    tz: venue.tz,
    venueName: venue.entity.name,
    city: venue.city,
    lat: venue.entity.lat,
    lng: venue.entity.lng,
    reason: guestLine(n, venue.entity.name, partnerName),
    ...(n.shortSlug ? { shortSlug: n.shortSlug } : {}),
    // The credit names the partner once the partner has set its own part, because the poster prints the same line.
    source: guestSource(venue.entity.name, partner?.view.confirmed ? partnerName : undefined),
    verified: venue.verified === true,
    rsvps: n.rsvps,
    going,
    published: rec.published,
    kind: kindOf(n),
  };
  if (venue.entity.address) pub.address = venue.entity.address;
  if (partner) {
    pub.partner = partner.view;
    const stops = publicStops(n.pair?.stops, { venue: venue.entity.address, partner: n.match?.partner.address });
    if (stops) pub.stops = stops.map((s) => (s.at === "partner" && !partner.view.confirmed ? { ...s, proposed: true } : s));
    if (partner.view.hosts && partner.place) {
      pub.placeName = partner.place.name;
      pub.lat = partner.place.lat;
      pub.lng = partner.place.lng;
      if (partner.place.address) pub.address = partner.place.address;
      else delete pub.address;
    }
  }
  const known = knownVia(via, viaCodes(n, venue));
  if (known) pub.via = known;
  if (n.feature) pub.feature = n.feature.name;
  if (n.feature?.by) pub.by = n.feature.by;
  const art = featureArt(n);
  if (art) pub.art = art;
  return ok(pub);
}

export async function rsvp(records: VenueRecords, deps: VenueDeps, slug: string, browser: string, via?: string): Promise<Out<{ count: number; already: boolean }>> {
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
  rec.night.ledger = counted(rec.night.ledger, sideOf(via, viaCodes(rec.night, venue)));
  await records.store.put(`night:${rec.night.id}`, rec);
  recordEvent(deps.stats, rsvpEvent(venue));
  return ok({ count: rec.night.rsvps, already: false });
}
