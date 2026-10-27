import { buildIcs } from "../actions/ics.ts";
import { gcalUrl } from "../actions/links.ts";
import { longDate, nightWindow } from "../zones.ts";
import { esc, safeHref } from "./html.ts";
import { qrSvg } from "./qr.ts";
import { PAGE_CSS, PRINT_SCRIPT } from "./style.ts";

export interface PublicNight {
  slug: string;
  nightId: string;
  title: string;
  description: string;
  posterHeadline: string;
  posterSub: string;
  writtenBy: "model" | "template";
  date: string;
  start: string;
  end: string;
  tz: string;
  venueName: string;
  address?: string;
  city: string;
  lat: number;
  lng: number;
  why: string[];
  rsvps: number;
  going: boolean;
  published: { page: boolean; poster: boolean; ics: boolean };
}

export function eventUrl(origin: string, slug: string): string {
  return `${origin}/e/${slug}`;
}

export function placeLine(n: Pick<PublicNight, "venueName" | "address" | "city">): string {
  const rest = [n.address, n.city].filter((p): p is string => Boolean(p && p.trim()));
  const unique = rest.filter((p, i) => !(i > 0 && rest[0]?.toLowerCase().includes(p.toLowerCase())));
  return [n.venueName, ...unique].join(", ");
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function head(title: string, description: string, url: string): string {
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

export function calendarDetails(n: PublicNight, origin: string): string {
  return `${n.description.trim()}\n\nPicked with Qloo taste data.\n${eventUrl(origin, n.slug)}`;
}

function fascia(n: PublicNight): string {
  return `<header class="fascia"><p>Full House</p><p class="sign">${esc(n.venueName)}</p></header>`;
}

export function renderEventPage(n: PublicNight, origin: string, now: Date): string {
  const url = eventUrl(origin, n.slug);
  const when = `${longDate(n.date)}, ${n.start} to ${n.end}`;
  const desc = shortText(`${when} at ${n.venueName}. ${n.description}`, 200);
  const past = isPast(n, now);
  let calendar = "";
  try {
    const w = nightWindow(n, n.tz);
    const g = gcalUrl({ title: n.title, details: calendarDetails(n, origin), location: placeLine(n), start: w.start, end: w.end });
    calendar =
      `<section aria-labelledby="cal"><h2 id="cal">Add it to your calendar</h2><ul class="links">` +
      `<li><a href="/e/${esc(n.slug)}.ics">Apple, Outlook and others (.ics)</a></li>` +
      `<li><a href="${safeHref(g)}" rel="noopener noreferrer" target="_blank">Google Calendar</a></li></ul></section>`;
  } catch {
    calendar = "";
  }
  const why = n.why.length
    ? `<ul>${n.why.slice(0, 4).map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
    : `<p>This night was picked from what the streets around ${esc(n.venueName)} are into right now.</p>`;
  const rsvp = past
    ? `<p class="count">${n.rsvps} said they would come</p><p class="going">This night has passed.</p>`
    : `<p class="count" aria-live="polite">${n.rsvps} going</p>` +
      (n.going
        ? `<p class="going">You are on the list. See you there.</p>`
        : `<form method="post" action="/e/${esc(n.slug)}/rsvp"><button type="submit">I am going</button></form>`);
  const copyNote =
    n.writtenBy === "model"
      ? `<p class="note">Description written by a language model from the Qloo facts below. Every name in it was checked against them.</p>`
      : "";
  const address = [n.address, n.city].filter(Boolean).join(", ");
  return (
    head(`${n.title} at ${n.venueName}`, desc, url) +
    `<body>${fascia(n)}<main class="sheet">` +
    `<article class="flyer">` +
    `<p class="when">${esc(when)}</p>` +
    `<h1>${esc(n.title)}</h1>` +
    `<div class="desc">${paragraphs(n.description)}</div>` +
    `<p class="place">${esc(n.venueName)}${address ? `<span>${esc(address)}</span>` : ""}</p>` +
    `<p class="tz">Times are local to the venue (${esc(n.tz)}).</p>` +
    copyNote +
    `</article>` +
    `<section class="rsvp" id="rsvp" aria-label="Who is going">${rsvp}</section>` +
    `<section aria-labelledby="why"><h2 id="why">Why this night, here</h2>${why}` +
    `<p class="limits">Picked with Qloo taste data for the streets around ${esc(n.venueName)}. These are patterns for the area, not facts about any one person, and they say nothing about who will come. <a href="/#how">How this works</a></p></section>` +
    calendar +
    `<footer>${n.published.poster ? `<a href="/e/${esc(n.slug)}/poster">Printable poster</a>. ` : ""}Made with Full House for ${esc(n.venueName)}.</footer>` +
    `</main></body></html>`
  );
}

export function renderPoster(n: PublicNight, origin: string): string {
  const url = eventUrl(origin, n.slug);
  const shortUrl = url.replace(/^https?:\/\//, "");
  const when = `${longDate(n.date)}, ${n.start} to ${n.end}`;
  const reason = n.why[0] ?? `Picked from what the streets around ${n.venueName} are into right now.`;
  let qr = "";
  try {
    qr = `<div class="p-qr">${qrSvg(url, `QR code for ${shortUrl}`)}</div>`;
  } catch {
    qr = "";
  }
  return (
    head(`Poster: ${n.title}`, `${n.title} at ${n.venueName}, ${when}`, `${url}/poster`) +
    `<body><div class="print-bar"><button id="print" type="button">Print the poster</button><span>A4 portrait. Turn off headers and footers in the print dialog.</span></div>` +
    `<main class="poster">` +
    `<p class="when">${esc(when)}</p>` +
    `<h1>${esc(n.posterHeadline || n.title)}</h1>` +
    (n.posterSub ? `<p class="p-sub">${esc(n.posterSub)}</p>` : "") +
    `<p class="p-where"><strong>${esc(n.venueName)}</strong>${n.address ? `<br>${esc(n.address)}` : ""}</p>` +
    `<p class="p-why">${esc(reason)}</p>` +
    `<div class="p-foot"><div><p class="p-url">${esc(shortUrl)}</p><p class="p-src">Picked with Qloo taste data. Scan the code or type the link to say you are coming.</p></div>${qr}</div>` +
    `</main><script>${PRINT_SCRIPT}</script></body></html>`
  );
}

export function renderIcs(n: PublicNight, origin: string, now: Date): string {
  const w = nightWindow(n, n.tz);
  return buildIcs({
    uid: `${n.nightId}@fullhouse`,
    start: w.start,
    end: w.end,
    stamp: now,
    summary: `${n.title} at ${n.venueName}`,
    description: calendarDetails(n, origin),
    location: placeLine(n),
    url: eventUrl(origin, n.slug),
    geo: { lat: n.lat, lng: n.lng },
  });
}

export function renderMissing(): string {
  return (
    head("Night not found", "This night is not on Full House.", "/") +
    `<body><header class="fascia"><p class="sign">Full House</p></header><main class="sheet"><h2>That night is not here</h2>` +
    `<p>The link may be mistyped, or the venue took the night down.</p></main></body></html>`
  );
}
