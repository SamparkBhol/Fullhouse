import * as L from "leaflet";
import type { LovedPlace } from "../../../src/shared/contract.ts";
import { shortName } from "../../../src/shared/words.ts";
import { h } from "../dom.ts";
import { walkShort } from "../format.ts";
import { layoutPins, type Point } from "./map-layout.ts";

const INK = "#14201a";
// Above the heat squares and below the pins, so a line back to a spot shows on a dark square too.
const LEADER_PANE = "leaders";
export const VENUE_PIN = { w: 48, h: 28 };
export const PLACE_PIN = 26;
// Moved less than this, a pin still sits on its spot and needs no line back to it.
const MOVED_PX = 3;

interface Spot {
  place: LovedPlace;
  number: number;
  at: L.LatLng;
}

function tip(p: LovedPlace): HTMLElement {
  return h("span", null, h("strong", null, shortName(p.name)), h("span", null, walkShort(p.distanceM)));
}

function placeMarker(s: Spot, at: L.LatLng, partner: boolean): L.Marker {
  const half = PLACE_PIN / 2;
  const face = h("span", null, String(s.number));
  const icon = L.divIcon({ className: partner ? "pin pin-them" : "pin", html: face, iconSize: [PLACE_PIN, PLACE_PIN], iconAnchor: [half, half] });
  const marker = L.marker(at, { icon, keyboard: true, alt: shortName(s.place.name), zIndexOffset: partner ? 800 : 500 });
  marker.bindTooltip(tip(s.place), { direction: "top", offset: [0, -half - 2], className: "pin-tip" });
  marker.on("add", () => marker.getElement()?.setAttribute("aria-label", `${s.number}. ${shortName(s.place.name)}, ${walkShort(s.place.distanceM)}${partner ? ", your partner" : ""}`));
  return marker;
}

// Numbered pins for the loved places, laid out again on every zoom so close places never cover each other or the venue.
export function lovedPlacesLayer(map: L.Map, venueAt: L.LatLng, loved: LovedPlace[], partnerId: string | null): L.LayerGroup {
  const spots: Spot[] = [];
  loved.forEach((place, i) => {
    if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) spots.push({ place, number: i + 1, at: L.latLng(place.lat, place.lng) });
  });
  const group = L.layerGroup();
  if (!map.getPane(LEADER_PANE)) map.createPane(LEADER_PANE).style.zIndex = "450";
  const line = { pane: LEADER_PANE, interactive: false };

  const draw = (): void => {
    group.clearLayers();
    const zoom = map.getZoom();
    const px = (at: L.LatLng): Point => map.project(at, zoom);
    const venue = { ...px(venueAt), ...VENUE_PIN };
    const shown = layoutPins(spots.map((s) => px(s.at)), venue, PLACE_PIN);
    spots.forEach((s, i) => {
      const where = shown[i] ?? px(s.at);
      const drawnAt = map.unproject(L.point(where.x, where.y), zoom);
      const from = px(s.at);
      if (Math.hypot(where.x - from.x, where.y - from.y) > MOVED_PX) {
        group.addLayer(L.polyline([s.at, drawnAt], { ...line, color: INK, weight: 1.25, opacity: 0.7 }));
        group.addLayer(L.circleMarker(s.at, { ...line, radius: 2.5, color: INK, weight: 1, fillColor: INK, fillOpacity: 1 }));
      }
      group.addLayer(placeMarker(s, drawnAt, s.place.id === partnerId));
    });
  };

  map.on("zoomend", draw);
  draw();
  return group;
}
