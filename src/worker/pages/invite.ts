import type { CrowdSplit, InviteStatus } from "../../shared/contract.ts";
import { describeDate } from "../../core/index.ts";
import { possessive, shortName } from "../../shared/words.ts";
import { CREDIT, footer, head, topBar, unconfirmedWord } from "./chrome.ts";
import { COUNT_SHOWN_FROM } from "./event.ts";
import { artHtml, type PublicArt } from "./event_art.ts";
import { zoneCity } from "./guest.ts";
import { esc, safeHref } from "./html.ts";
import { pairCard, splitBar, type PairPlace } from "./pair.ts";
import { stopsHtml, type PublicStop } from "./stops.ts";

export type InvitePlace = PairPlace;

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
  // Full House's fit score for this partner, out of 100.
  score?: number;
  // Why this place asks you: the checks from the partner's side, each one sentence.
  reasons?: string[];
  stops?: PublicStop[];
  why?: string;
  // The partner's own stop as proposed, for the partner to confirm or change before saying yes.
  partnerStop?: { start: string; end: string; what: string; hoursUnknown: boolean };
  confirmed?: { start?: string; what?: string; tellsRegulars: boolean };
  // How to reach the venue, shown to the partner after its yes.
  venueContact?: string;
  yourLink?: string;
  yourCount?: number;
}

function nightPanel(n: PublicInvite): string {
  const what = n.night.kind ?? "A night";
  const place = n.stops
    ? stopsHtml(n.stops)
    : `<p class="place">At ${esc(shortName(n.night.at))}<span>${esc(`${n.night.start} to ${n.night.end}`)}</span></p>`;
  const feature = n.night.feature
    ? `<div class="feature">${n.night.art ? artHtml(n.night.art) : ""}<div><h3>${esc(n.night.feature)}</h3>${n.night.by ? `<p class="by">${esc(n.night.by)}</p>` : ""}</div></div>`
    : "";
  return (
    `<section class="panel night" aria-labelledby="night-title"><h2 id="night-title">${esc(`${what}, ${describeDate(n.night.date)}`)}</h2>` +
    (n.why ? `<p class="night-why">${esc(n.why)}</p>` : "") +
    place +
    feature +
    (n.split ? splitBar(n.split, n.venue.name, n.partner.name) : "") +
    `<p class="tz">Times are local, ${esc(zoneCity(n.night.tz))}.</p></section>`
  );
}

// The partner's own stop, as a question: its time and what runs there are the partner's to set, not the planner's.
function yourStop(n: PublicInvite): string {
  const s = n.partnerStop;
  if (!s) return "";
  const p = esc(shortName(n.partner.name));
  const open = s.hoursUnknown ? `<label class="tick"><input type="checkbox" name="open" value="on" checked> We are open that evening</label>` : "";
  return (
    `<div class="yours"><h3>Your part of the night</h3>` +
    `<p class="planned">Proposed: ${esc(s.what)}, from ${esc(s.start)}. Change either to what ${p} will run.</p>` +
    `<label>What runs at ${p}<input type="text" name="what" maxlength="120" value="${esc(s.what)}"></label>` +
    `<label>Starts at<input type="time" name="start" value="${esc(s.start)}" step="900"></label>` +
    open +
    `<label class="tick"><input type="checkbox" name="tellsRegulars" value="on" checked> We will tell our regulars too</label>` +
    `<label>A way for ${esc(shortName(n.venue.name))} to reach you, optional<input type="text" name="contact" maxlength="120" autocomplete="off" placeholder="A phone number or an email"></label>` +
    `</div>`
  );
}

function answerBody(n: PublicInvite): string {
  const v = esc(shortName(n.venue.name));
  if (n.status === "accepted") {
    const yours = n.confirmed?.start || n.confirmed?.what ? `<p>Your part is down as ${esc(n.confirmed?.what ?? n.partnerStop?.what ?? "your own programme")} from ${esc(n.confirmed?.start ?? n.partnerStop?.start ?? n.night.start)}.</p>` : "";
    const contact = n.venueContact ? `<p class="contact">Reach ${v} at ${esc(n.venueContact)}.</p>` : "";
    if (!n.yourLink) return `<p class="going">You are in. ${v} can now put both names on the night.</p>${yours}${contact}<p class="small">Your own link for this night shows here once ${v} publishes it.</p>`;
    const count = n.yourCount && n.yourCount >= COUNT_SHOWN_FROM ? `<p class="count">${n.yourCount} people said they are coming through your link</p>` : "";
    return (
      `<p class="going">You are in. ${v} can now put both names on the night.</p>${yours}${contact}` +
      `<p>Your own link for this night. Share it with your regulars and every RSVP through it counts as yours.</p>` +
      `<div class="link-row"><i aria-hidden="true"></i><a class="link-url" href="${safeHref(n.yourLink)}">${esc(n.yourLink)}</a></div>${count}`
    );
  }
  if (n.status === "declined") return `<p class="going">You said not this time. Nothing goes up with your name on it.</p>`;
  return (
    `<h2 id="answer-title">Your answer</h2>` +
    `<p class="small">If you say yes, ${v} can put your name beside theirs on the event page, the poster and the calendar entry, with your part exactly as you set it below. Nothing goes up with your name before that.</p>` +
    `<form method="post" action="/i/${esc(n.slug)}/answer">${yourStop(n)}<div class="buttons"><button class="btn btn-them" type="submit" name="answer" value="yes">We're in</button>` +
    `<button class="btn btn-quiet" type="submit" name="answer" value="no">Not this time</button></div></form>`
  );
}

export function inviteUrl(origin: string, slug: string): string {
  return `${origin}/i/${slug}`;
}

export function renderInvitePage(n: PublicInvite, origin: string): string {
  const v = shortName(n.venue.name);
  const p = shortName(n.partner.name);
  const what = n.night.kind ?? "A night";
  const when = `${describeDate(n.night.date)}, ${n.night.start} to ${n.night.end}`;
  const consent = n.status === "waiting" ? " Your name goes on it only if you say yes." : "";
  const card = pairCard({ venue: n.venue, partner: n.partner, walkMin: n.walkMin, shared: n.shared, ...(n.score !== undefined ? { score: n.score } : {}), ...(n.reasons ? { reasons: n.reasons } : {}) });
  const sent = `Sent through Full House by whoever runs ${esc(v)}.`;
  return (
    head(`${v} would like to put on a night with ${p}`, `${what}, ${when}. An invite from ${v}.`, inviteUrl(origin, n.slug)) +
    `<body>${topBar(`An invite from ${v}`, n.verified ? "" : unconfirmedWord(v))}<main class="screen"><div class="wrap">` +
    `<div class="screen-head"><h1>${esc(v)} would like to put on one night with ${esc(p)}</h1>` +
    `<p class="lead">The people who like ${esc(v)} also love ${esc(p)}. Full House planned one night for both crowds, and ${esc(possessive(p))} part is yours to set.${consent}</p></div>` +
    `<div class="invite-grid"><div class="invite-main">${card}${nightPanel(n)}</div>` +
    `<div class="invite-side"><section class="panel answer${n.status === "accepted" ? " answer-in" : ""}" id="answer" aria-label="Your answer">${answerBody(n)}</section></div></div>` +
    `</div></main>${footer([esc(CREDIT), sent], `<a href="/">Find your neighbour on Full House</a>`)}</body></html>`
  );
}
