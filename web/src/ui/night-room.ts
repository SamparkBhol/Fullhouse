import type { NightPlan, StreetRead } from "../../../src/shared/contract.ts";
import { TYPE_PLURAL, listWords, ordinal } from "../../../src/shared/words.ts";
import { h } from "../dom.ts";
import { formatName, prettyTag } from "../format.ts";
import { cover } from "./cover.ts";
import { shopWindow } from "./window.ts";

export interface RoomOptions {
  flyer: HTMLElement;
  side: HTMLElement | null;
  lettering: string;
  lit?: boolean;
  dark?: boolean;
}

// The big window: the flyer taped to the glass on the left, the room under the pendant on the right.
export function bigWindow(o: RoomOptions): HTMLElement {
  return shopWindow(
    { size: "big", glass: true, lettering: o.lettering, lit: o.lit, dark: o.dark, className: "night-big" },
    h("div", { class: "room" }, h("div", { class: "room-flyer night-window" }, o.flyer), o.side ? h("div", { class: "room-side" }, o.side) : null),
  );
}

// One sentence about the feature in the night's own condensed type, and the plain reason under it.
export function featureSay(plan: NightPlan, venueName: string, read?: StreetRead): HTMLElement {
  const f = plan.feature;
  if (!f) {
    const tags = plan.themeTags.slice(0, 3).map((t) => prettyTag(t.name));
    return h(
      "div",
      { class: "say" },
      h("p", { class: "say-line" }, `A ${formatName(plan.format).toLowerCase()} from what the street likes.`),
      tags.length ? h("p", { class: "say-why" }, `It is built on ${listWords(tags)}, tags Qloo returned for the street.`) : null,
    );
  }
  const kinds = TYPE_PLURAL[f.type] ?? "picks";
  const listed = read?.rising.filter((r) => r.type === f.type).length ?? 0;
  const ranked = f.venueSignal !== false;
  return h(
    "div",
    { class: "say" },
    h("div", { class: "say-cover" }, cover(f, { className: "say-art", eager: true })),
    h("p", { class: "say-line" }, ranked ? `People who like ${venueName} also love ${f.name}.` : `The streets around ${venueName} like ${f.name}.`),
    h(
      "p",
      { class: "say-why" },
      ranked
        ? `Qloo ranks it ${ordinal(f.rank)} of the ${listed > 1 ? `${listed} ` : ""}${kinds} it found for them, so the night is built around it.`
        : `Qloo returned it for the area alone, so it carries no rank for your crowd.`,
    ),
  );
}
