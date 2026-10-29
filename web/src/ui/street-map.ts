import type { StreetRead, Venue } from "../../../src/shared/contract.ts";
import { haversineM } from "../../../src/shared/geo.ts";
import { ordinal, plainName, shortName } from "../../../src/shared/words.ts";
import { h, replace, uid } from "../dom.ts";
import { PLACES_ON_MAP, distance, walkShort } from "../format.ts";
import { bearingWord } from "../geo.ts";
import { rankCells } from "../heat.ts";
import { layerWord } from "./lines.ts";

function strongestCells(read: StreetRead, index: number): HTMLElement[] {
  const layer = read.heat[index];
  if (!layer) return [h("li", null, "No heat map came back for the streets around your venue.")];
  const ranked = rankCells(layer.cells)
    .filter((r) => r.order !== null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!ranked.length) return [h("li", null, `No square of this map carries a read for ${layerWord(layer.label).toLowerCase()}.`)];
  return ranked.slice(0, 5).map((r) => {
    const m = haversineM(read.center, r.cell);
    const where = m < 60 ? "around your venue" : `${distance(m)} ${bearingWord(read.center.lat, read.center.lng, r.cell.lat, r.cell.lng)} of your venue`;
    return h("li", null, `${ordinal(r.order ?? 0)} strongest, ${where}`);
  });
}

// The map of where the crowd gathers: darker squares are stronger, numbered pins are the places it loves.
// The compact form sits at the top of Your crowd: one layer, the key, and no list.
export function streetMapPanel(read: StreetRead, venue: Venue, opts: { compact?: boolean } = {}): HTMLElement {
  const mapBox = h("div", { class: opts.compact ? "map map-short" : "map map-tall", role: "region", "aria-label": "Map of the streets around your venue. The same information follows as a list." });
  const picker = read.heat.length > 1 && !opts.compact ? h("fieldset", { class: "layer-pick" }, h("legend", { class: "sr-only" }, "Show the squares for")) : null;
  const cellList = h("ol", { class: "bullets" }, strongestCells(read, 0));
  const places = read.lovedPlaces.slice(0, PLACES_ON_MAP);
  const partnerId = read.match?.partner.id ?? null;
  const tileNote = h("p", { class: "meta", role: "status", hidden: true }, "The street plan did not load, so the squares and pins show without the streets behind them.");

  void import("./map.ts").then(({ drawStreetMap }) => {
    if (!mapBox.isConnected) return;
    const map = drawStreetMap(mapBox, { venue, center: read.center, radiusM: read.radiusM, heat: read.heat, loved: places, partnerId, onTiles: (shown) => (tileNote.hidden = shown) });
    if (!picker) return;
    const name = uid("layer");
    read.heat.forEach((layer, i) => {
      const id = `${name}-${i}`;
      const input = h("input", { type: "radio", name, id, value: String(i), checked: i === 0 });
      input.addEventListener("change", () => {
        map.showLayer(i);
        replace(cellList, strongestCells(read, i));
      });
      picker.append(h("span", { class: "layer-opt" }, input, h("label", { for: id }, layerWord(layer.label))));
    });
  });

  const partner = places.find((p) => p.id === partnerId);
  const id = uid("map");
  return h(
    "section",
    { class: "panel", "aria-labelledby": id },
    h("h2", { id }, "Where your crowd gathers"),
    h("p", null, opts.compact ? "Darker squares are where your crowd's taste runs strongest. The numbers are the places it loves, in order." : "Darker squares are where the taste runs strongest, ranked within the one map shown. Numbers are the places your crowd loves, in order."),
    picker,
    h("div", { class: "map-wrap" }, mapBox),
    tileNote,
    h(
      "ul",
      { class: "map-key" },
      h("li", null, h("span", { class: "key key-you", "aria-hidden": "true" }), plainName(venue.entity.name)),
      partner ? h("li", null, h("span", { class: "key key-them", "aria-hidden": "true" }), `${shortName(partner.name)}, your partner`) : null,
      places.length ? h("li", null, h("span", { class: "key", "aria-hidden": "true" }), "Places your crowd loves") : null,
      h("li", null, h("span", { class: "key key-heat", "aria-hidden": "true" }), "Weaker to stronger"),
    ),
    opts.compact ? null : h(
      "details",
      { class: "disclose more" },
      h("summary", null, "The map as a list"),
      h("h3", null, "Strongest squares"),
      cellList,
      places.length ? [h("h3", null, "Places on the map"), h("ol", { class: "bullets" }, places.map((p) => h("li", null, `${shortName(p.name)}, ${walkShort(p.distanceM)}`)))] : null,
      h("p", { class: "meta" }, `The dashed circle is ${distance(read.radiusM)} around ${plainName(venue.entity.name)}.`),
    ),
  );
}
