import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { HeatLayer, ProgressPlace, Venue } from "../../../src/shared/contract.ts";
import { plainName } from "../../../src/shared/words.ts";
import { h } from "../dom.ts";
import { geohashBounds, squareAround } from "../geo.ts";
import { heatOpacity, rankCells } from "../heat.ts";
import { lovedPlacesLayer, VENUE_PIN } from "./map-places.ts";
import { TILE_ATTRIBUTION, TILE_MAX_ZOOM, TILE_URL } from "./map-tiles.ts";

const INK = "#14201a";
// Squares are drawn smaller than their geohash cell so the street plan shows between them.
const SQUARE_OF_CELL = 0.82;

// Geohash cells are tall at high latitudes, so each cell is drawn as a square of its shorter side to keep the grid even.
function cellSide(hash: string, lat: number): number {
  const g = geohashBounds(hash);
  if (!g) return 90;
  const height = (g.north - g.south) * 111320;
  const width = (g.east - g.west) * 111320 * Math.cos((lat * Math.PI) / 180);
  return Math.max(16, Math.min(height, width) * SQUARE_OF_CELL);
}

export interface StreetMap {
  showLayer(index: number): void;
  // Puts the list's pins on the map, or replaces them, with the partner in plum once it is known.
  setPlaces(places: ProgressPlace[], partnerId: string | null, arrive?: string[]): void;
  destroy(): void;
}

// After each round of tile loading, says whether any street tile arrived, so the page can explain a bare map.
function watchTiles(tiles: L.TileLayer, report: ((shown: boolean) => void) | undefined): void {
  if (!report) return;
  let arrived = 0;
  let failed = 0;
  tiles.on("loading", () => {
    arrived = 0;
    failed = 0;
  });
  tiles.on("tileload", () => arrived++);
  tiles.on("tileerror", () => failed++);
  tiles.on("load", () => report(arrived > 0 || failed === 0));
}

function heatGroup(layer: HeatLayer): L.LayerGroup {
  const group = L.layerGroup();
  for (const ranked of rankCells(layer.cells)) {
    const opacity = heatOpacity(ranked.bucket);
    if (!opacity) continue;
    const c = ranked.cell;
    const b = squareAround(c.lat, c.lng, cellSide(c.geohash, c.lat));
    group.addLayer(L.rectangle([[b.south, b.west], [b.north, b.east]], { stroke: false, fill: true, fillColor: INK, fillOpacity: opacity, interactive: false }));
  }
  return group;
}

export function drawStreetMap(
  container: HTMLElement,
  opts: {
    venue: Venue;
    center: { lat: number; lng: number };
    radiusM: number;
    heat: HeatLayer[];
    loved: ProgressPlace[];
    partnerId?: string | null;
    onTiles?: (shown: boolean) => void;
  },
): StreetMap {
  const map = L.map(container, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, keyboard: true });
  map.fitBounds(L.latLng(opts.center.lat, opts.center.lng).toBounds(opts.radiusM * 2), { padding: [12, 12] });
  const tiles = L.tileLayer(TILE_URL, { maxZoom: TILE_MAX_ZOOM, attribution: TILE_ATTRIBUTION });
  watchTiles(tiles, opts.onTiles);
  tiles.addTo(map);
  map.attributionControl.setPrefix(false);
  const heatGroups = opts.heat.map(heatGroup);

  L.circle([opts.center.lat, opts.center.lng], { radius: opts.radiusM, color: INK, opacity: 0.45, weight: 1, dashArray: "2 6", fill: false, interactive: false }).addTo(map);

  const venueAt = L.latLng(opts.center.lat, opts.center.lng);
  let pins: L.LayerGroup | null = null;
  const setPlaces = (places: ProgressPlace[], partnerId: string | null, arrive: string[] = []): void => {
    if (pins) map.removeLayer(pins);
    pins = places.length ? lovedPlacesLayer(map, venueAt, places, partnerId, { arrive }).addTo(map) : null;
  };
  setPlaces(opts.loved, opts.partnerId ?? null);
  const venueIcon = L.divIcon({ className: "pin pin-you", html: h("span", null, "You"), iconSize: [VENUE_PIN.w, VENUE_PIN.h], iconAnchor: [VENUE_PIN.w / 2, VENUE_PIN.h / 2] });
  L.marker(venueAt, { icon: venueIcon, keyboard: false, title: plainName(opts.venue.entity.name), zIndexOffset: 1000 }).addTo(map);

  let shown: L.LayerGroup | null = null;
  const api: StreetMap = {
    showLayer(index) {
      if (shown) map.removeLayer(shown);
      shown = heatGroups[index] ?? null;
      if (shown) shown.addTo(map);
    },
    setPlaces,
    destroy() {
      map.remove();
    },
  };
  api.showLayer(0);
  return api;
}
