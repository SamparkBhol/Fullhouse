import type { StreetRead, Venue } from "../../../src/shared/contract.ts";
import { h, replace, uid } from "../dom.ts";
import { haversineM } from "../../../src/shared/geo.ts";
import { ordinal, plainName } from "../../../src/shared/words.ts";
import { distance, walkShort } from "../format.ts";
import { bearingWord } from "../geo.ts";
import { rankCells } from "../heat.ts";
import { layerWord } from "./lines.ts";
import { PLACES_ON_MAP } from "./loved.ts";
import { shopWindow } from "./window.ts";

function strongestCells(read: StreetRead, index: number): HTMLElement[] {
  const layer = read.heat[index];
  if (!layer) return [h("li", null, "Qloo returned no heat map cells around your venue.")];
  const ranked = rankCells(layer.cells)
    .filter((r) => r.order !== null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!ranked.length) return [h("li", null, `Qloo returned no heat map cells with a read for ${layer.label}.`)];
  return ranked.slice(0, 5).map((r) => {
    const m = haversineM(read.center, r.cell);
    const where = m < 60 ? "around your venue" : `${distance(m)} ${bearingWord(read.center.lat, read.center.lng, r.cell.lat, r.cell.lng)} of your venue`;
    return h("li", null, `${ordinal(r.order ?? 0)} strongest: ${where}`);
  });
}

export function streetMapPanel(read: StreetRead, venue: Venue): HTMLElement {
  const mapBox = h("div", { class: "map", role: "region", "aria-label": "Map of the street around your venue. The same information follows as a list." });
  const layerPicker = read.heat.length > 1 ? h("fieldset", { class: "layer-pick" }, h("legend", { class: "sr-only" }, "Light the windows by")) : null;
  const cellList = h("ol", { class: "plain-list cell-list" }, strongestCells(read, 0));
  const places = read.lovedPlaces.slice(0, PLACES_ON_MAP);
  const tileNote = h(
    "p",
    { class: "meta map-tiles-note", role: "status", hidden: true },
    "The street plan from OpenStreetMap did not load, so the windows and photos show without the streets behind them.",
  );
  const onTiles = (shown: boolean): void => {
    tileNote.hidden = shown;
  };

  void import("./map.ts").then(({ drawStreetMap }) => {
    if (!mapBox.isConnected) return;
    const map = drawStreetMap(mapBox, { venue, center: read.center, radiusM: read.radiusM, heat: read.heat, loved: places, onTiles });
    if (!layerPicker) return;
    const name = uid("layer");
    read.heat.forEach((layer, i) => {
      const id = `${name}-${i}`;
      const input = h("input", { type: "radio", name, id, value: String(i), checked: i === 0 });
      input.addEventListener("change", () => {
        map.showLayer(i);
        replace(cellList, strongestCells(read, i));
      });
      layerPicker.append(h("span", { class: "layer-opt" }, input, h("label", { for: id }, layerWord(layer.label))));
    });
  });

  return shopWindow(
    { size: "wide", bare: true, lettering: "Where the taste runs strongest", className: "street-map" },
    layerPicker ? h("div", { class: "map-head" }, layerPicker) : null,
    mapBox,
    h(
      "div",
      { class: "map-foot" },
      tileNote,
      h(
        "ul",
        { class: "map-legend" },
        h("li", null, h("span", { class: "key key-lit", "aria-hidden": "true" }), "Brighter windows are where the taste runs strongest, ranked within this one layer."),
        h("li", null, h("span", { class: "key key-dark", "aria-hidden": "true" }), "Dark windows: Qloo has no read there."),
        places.length ? h("li", null, h("span", { class: "key key-photo", "aria-hidden": "true" }), `Round photos are the ${places.length === 1 ? "place" : `${places.length} places`} nearby your audience loves most. Tap one for its name and walk.`) : null,
        h("li", null, h("span", { class: "key key-door", "aria-hidden": "true" }), `The lit doorway is ${venue.entity.name}.`),
      ),
      h(
        "details",
        { class: "map-text" },
        h("summary", null, "The map as a list"),
        h("h3", null, read.heat.length ? "Strongest windows" : "Heat map"),
        cellList,
        places.length ? [h("h3", null, "Places on the map"), h("ol", { class: "plain-list cell-list" }, places.map((p) => h("li", null, `${plainName(p.name)}, ${walkShort(p.distanceM)}`)))] : null,
        h("p", { class: "meta" }, `The dashed circle is ${distance(read.radiusM)} around ${venue.entity.name}.`),
      ),
    ),
  );
}
