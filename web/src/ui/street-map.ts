import type { StreetRead, Venue } from "../../../src/shared/contract.ts";
import { h, replace, uid } from "../dom.ts";
import { bearingWord, distance, metresBetween, ordinal } from "../format.ts";
import { rankCells } from "../heat.ts";
import { PLACES_ON_MAP } from "./loved.ts";

function strongestCells(read: StreetRead, index: number): HTMLElement[] {
  const layer = read.heat[index];
  if (!layer) return [h("li", null, "Qloo returned no heat map cells around your venue.")];
  const ranked = rankCells(layer.cells)
    .filter((r) => r.order !== null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!ranked.length) return [h("li", null, `Qloo returned no heat map cells with a read for ${layer.label}.`)];
  return ranked.slice(0, 5).map((r) => {
    const m = metresBetween(read.center.lat, read.center.lng, r.cell.lat, r.cell.lng);
    const where = m < 60 ? "around your venue" : `${distance(m)} ${bearingWord(read.center.lat, read.center.lng, r.cell.lat, r.cell.lng)} of your venue`;
    return h("li", null, `${ordinal(r.order ?? 0)} strongest: ${where}`);
  });
}

export function streetMapPanel(read: StreetRead, venue: Venue): HTMLElement {
  const mapBox = h("div", { class: "map", role: "region", "aria-label": "Map of the street around your venue. The same information follows as a list." });
  const layerPicker = read.heat.length > 1 ? h("fieldset", { class: "layer-pick" }, h("legend", null, "Heat map of")) : null;
  const cellList = h("ol", { class: "plain-list cell-list" }, strongestCells(read, 0));
  const places = read.lovedPlaces.slice(0, PLACES_ON_MAP);

  void import("./map.ts").then(({ drawStreetMap }) => {
    if (!mapBox.isConnected) return;
    const map = drawStreetMap(mapBox, { venue, center: read.center, radiusM: read.radiusM, heat: read.heat, loved: places });
    if (!layerPicker) return;
    const name = uid("layer");
    read.heat.forEach((layer, i) => {
      const id = `${name}-${i}`;
      const input = h("input", { type: "radio", name, id, value: String(i), checked: i === 0 });
      input.addEventListener("change", () => {
        map.showLayer(i);
        replace(cellList, strongestCells(read, i));
      });
      layerPicker.append(h("span", { class: "layer-opt" }, input, h("label", { for: id }, layer.label)));
    });
  });

  return h(
    "div",
    { class: "street-map" },
    h("h2", { class: "sr-only" }, "Map"),
    layerPicker,
    mapBox,
    h(
      "p",
      { class: "map-legend" },
      h("span", { class: "key key-strong", "aria-hidden": "true" }),
      "Darker squares are where the taste is strongest, ranked within this one layer. ",
      h("span", { class: "key key-none", "aria-hidden": "true" }),
      `Dashed squares: Qloo has no read there. Numbers are the ${places.length === 1 ? "place" : `${places.length} places`} your audience loves most, listed below.`,
    ),
    h(
      "details",
      { class: "map-text" },
      h("summary", null, "The map as a list"),
      h("h3", null, read.heat.length ? "Strongest squares" : "Heat map"),
      cellList,
      h("p", { class: "meta" }, `The circle on the map is ${distance(read.radiusM)} around ${venue.entity.name}.`),
    ),
  );
}
