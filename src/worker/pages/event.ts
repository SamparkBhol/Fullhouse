import { gcalUrl } from "../actions/links.ts";
import { describeDate } from "../../core/index.ts";
import { nightWindow } from "../zones.ts";
import { calendarDetails } from "./calendar.ts";
import { footer, head, panel, topBar, unconfirmedWord } from "./chrome.ts";
import { zoneCity } from "./guest.ts";
import { headWithArt, partnerSection, type PublicArt } from "./event_art.ts";
import { esc, safeHref } from "./html.ts";
import { plainName, shortName } from "../../shared/words.ts";
import { mapLink, stopsHtml, type PublicStop } from "./stops.ts";

export { renderIcs, calendarDetails } from "./calendar.ts";
export { renderPoster } from "./poster.ts";
export { renderMissing, renderReported } from "./chrome.ts";

// Below this the count says more about an empty room than about the night, so the page leaves it out.
export const COUNT_SHOWN_FROM = 3;

// Only set once the partner said yes on its invite page. The page says how that yes was given and what it covers.
export interface PublicPartner {
  name: string;
  walkMin: number;
  image?: string;
  hosts: boolean;
  answered?: "link";
  // The partner typed its own stop time and what runs there; until then its stop is proposed.
  confirmed?: boolean;
  tellsRegulars?: boolean;
}

export interface PublicNight {
  slug: string;
  // A short second address for the same page, for the poster.
  shortSlug?: string;
  nightId: string;
  title: string;
  description: string;
  posterHeadline: string;
  posterSub: string;
  kind?: string;
  feature?: string;
  by?: string;
  art?: PublicArt;
  partner?: PublicPartner;
  // Both stops, set only once the partner said yes, because they name the partner.
  stops?: PublicStop[];
  // Which of the two share links the guest came through, so their RSVP counts for that place.
  via?: string;
  writtenBy: "model" | "template" | "owner";
  date: string;
  start: string;
  end: string;
  tz: string;
  venueName: string;
  placeName?: string;
  address?: string;
  city: string;
  lat: number;
  lng: number;
  reason: string;
  source: string;
  verified: boolean;
  rsvps: number;
  going: boolean;
  published: { page: boolean; poster: boolean; ics: boolean };
}

export function titleAt(n: Pick<PublicNight, "title" | "venueName">): string {
  const v = plainName(n.venueName);
  return n.title.toLowerCase().includes(shortName(v).toLowerCase()) ? n.title : `${n.title} at ${v}`;
}

export function eventUrl(origin: string, slug: string): string {
  return `${origin}/e/${slug}`;
}

export function placeLine(n: Pick<PublicNight, "venueName" | "placeName" | "address" | "city">): string {
  const rest = [n.address, n.city].filter((p): p is string => Boolean(p && p.trim()));
  const unique = rest.filter((p, i) => !(i > 0 && rest[0]?.toLowerCase().includes(p.toLowerCase())));
  return [n.placeName ?? n.venueName, ...unique].join(", ");
}

// Qloo's street address usually ends with the city already.
export function addressLine(n: Pick<PublicNight, "address" | "city">): string {
  if (n.address && n.address.toLowerCase().includes(n.city.toLowerCase())) return n.address;
  return [n.address, n.city].filter(Boolean).join(", ");
}

// The page credits Qloo once, in this footer line.
export function creditLine(n: Pick<PublicNight, "source">): string {
  return `${n.source.trim() || "Taste data from Qloo"}. Plan by Full House.`;
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function shortText(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trim()}...`;
}

export function isPast(n: Pick<PublicNight, "date" | "start" | "end" | "tz">, now: Date): boolean {
  try {
    return nightWindow(n, n.tz).end.getTime() < now.getTime();
  } catch {
    return false;
  }
}

// Who made the page, for the footer. The unconfirmed state is a word beside the venue's name, not a sentence here.
export function postedBy(n: Pick<PublicNight, "venueName" | "verified">): string {
  const v = esc(plainName(n.venueName));
  return n.verified ? `Made with Full House for ${v}, confirmed by ${v}.` : `Made with Full House for ${v}.`;
}

export function venueState(n: Pick<PublicNight, "venueName" | "verified">): string {
  return n.verified ? "" : unconfirmedWord(plainName(n.venueName));
}

function calendarLinks(n: PublicNight, origin: string): string {
  try {
    const w = nightWindow(n, n.tz);
    const g = gcalUrl({ title: n.title, details: calendarDetails(n, origin), location: placeLine(n), start: w.start, end: w.end });
    return (
      `<div class="cal"><h3>Add it to your calendar</h3><ul class="links"><li><a href="/e/${esc(n.slug)}.ics">Apple, Outlook and others (.ics)</a></li>` +
      `<li><a href="${safeHref(g)}" rel="noopener noreferrer" target="_blank">Google Calendar</a></li></ul></div>`
    );
  } catch {
    return "";
  }
}

function rsvpPanel(n: PublicNight, past: boolean, origin: string): string {
  const counted = n.rsvps >= COUNT_SHOWN_FROM;
  const body = past
    ? `${counted ? `<p class="count">${n.rsvps} said they would come</p>` : ""}<p class="going">This night has passed.</p>`
    : `<h2>Are you going?</h2>` +
      (counted ? `<p class="count" aria-live="polite">${n.rsvps} said they are coming</p>` : "") +
      (n.going
        ? `<p class="going">You are on the list. See you there.</p>`
        : `<form method="post" action="/e/${esc(n.slug)}/rsvp${n.via ? `?via=${esc(n.via)}` : ""}"><button class="btn" type="submit">I am going</button></form>`);
  return `<section class="panel rsvp" id="rsvp" aria-label="Who is going">${body}${calendarLinks(n, origin)}</section>`;
}

function wherePanel(n: PublicNight): string {
  const tz = `<p class="tz">Times are local to the venue, ${esc(zoneCity(n.tz))}.</p>`;
  if (n.stops) return panel("where-title", "The evening", stopsHtml(n.stops) + tz);
  const name = plainName(n.placeName ?? n.venueName);
  const address = addressLine(n);
  const map = n.address ? mapLink(name, address) : "";
  return panel("where-title", "Where", `<p class="place">${esc(name)}${address ? `<span>${esc(address)}</span>` : ""}</p>${map}${tz}`);
}

function whyPanel(n: PublicNight): string {
  return panel(
    "why-title",
    "Why this night, here",
    (n.reason ? `<p>${esc(n.reason)}.</p>` : "") +
      `<p class="limits">A pattern across many people, not a fact about any one person, and it says nothing about who will come. <a href="/how">How this works</a></p>`,
    "why",
  );
}

function copyNote(n: PublicNight): string {
  if (n.writtenBy === "model") return `<p class="note">Description written by a language model from the facts below. Every name in it was checked against them.</p>`;
  if (n.writtenBy === "owner") return `<p class="note">Description written by the venue.</p>`;
  return "";
}

// A two stop night is headed by its own title, which names both halves; a night at one place by its feature.
// A long title is cut at its subtitle, the way a window card would print it.
export function headline(n: Pick<PublicNight, "feature" | "title" | "stops">): string {
  const text = n.stops?.length ? n.title : n.feature || n.title;
  const cut = /^(.{4,}?)\s*[:(]/.exec(text);
  return text.length > 32 && cut?.[1] ? cut[1].trim() : text;
}

export function renderEventPage(n: PublicNight, origin: string, now: Date): string {
  const url = eventUrl(origin, n.slug);
  const when = `${describeDate(n.date)}, ${n.start} to ${n.end}`;
  const past = isPast(n, now);
  const withName = n.partner ? shortName(n.partner.hosts ? n.venueName : n.partner.name) : "";
  const top =
    `<div class="event-head">` +
    `<p class="when"><span>${esc(describeDate(n.date))}</span><span>${esc(`${n.start} to ${n.end}`)}</span></p>` +
    (n.kind ? `<p class="kind">${esc(n.kind)}${withName ? ` with ${esc(withName)}` : ""}</p>` : "") +
    headWithArt(`<h1${headline(n).length > 32 ? ' class="long"' : ""}>${esc(headline(n))}</h1>`, n.art) +
    (n.by ? `<p class="by">${esc(n.by)}</p>` : "") +
    `<div class="desc">${paragraphs(n.description)}</div>${copyNote(n)}</div>`;
  const acts =
    (n.published.poster ? `<a href="/e/${esc(n.slug)}/poster">Printable poster</a>` : "") +
    `<form method="post" action="/e/${esc(n.slug)}/report"><button class="btn btn-quiet btn-small" type="submit">Report this page</button></form>`;
  return (
    head(titleAt(n), shortText(`${when} at ${plainName(n.venueName)}. ${n.description}`, 200), url) +
    `<body>${topBar(plainName(n.venueName), venueState(n))}<main class="screen"><div class="wrap event">${top}` +
    `<div class="event-side">${rsvpPanel(n, past, origin)}${partnerSection(n.partner, n.venueName)}</div>` +
    `<div class="event-body">${wherePanel(n)}${whyPanel(n)}</div>` +
    `</div></main>${footer([esc(creditLine(n)), postedBy(n)], acts)}</body></html>`
  );
}
