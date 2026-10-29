import type { CrowdSplit, InviteStatus } from "../../shared/contract.ts";
import { describeDate } from "../../core/index.ts";
import { capFirst, listWords, plainName } from "../../shared/words.ts";
import { headWithArt, ledgeHtml, type PublicArt } from "./event_art.ts";
import { head } from "./event.ts";
import { tagWords, zoneCity } from "./guest.ts";
import { esc } from "./html.ts";

export interface InvitePlace {
  name: string;
  image?: string;
  address?: string;
}

export interface PublicInvite {
  slug: string;
  status: InviteStatus;
  answeredAt?: string;
  venue: InvitePlace;
  partner: InvitePlace;
  walkMin: number;
  verified: boolean;
  night: { date: string; start: string; end: string; tz: string; kind?: string; feature?: string; by?: string; art?: PublicArt; at: string };
  split: CrowdSplit | null;
  shared: string[];
}

export const AGGREGATE_LINE = "A pattern across many people, not a fact about anyone.";

function card(p: InvitePlace, line: string): string {
  const name = esc(plainName(p.name));
  return (
    `<li>${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async">` : `<span class="blank" aria-hidden="true">${name}</span>`}` +
    `<p><strong>${name}</strong><span>${esc(line)}</span></p></li>`
  );
}

function splitBar(s: CrowdSplit, venue: string, partner: string): string {
  const label = `${plainName(venue)} crowd ${s.venue}, ${plainName(partner)} crowd ${s.partner}`;
  return (
    `<svg class="split" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">` +
    `<rect class="split-a" x="0" y="0" width="${s.venue}" height="10"></rect><rect class="split-b" x="${s.venue}" y="0" width="${s.partner}" height="10"></rect></svg>` +
    `<p class="split-line">${esc(label)}</p>`
  );
}

function answerBlock(n: PublicInvite): string {
  const v = esc(plainName(n.venue.name));
  if (n.status === "accepted") return `<p class="going">You are in. ${v} can now put both names on the night.</p>`;
  if (n.status === "declined") return `<p class="going">You said not this time. Nothing goes up with your name on it.</p>`;
  return (
    `<form method="post" action="/i/${esc(n.slug)}/answer"><button class="yes" type="submit" name="answer" value="yes">We're in</button>` +
    `<button class="quiet" type="submit" name="answer" value="no">Not this time</button></form>` +
    `<p class="limits">If you say yes, ${v} can put your name beside theirs on the event page, the poster and the calendar entry. Nothing goes up with your name before that.</p>`
  );
}

export function inviteUrl(origin: string, slug: string): string {
  return `${origin}/i/${slug}`;
}

export function renderInvitePage(n: PublicInvite, origin: string): string {
  const v = plainName(n.venue.name);
  const p = plainName(n.partner.name);
  const when = `${describeDate(n.night.date)}, ${n.night.start} to ${n.night.end}`;
  const what = n.night.kind ?? "A night";
  const flyer =
    `<article class="flyer"><p class="when"><span>${esc(describeDate(n.night.date))}</span><span>${esc(`${n.night.start} to ${n.night.end}`)}</span></p>` +
    `<p class="kind">${esc(what)}</p>` +
    (n.night.feature ? headWithArt(`<h2 class="fname">${esc(n.night.feature)}</h2>`, n.night.art) : "") +
    (n.night.by ? `<p class="by">${esc(n.night.by)}</p>` : "") +
    `<p class="place">At ${esc(plainName(n.night.at))}</p><p class="tz">Times are local, ${esc(zoneCity(n.night.tz))}.</p></article>`;
  const shared = tagWords(n.shared.slice(0, 3));
  return (
    head(`${v} would like to put on a night with ${p}`, `${what}, ${when}. An invite from ${v}.`, inviteUrl(origin, n.slug)) +
    `<body><header class="fascia"><p>Full House</p><p class="sign">An invite from ${esc(v)}</p></header><main class="sheet invite">` +
    `<h1 class="ask">${esc(v)} would like to put on one night with ${esc(p)}</h1>` +
    `<p class="lede">Qloo's taste data says the people who like ${esc(v)} also love ${esc(p)}. This is the night both crowds want.</p>` +
    `<ul class="near pair">${card(n.venue, n.venue.address ?? "")}${card(n.partner, `${n.walkMin} min walk from ${v}`)}</ul>` +
    ledgeHtml("night-title", "The night", flyer) +
    (n.split ? ledgeHtml("split-title", "Both crowds want it", `${splitBar(n.split, n.venue.name, n.partner.name)}<p class="limits">Each crowd's share of this pick in Qloo's explainability, read inside one answer.</p>`) : "") +
    (shared.length ? ledgeHtml("shared-title", "What both crowds share", `<p>${esc(capFirst(listWords(shared)))}</p>`) : "") +
    `<p class="limits aggregate">${AGGREGATE_LINE}</p>` +
    `<section class="answer" id="answer" aria-label="Your answer">${answerBlock(n)}</section>` +
    `<footer><p>Sent through Full House by whoever runs ${esc(v)}.${n.verified ? "" : ` ${esc(v)} has not confirmed its page yet.`}</p>` +
    `<p><a href="/">Find the shop down your street that shares your customers</a></p></footer>` +
    `</main></body></html>`
  );
}
