import { buildIcs } from "../actions/ics.ts";
import { plainName, shortName } from "../../shared/words.ts";
import { nightWindow } from "../zones.ts";
import { eventUrl, placeLine, titleAt, type PublicNight } from "./event.ts";

// The partner joins the calendar text only once it said yes, like everywhere else in public.
export function calendarDetails(n: PublicNight, origin: string): string {
  const link = n.published.page ? `\n${eventUrl(origin, n.slug)}` : "";
  const withLine = n.partner ? `\n\nPut on by ${plainName(n.venueName)} and ${shortName(n.partner.name)}.` : "";
  return `${n.description.trim()}${withLine}\n\nPicked with Qloo taste data.${link}`;
}

export function renderIcs(n: PublicNight, origin: string, now: Date): string {
  const w = nightWindow(n, n.tz);
  return buildIcs({
    uid: `${n.nightId}@fullhouse`,
    start: w.start,
    end: w.end,
    stamp: now,
    summary: titleAt(n),
    description: calendarDetails(n, origin),
    location: placeLine(n),
    ...(n.published.page ? { url: eventUrl(origin, n.slug) } : {}),
    geo: { lat: n.lat, lng: n.lng },
  });
}
