import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { HeatLayer, LovedPlace, Venue } from "../../../src/shared/contract.ts";
import { h } from "../dom.ts";
import { geohashBounds, squareAround } from "../geo.ts";
import { rankCells } from "../heat.ts";
import { lovedPlacesLayer, VENUE_PIN } from "./map-places.ts";
import { TILE_ATTRIBUTION, TILE_MAX_ZOOM, TILE_URL } from "./map-tiles.ts";
import { lampFor, roundedWindow, WINDOW_FILL_OF_CELL } from "./map-windows.ts";

const CHALK = "#F3F5F8";
// Only the brightest windows glow, from a filter on their own pane; the rest and the unlit ones sit in panes without it.
const GLOW_PANE = "windows";
const LIT_PANE = "lamps";
const DARK_PANE = "unlit";

// Geohash cells are tall at high latitudes, so each cell is drawn as a square of its shorter side to keep the grid even.
function cellSide(hash: string, lat: number): number {
  const g = geohashBounds(hash);
  if (!g) return 90;
  const height = (g.north - g.south) * 111320;
  const width = (g.east - g.west) * 111320 * Math.cos((lat * Math.PI) / 180);
  return Math.max(16, Math.min(height, width) * WINDOW_FILL_OF_CELL);
}

export interface StreetMap {
  showLayer(index: number): void;
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

function pane(map: L.Map, name: string, z: number): L.Renderer {
  if (!map.getPane(name)) map.createPane(name).style.zIndex = String(z);
  return L.svg({ pane: name });
}

interface Panes {
  glow: L.Renderer;
  lit: L.Renderer;
  unlit: L.Renderer;
}

function heatGroup(layer: HeatLayer, panes: Panes): L.LayerGroup {
  const group = L.layerGroup();
  for (const ranked of rankCells(layer.cells)) {
    const c = ranked.cell;
    const ring = roundedWindow(squareAround(c.lat, c.lng, cellSide(c.geohash, c.lat)));
    const style = lampFor(ranked.bucket);
    const strongest = ranked.bucket === 0 ? " win-top" : "";
    group.addLayer(
      L.polygon(ring, {
        renderer: ranked.bucket === null ? panes.unlit : ranked.bucket === 0 ? panes.glow : panes.lit,
        stroke: false,
        fill: true,
        ...style,
        interactive: false,
        className: ranked.bucket === null ? "win win-dark" : `win win-lit${strongest}`,
      }),
    );
  }
  return group;
}

function doorway(): HTMLElement {
  return h("span", { class: "door-wrap" }, h("span", { class: "door" }), h("span", { class: "door-label" }, "You"));
}

export function drawStreetMap(
  container: HTMLElement,
  opts: {
    venue: Venue;
    center: { lat: number; lng: number };
    radiusM: number;
    heat: HeatLayer[];
    loved: LovedPlace[];
    onTiles?: (shown: boolean) => void;
  },
): StreetMap {
  const map = L.map(container, {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: false,
    keyboard: true,
  });
  map.fitBounds(L.latLng(opts.center.lat, opts.center.lng).toBounds(opts.radiusM * 2), { padding: [12, 12] });
  const tiles = L.tileLayer(TILE_URL, { maxZoom: TILE_MAX_ZOOM, attribution: TILE_ATTRIBUTION });
  watchTiles(tiles, opts.onTiles);
  tiles.addTo(map);
  map.attributionControl.setPrefix(false);

  const panes: Panes = { unlit: pane(map, DARK_PANE, 380), lit: pane(map, LIT_PANE, 385), glow: pane(map, GLOW_PANE, 390) };
  const heatGroups = opts.heat.map((layer) => heatGroup(layer, panes));

  L.circle([opts.center.lat, opts.center.lng], {
    radius: opts.radiusM,
    color: CHALK,
    opacity: 0.55,
    weight: 1,
    dashArray: "2 6",
    fill: false,
    interactive: false,
  }).addTo(map);

  const venueAt = L.latLng(opts.center.lat, opts.center.lng);
  lovedPlacesLayer(map, venueAt, opts.loved).addTo(map);

  const venueIcon = L.divIcon({ className: "pin pin-venue", html: doorway(), iconSize: [VENUE_PIN.w, VENUE_PIN.h], iconAnchor: [VENUE_PIN.w / 2, VENUE_PIN.h / 2] });
  L.marker(venueAt, { icon: venueIcon, keyboard: false, title: opts.venue.entity.name, zIndexOffset: 1000 }).addTo(map);

  let shown: L.LayerGroup | null = null;
  const api: StreetMap = {
    showLayer(index) {
      if (shown) map.removeLayer(shown);
      shown = heatGroups[index] ?? null;
      if (shown) shown.addTo(map);
    },
    destroy() {
      map.remove();
    },
  };
  api.showLayer(0);
  return api;
}
