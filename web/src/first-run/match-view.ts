import type { Fit, Venue } from "../../../src/shared/contract.ts";
import { capFirst, plainName, shortName } from "../../../src/shared/words.ts";
import { h } from "../dom.ts";
import { prettyTag, streetPart, walkMinutes } from "../format.ts";
import type { Match, MatchPartner } from "../joint.ts";
import { describingTags } from "../tags.ts";
import { cover } from "../ui/cover.ts";
import { pairCard, tagList, walkWords } from "../ui/pair.ts";

function firstSentence(text: string | undefined): string | null {
  const m = /^(.+?[.])(\s|$)/.exec(text?.trim() ?? "");
  return m?.[1] ?? null;
}

// Why this place, in one line, from the checks it passed.
export function matchLead(m: Match, venueName: string): string {
  const fit = m.fit ?? m.partner.fit;
  if (!fit) return `People who like ${plainName(venueName)} also love it.`;
  const passed = (key: string) => fit.checks.find((c) => c.key === key)?.pass === true;
  const said = passed("crowd") && passed("back") ? "Your crowd loves it, and its crowd loves you back." : passed("crowd") ? "Your crowd loves it." : passed("back") ? "Its crowd loves you back." : null;
  const kinds = passed("partners") ? firstSentence(fit.checks.find((c) => c.key === "partners")?.sentence) : null;
  return [said, kinds].filter(Boolean).join(" ") || `People who like ${plainName(venueName)} also love it.`;
}

export function kindOf(p: MatchPartner): string | null {
  return p.kind ? capFirst(p.kind) : describingTags(p.tags, 1)[0] ?? null;
}

function sub(kind: string | null | undefined, address: string | undefined, city: string): string | null {
  return [kind ? capFirst(kind) : null, streetPart(address, city)].filter(Boolean).join(", ") || null;
}

// The engine keeps only tags that set the pair apart, so anything here is rarer than half the street.
function setApart(m: Match): Match["shared"] {
  return m.shared.filter((t) => !t.pool || (t.carriers ?? 0) * 2 <= t.pool).slice(0, 3);
}

export function matchPair(m: Match, venue: Venue): HTMLElement {
  const tags = setApart(m);
  return pairCard(
    {
      you: { name: venue.entity.name, ...(venue.entity.image ? { image: venue.entity.image } : {}), sub: sub(m.venueKind ?? venue.entity.kind, venue.entity.address, venue.city) },
      them: { name: m.partner.name, ...(m.partner.image ? { image: m.partner.image } : {}), sub: sub(kindOf(m.partner), m.partner.address, venue.city) },
      walkMin: m.partner.walkMin ?? walkMinutes(m.partner.distanceM),
      size: "big",
    },
    h(
      "div",
      { class: "night-line" },
      h("b", null, "What both places share."),
      !tags.length ? " Only what the whole street shares. The night screen says what both crowds put in their top ten instead." : " These set the two of you apart from the street around you.",
      tags.length ? tagList(tags.map((t) => ({ name: prettyTag(t.name), ...(t.carriers !== undefined ? { carriers: t.carriers } : {}), ...(t.pool !== undefined ? { pool: t.pool } : {}) }))) : null,
    ),
  );
}

export function verdictSub(m: Match): string {
  const n = m.runnersUp.length;
  if (!n) return "The only place nearby that could host with you.";
  const next = m.runnersUp[0];
  return next?.fit ? `Ahead of ${shortName(next.name)} at ${next.fit.score}, on the same six checks.` : "Ahead of the places below, on the same six checks.";
}

export function runnerRow(p: MatchPartner, onSwap: (button: HTMLButtonElement) => void): HTMLElement {
  const button = h("button", { type: "button", class: "btn btn-quiet btn-small" }, "Swap");
  button.setAttribute("aria-label", `Swap to ${shortName(p.name)}`);
  button.addEventListener("click", () => onSwap(button));
  const fit: Fit | undefined = p.fit;
  return h(
    "li",
    { class: "item item-swap" },
    cover(p, { shape: "square" }),
    h("div", null, h("span", { class: "item-name" }, shortName(p.name)), h("span", { class: "item-sub" }, [kindOf(p), walkWords(p.walkMin ?? walkMinutes(p.distanceM))].filter(Boolean).join(", "))),
    fit ? h("span", { class: "num", "aria-label": `Fit ${fit.score} of 100` }, String(fit.score)) : h("span"),
    button,
  );
}
