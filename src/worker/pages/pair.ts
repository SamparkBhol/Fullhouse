import type { CrowdSplit } from "../../shared/contract.ts";
import { verdictWord } from "../../shared/verdict.ts";
import { capFirst, shortName } from "../../shared/words.ts";
import { esc } from "./html.ts";

export interface PairPlace {
  name: string;
  image?: string;
  address?: string;
  kind?: string;
}

export const AGGREGATE_LINE = "A pattern across many people, not a fact about anyone.";

function streetOf(address: string | undefined): string {
  return address?.split(",")[0]?.trim() ?? "";
}

// The name is set in the tile from the first paint, in the place's own tint; the photo covers it when it arrives.
function door(p: PairPlace, side: "you" | "them"): string {
  const name = esc(shortName(p.name));
  const photo = p.image ? `<img src="${esc(p.image)}" alt="${name}, from the street" decoding="async" fetchpriority="high">` : "";
  const tile = `<span class="door-photo${p.image ? "" : " door-blank"}"><span class="door-word" aria-hidden="true">${name}</span>${photo}</span>`;
  const sub = [p.kind ? capFirst(p.kind) : "", streetOf(p.address)].filter(Boolean).join(", ");
  return `<div class="door door-${side}">${tile}<p class="door-name">${name}${sub ? `<small class="door-sub">${esc(sub)}</small>` : ""}</p></div>`;
}

function verdict(score: number | undefined): string {
  if (score === undefined) return "";
  return (
    `<div class="verdict"><p class="score">${score} <span>of 100</span></p>` +
    `<p class="verdict-head">${esc(verdictWord(score))}</p><p class="verdict-sub">How well the two places fit, scored by Full House.</p></div>`
  );
}

function reasons(list: string[] | undefined): string {
  if (!list?.length) return "";
  return `<div class="pair-part"><h2 id="reasons-title">Why your place</h2><ul class="reasons" aria-labelledby="reasons-title">${list.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>`;
}

function sharedTags(names: string[]): string {
  const tags = names
    .map((t) => capFirst(t.replace(/_/g, " ").trim()))
    .filter(Boolean)
    .slice(0, 3);
  if (!tags.length) return "";
  return `<div class="pair-part"><h2 id="shared-title">What both places share</h2><ul class="tags" aria-labelledby="shared-title">${tags.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
}

export interface PairCardInput {
  venue: PairPlace;
  partner: PairPlace;
  walkMin: number;
  score?: number;
  reasons?: string[];
  shared: string[];
}

export function pairCard(o: PairCardInput): string {
  const label = `${shortName(o.venue.name)} and ${shortName(o.partner.name)}`;
  return (
    `<section class="pair" aria-label="${esc(label)}">` +
    `<div class="pair-doors">${door(o.venue, "you")}<p class="walk">about ${o.walkMin} min on foot</p>${door(o.partner, "them")}</div>` +
    verdict(o.score) +
    reasons(o.reasons) +
    sharedTags(o.shared) +
    `<p class="small aggregate">${AGGREGATE_LINE}</p></section>`
  );
}

// Drawn with SVG attributes because the page CSP allows no inline style.
export function splitBar(s: CrowdSplit, venue: string, partner: string): string {
  const a = Number(s.venue) || 0;
  const b = Number(s.partner) || 0;
  const label = `${shortName(venue)} crowd ${a}, ${shortName(partner)} crowd ${b}`;
  return (
    `<div class="split-block"><h3>Both crowds want it</h3>` +
    `<svg class="split" viewBox="0 0 ${a + b || 100} 10" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">` +
    `<rect class="split-you" x="0" y="0" width="${a}" height="10"></rect><rect class="split-them" x="${a}" y="0" width="${b}" height="10"></rect>` +
    `<line class="split-gap" x1="${a}" x2="${a}" y1="0" y2="10"></line></svg>` +
    `<p class="split-key" aria-hidden="true"><span>${esc(shortName(venue))} crowd ${a}</span><span>${esc(shortName(partner))} crowd ${b}</span></p>` +
    `<p class="small">Each crowd's share of this pick, read inside one answer.</p></div>`
  );
}
