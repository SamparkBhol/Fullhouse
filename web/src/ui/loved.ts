import type { LovedPlace, StreetRead } from "../../../src/shared/contract.ts";
import { h } from "../dom.ts";
import { distance, walk } from "../format.ts";
import { describingTags } from "../tags.ts";
import { listReason, moreRows, ownReasons, sharedLine } from "./lists.ts";
import { reasons } from "./receipt.ts";
import { empty } from "./states.ts";

// The map numbers the same places the list shows before "more", so a pin always has a row above the fold.
export const PLACES_ON_MAP = 10;

function placeRow(p: LovedPlace, read: StreetRead, tz: string, shared: ReturnType<typeof sharedLine>): HTMLElement {
  const tags = describingTags(p.tags, 3);
  return h(
    "li",
    { class: "pick" },
    h("span", { class: "pin-no", "aria-hidden": "true" }, String(p.rank)),
    h("div", { class: "pick-head" }, h("p", { class: "pick-name" }, p.name), h("p", { class: "pick-dist" }, distance(p.distanceM))),
    h("p", { class: "meta pick-where" }, [p.address, walk(p.distanceM)].filter(Boolean).join(", ")),
    tags.length ? h("p", { class: "pick-tags" }, tags.join(", ")) : null,
    reasons(ownReasons(p, shared), read.provenance, tz),
  );
}

export function lovedSection(read: StreetRead, tz: string): HTMLElement {
  const loved = read.lovedPlaces;
  const shared = sharedLine(loved);
  const rows = loved.map((p) => placeRow(p, read, tz, shared));
  return h(
    "section",
    { class: "block", "aria-labelledby": "loved-title" },
    h("h2", { id: "loved-title" }, "Places nearby your audience loves"),
    loved.length
      ? [
          listReason(shared, read.provenance, tz),
          h("ol", { class: "picks numbered top-places" }, rows.slice(0, PLACES_ON_MAP)),
          moreRows(rows, PLACES_ON_MAP, (n) => `${n} more places, not on the map`, "picks numbered"),
        ]
      : empty(`Qloo returned no places within ${distance(read.radiusM)} of your venue that your audience loves.`),
  );
}
