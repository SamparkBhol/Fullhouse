import { gcalUrl } from "../actions/links.ts";
import { describeDate } from "../../core/index.ts";
import { nightWindow } from "../zones.ts";
import { calendarDetails } from "./calendar.ts";
import { zoneCity } from "./guest.ts";
import { headWithArt, ledgeHtml, partnerSection, type PublicArt } from "./event_art.ts";
import { esc, safeHref } from "./html.ts";
import { plainName } from "../../shared/words.ts";
import { PAGE_CSS } from "./style.ts";

export { renderIcs, calendarDetails } from "./calendar.ts";
export { renderPoster } from "./poster.ts";

// Below this the count says more about an empty room than about the night, so the page leaves it out.
export const COUNT_SHOWN_FROM = 3;

// Only set once the partner said yes on its invite page.
export interface PublicPartner {
  name: string;
  walkMin: number;
  image?: string;
  hosts: boolean;
}

export interface PublicNight {
  slug: string;
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
  return n.title.toLowerCase().includes(n.venueName.toLowerCase()) ? n.title : `${n.title} at ${n.venueName}`;
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

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function head(title: string, description: string, url: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="robots" content="noindex, nofollow">` +
    `<title>${esc(title)}</title>` +
    `<meta name="description" content="${esc(description)}">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:site_name" content="Full House">` +
    `<meta property="og:title" content="${esc(title)}">` +
    `<meta property="og:description" content="${esc(description)}">` +
    `<meta property="og:url" content="${esc(url)}">` +
    `<meta name="twitter:card" content="summary">` +
    `<style>${PAGE_CSS}</style></head>`
  );
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

// Until the venue confirms it, the page says plainly who posted it, so nobody mistakes it for the venue's own word.
export function postedBy(n: Pick<PublicNight, "venueName" | "verified">): string {
  const v = esc(n.venueName);
  return n.verified ? `Made with Full House for ${v}.` : `Posted on Full House by whoever set up ${v}. ${v} has not confirmed it.`;
}

function fascia(n: PublicNight): string {
  return `<header class="fascia"><p>Full House</p><p class="sign">${esc(n.venueName)}</p></header>`;
}

export function renderEventPage(n: PublicNight, origin: string, now: Date): string {
  const url = eventUrl(origin, n.slug);
  const when = `${describeDate(n.date)}, ${n.start} to ${n.end}`;
  const desc = shortText(`${when} at ${n.venueName}. ${n.description}`, 200);
  const past = isPast(n, now);
  let calendar = "";
  try {
    const w = nightWindow(n, n.tz);
    const g = gcalUrl({ title: n.title, details: calendarDetails(n, origin), location: placeLine(n), start: w.start, end: w.end });
    calendar = ledgeHtml(
      "cal",
      "Add it to your calendar",
      `<ul class="links"><li><a href="/e/${esc(n.slug)}.ics">Apple, Outlook and others (.ics)</a></li>` +
        `<li><a href="${safeHref(g)}" rel="noopener noreferrer" target="_blank">Google Calendar</a></li></ul>`,
    );
  } catch {
    calendar = "";
  }
  const counted = n.rsvps >= COUNT_SHOWN_FROM;
  const rsvp = past
    ? `${counted ? `<p class="count">${n.rsvps} said they would come</p>` : ""}<p class="going">This night has passed.</p>`
    : (counted ? `<p class="count" aria-live="polite">${n.rsvps} said they are coming</p>` : "") +
      (n.going
        ? `<p class="going">You are on the list. See you there.</p>`
        : `<form method="post" action="/e/${esc(n.slug)}/rsvp"><button type="submit">I am going</button></form>`);
  const copyNote =
    n.writtenBy === "model"
      ? `<p class="note">Description written by a language model from the Qloo facts below. Every name in it was checked against them.</p>`
      : n.writtenBy === "owner"
        ? `<p class="note">Description written by the venue.</p>`
        : "";
  const address = addressLine(n);
  return (
    head(titleAt(n), desc, url) +
    `<body>${fascia(n)}<main class="sheet">` +
    `<section class="win win-big${past ? " win-dark" : ""}" aria-label="The night"><div class="win-frame"><div class="win-room">` +
    (past ? "" : `<span class="pendant" aria-hidden="true"></span>`) +
    `<div class="win-inside"><article class="flyer${past ? "" : " lit"}">` +
    `<p class="when"><span>${esc(describeDate(n.date))}</span><span>${esc(`${n.start} to ${n.end}`)}</span></p>` +
    (n.kind ? `<p class="kind">${esc(n.kind)}${n.partner ? ` with ${esc(plainName(n.partner.hosts ? n.venueName : n.partner.name))}` : ""}</p>` : "") +
    headWithArt(`<h1>${esc(n.feature || n.title)}</h1>`, n.art) +
    (n.by ? `<p class="by">${esc(n.by)}</p>` : "") +
    `<div class="desc">${paragraphs(n.description)}</div>` +
    `<p class="place">${esc(plainName(n.placeName ?? n.venueName))}${address ? `<span>${esc(address)}</span>` : ""}</p>` +
    `<p class="tz">Times are local to the venue, ${esc(zoneCity(n.tz))}.</p>` +
    copyNote +
    `</article>` +
    `<section class="rsvp" id="rsvp" aria-label="Who is going">${rsvp}</section>` +
    `</div></div></div><div class="win-sill" aria-hidden="true"></div></section>` +
    ledgeHtml(
      "why",
      "Why this night, here",
      (n.reason ? `<p>${esc(n.reason)}.</p>` : "") +
        `<p class="limits">${esc(n.source)}. It is a pattern across many people, not a fact about any one person, and it says nothing about who will come. <a href="/how">How this works</a></p>`,
    ) +
    partnerSection(n.partner, n.venueName) +
    calendar +
    `<footer><p>${n.published.poster ? `<a href="/e/${esc(n.slug)}/poster">Printable poster</a>. ` : ""}${postedBy(n)}</p>` +
    `<form method="post" action="/e/${esc(n.slug)}/report"><button class="quiet" type="submit">Report this page</button></form></footer>` +
    `</main></body></html>`
  );
}

export function renderMissing(): string {
  return (
    head("Night not found", "This night is not on Full House.", "/") +
    `<body><header class="fascia"><p class="sign">Full House</p></header><main class="sheet"><h2>That night is not here</h2>` +
    `<p>The link may be mistyped, or the night was taken down.</p></main></body></html>`
  );
}

export function renderReported(hidden: boolean): string {
  return (
    head("Report received", "Thanks for telling us.", "/") +
    `<body><header class="fascia"><p class="sign">Full House</p></header><main class="sheet"><h2>Thanks, the report is in</h2>` +
    `<p>${hidden ? "Enough people reported this page that it is offline until the person who set it up puts it back." : "The person who set this page up can see reports. Pages that several people report go offline."}</p></main></body></html>`
  );
}
