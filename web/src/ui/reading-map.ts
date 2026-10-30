import type { ProgressPlace, Venue } from "../../../src/shared/contract.ts";
import { LOVED_RADIUS_M } from "../../../src/shared/engine.ts";
import { ordinal, plainName, shortName } from "../../../src/shared/words.ts";
import { h, uid } from "../dom.ts";
import { PLACES_ON_MAP } from "../format.ts";
import type { StreetMap } from "./map.ts";

export interface ReadingMap {
  el: HTMLElement;
  places(list: ProgressPlace[]): void;
  partner(id: string, place?: ProgressPlace): void;
  // When the partner pin turned plum, so the screen can let it be seen before moving on.
  partnerSince(): number | null;
}

// The map the reading screen draws while the read runs: the venue first, then the top of the list as each place comes
// back, then the partner in plum. Every pin is a real place from the read, at its real coordinates.
export function readingMap(venue: Venue): ReadingMap {
  const box = h("div", { class: "map map-short map-reading", role: "region", "aria-label": "Map of the places your crowd loves around your venue" });
  const keyThem = h("li", { hidden: true }, h("span", { class: "key key-them", "aria-hidden": "true" }), "");
  const keyList = h("li", { hidden: true }, h("span", { class: "key", "aria-hidden": "true" }), "Places your crowd loves, numbered in order");
  const status = h("p", { class: "sr-only", role: "status" });
  const id = uid("reading-map");
  const el = h(
    "section",
    { class: "panel", "aria-labelledby": id },
    h("h2", { id }, "Your street"),
    h("p", null, `Each place on the list is pinned as it comes back. The one Full House chooses turns plum.`),
    h("div", { class: "map-wrap" }, box),
    h("ul", { class: "map-key" }, h("li", null, h("span", { class: "key key-you", "aria-hidden": "true" }), plainName(venue.entity.name)), keyList, keyThem),
    status,
  );

  let list: ProgressPlace[] = [];
  let partnerId: string | null = null;
  let since: number | null = null;
  let map: StreetMap | null = null;
  let drawn = new Set<string>();

  const shown = (): ProgressPlace[] => {
    const top = list.slice(0, PLACES_ON_MAP);
    const p = partnerId ? list.find((x) => x.id === partnerId) : undefined;
    return p && !top.includes(p) ? [...top, p] : top;
  };
  const redraw = (): void => {
    if (!map) return;
    const pins = shown();
    const fresh = pins.filter((p) => !drawn.has(p.id)).map((p) => p.id);
    map.setPlaces(pins, partnerId, fresh);
    drawn = new Set(pins.map((p) => p.id));
  };

  const center = { lat: venue.entity.lat, lng: venue.entity.lng };
  void import("./map.ts").then(({ drawStreetMap }) => {
    if (!box.isConnected) return;
    map = drawStreetMap(box, { venue, center, radiusM: LOVED_RADIUS_M, heat: [], loved: [] });
    redraw();
  });

  const refresh = (): void => {
    const named = partnerId ? list.find((x) => x.id === partnerId) : undefined;
    if (named && since === null) {
      since = Date.now();
      keyThem.lastChild!.textContent = `${shortName(named.name)}, ${ordinal(named.rank)} on the list, your partner`;
      keyThem.hidden = false;
      status.textContent = `Full House chose ${shortName(named.name)}.`;
    }
    redraw();
  };

  return {
    el,
    places(next) {
      if (!next.length || next.length === list.length) return;
      list = [...next].sort((a, b) => a.rank - b.rank);
      keyList.hidden = false;
      status.textContent = `${list.length} places on the list.`;
      if (partnerId) partnerId = list.find((x) => x.id.toUpperCase() === partnerId!.toUpperCase())?.id ?? partnerId;
      refresh();
    },
    partner(id, place) {
      if (partnerId && partnerId.toUpperCase() === id.toUpperCase()) return;
      if (place && !list.some((x) => x.id.toUpperCase() === place.id.toUpperCase())) list = [...list, place].sort((a, b) => a.rank - b.rank);
      partnerId = list.find((x) => x.id.toUpperCase() === id.toUpperCase())?.id ?? id;
      refresh();
    },
    partnerSince: () => since,
  };
}
