import type { CrowdSplit, EntityRef } from "../../../src/shared/contract.ts";
import { shortName } from "../../../src/shared/words.ts";
import { h } from "../dom.ts";
import { cover } from "./cover.ts";

type Child = HTMLElement | null | false | undefined;

export interface PairSide {
  name: string;
  image?: string;
  sub?: string | null;
}

export interface PairOptions {
  you: PairSide;
  them: PairSide;
  walkMin: number | null;
  size?: "big" | "small";
  className?: string;
}

function door(p: PairSide, side: "you" | "them", eager: boolean): HTMLElement {
  const place: Pick<EntityRef, "name" | "type" | "image"> = { name: shortName(p.name), type: "place", ...(p.image ? { image: p.image } : {}) };
  return h(
    "div",
    { class: `door door-${side}` },
    cover(place, { shape: "square", eager, alt: `${shortName(p.name)}, from the street` }),
    h("p", { class: "door-name" }, shortName(p.name), p.sub ? h("small", { class: "door-sub" }, p.sub) : null),
  );
}

export function walkWords(min: number | null): string {
  return min === null ? "a short walk" : `about ${min} min on foot`;
}

// The two places side by side, ringed in their own colours, with the walk between them.
export function pairCard(o: PairOptions, ...below: Child[]): HTMLElement {
  const size = o.size ? ` pair-${o.size}` : "";
  return h(
    "figure",
    { class: `pair${size}${o.className ? ` ${o.className}` : ""}` },
    h("div", { class: "pair-doors" }, door(o.you, "you", true), h("p", { class: "walk" }, walkWords(o.walkMin)), door(o.them, "them", true)),
    ...below.filter((c): c is HTMLElement => Boolean(c)),
  );
}

// One bar for the two crowds behind a pick: your side green, theirs plum.
export function splitBar(split: CrowdSplit, venueName: string, partnerName: string): HTMLElement {
  const total = split.venue + split.partner || 1;
  const a = h("i");
  const b = h("i");
  a.style.flex = String(split.venue / total);
  b.style.flex = String(split.partner / total);
  const words = `${shortName(venueName)} crowd ${split.venue}, ${shortName(partnerName)} crowd ${split.partner}`;
  return h(
    "div",
    { class: "split-block" },
    h("span", { class: "split", "aria-hidden": "true" }, a, b),
    h("span", { class: "split-key" }, h("span", { "aria-hidden": "true" }, `${shortName(venueName)} crowd ${split.venue}`), h("span", { "aria-hidden": "true" }, `${shortName(partnerName)} crowd ${split.partner}`), h("span", { class: "sr-only" }, words)),
  );
}

export function tagList(tags: { name: string; carriers?: number; pool?: number }[]): HTMLElement {
  return h(
    "ul",
    { class: "tags" },
    tags.map((t) => h("li", null, t.name, t.pool ? h("small", null, `${t.carriers ?? 0} of ${t.pool} nearby`) : null)),
  );
}
