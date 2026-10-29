import type { LovedPlace } from "../../../src/shared/contract.ts";
import { plainName } from "../../../src/shared/words.ts";
import { h } from "../dom.ts";
import { distance, walkMinutes } from "../format.ts";
import { describingTags } from "../tags.ts";
import { cover } from "./cover.ts";

// The walk is printed as the postcard's stamp: minutes big, distance small.
function stamp(m: number): HTMLElement {
  const n = walkMinutes(m);
  return h(
    "p",
    { class: "postcard-walk" },
    h("span", { class: "stamp-min" }, n === null ? "Walk unknown" : `${n} min walk`),
    h("span", { class: "stamp-m" }, distance(m)),
  );
}

// A place as a picture postcard: its own photo from Qloo, the name, the walk and one line.
export function postcard(p: LovedPlace, line?: string | null, opts: { across?: boolean } = {}): HTMLElement {
  const tags = describingTags(p.tags, 3);
  const text = line ?? (tags.length ? tags.join(", ") : null);
  return h(
    "li",
    { class: opts.across ? "postcard postcard-across" : "postcard" },
    cover(p, { shape: "square", className: "postcard-photo" }),
    h(
      "div",
      { class: "postcard-text" },
      h("p", { class: "postcard-name" }, plainName(p.name)),
      stamp(p.distanceM),
      text ? h("p", { class: "postcard-line" }, text) : null,
    ),
  );
}

export function postcards(places: LovedPlace[], lineFor: (p: LovedPlace) => string | null = () => null, opts: { across?: boolean; ordered?: boolean; start?: number } = {}): HTMLElement {
  const items = places.map((p) => postcard(p, lineFor(p), opts));
  return opts.ordered === false
    ? h("ul", { class: "postcards" }, items)
    : h("ol", { class: "postcards", start: opts.start ? String(opts.start) : null }, items);
}
