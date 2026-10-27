import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { HeatLayer, LovedPlace, Venue } from "../../../src/shared/contract.ts";
import { geohashBounds, squareAround } from "../geohash.ts";
import { HEAT_BUCKETS, rankCells } from "../heat.ts";

const INK = "#1D3150";
const FILL = [0.82, 0.62, 0.44, 0.28, 0.14];

// Geohash cells are tall at high latitudes; the spec asks for squares, so each cell becomes a square of its shorter side.
function cellSide(hash: string, lat: number): number {
  const g = geohashBounds(hash);
  if (!g) return 90;
  const height = (g.north - g.south) * 111320;
  const width = (g.east - g.west) * 111320 * Math.cos((lat * Math.PI) / 180);
  return Math.max(20, Math.min(height, width) * 0.9);
}

export interface StreetMap {
  showLayer(index: number): void;
  destroy(): void;
}

export function drawStreetMap(
  container: HTMLElement,
  opts: { venue: Venue; center: { lat: number; lng: number }; radiusM: number; heat: HeatLayer[]; loved: LovedPlace[] },
): StreetMap {
  const map = L.map(container, {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: false,
    keyboard: true,
  });
  map.fitBounds(L.latLng(opts.center.lat, opts.center.lng).toBounds(opts.radiusM * 2), { padding: [12, 12] });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  map.attributionControl.setPrefix(false);

  const heatGroups = opts.heat.map((layer) => {
    const group = L.layerGroup();
    for (const ranked of rankCells(layer.cells)) {
      const c = ranked.cell;
      const b = squareAround(c.lat, c.lng, cellSide(c.geohash, c.lat));
      const rect = L.rectangle(
        [
          [b.south, b.west],
          [b.north, b.east],
        ],
        ranked.bucket === null
          ? { color: INK, weight: 1, dashArray: "3 3", fill: false, interactive: false }
          : {
              color: INK,
              weight: ranked.bucket === 0 ? 1.5 : 0.75,
              fillColor: INK,
              fillOpacity: FILL[Math.min(ranked.bucket, HEAT_BUCKETS - 1)] ?? 0.14,
              interactive: false,
            },
      );
      group.addLayer(rect);
    }
    return group;
  });

  const places = L.layerGroup();
  opts.loved.forEach((p, i) => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
    const icon = L.divIcon({
      className: "pin pin-place",
      html: `<span>${i + 1}</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    places.addLayer(L.marker([p.lat, p.lng], { icon, keyboard: false, title: p.name, alt: p.name }));
  });
  places.addTo(map);

  const venueIcon = L.divIcon({ className: "pin pin-venue", html: "<span>You</span>", iconSize: [44, 28], iconAnchor: [22, 14] });
  L.marker([opts.center.lat, opts.center.lng], { icon: venueIcon, keyboard: false, title: opts.venue.entity.name, zIndexOffset: 1000 }).addTo(map);

  L.circle([opts.center.lat, opts.center.lng], {
    radius: opts.radiusM,
    color: INK,
    weight: 1,
    dashArray: "2 6",
    fill: false,
    interactive: false,
  }).addTo(map);

  let shown: L.LayerGroup | null = null;
  const api: StreetMap = {
    showLayer(index) {
      if (shown) map.removeLayer(shown);
      shown = heatGroups[index] ?? null;
      if (shown) shown.addTo(map);
      places.eachLayer((m) => (m as L.Marker).setZIndexOffset(500));
    },
    destroy() {
      map.remove();
    },
  };
  api.showLayer(0);
  return api;
}
