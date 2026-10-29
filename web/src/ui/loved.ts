import type { StreetRead } from "../../../src/shared/contract.ts";
import { h } from "../dom.ts";
import { distance } from "../format.ts";
import { postcards } from "./postcard.ts";
import { ledge } from "./ledge.ts";

// The map shows the same places the postcards show before "more", so a photo pin always has a postcard.
export const PLACES_ON_MAP = 10;

export function lovedSection(read: StreetRead): HTMLElement {
  const loved = read.lovedPlaces;
  const rest = loved.slice(PLACES_ON_MAP);
  return ledge(
    { label: "Places nearby your audience loves", className: "ledge-loved" },
    loved.length
      ? [
          postcards(loved.slice(0, PLACES_ON_MAP)),
          rest.length
            ? h("details", { class: "more" }, h("summary", null, `${rest.length} more places, not on the map`), postcards(rest, () => null, { start: PLACES_ON_MAP + 1 }))
            : null,
        ]
      : h("p", { class: "ledge-empty" }, `Qloo returned no places within ${distance(read.radiusM)} of your venue that your audience loves.`),
  );
}
