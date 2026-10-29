import * as L from "leaflet";
import type { LovedPlace } from "../../../src/shared/contract.ts";
import { proxiedImage } from "../../../src/shared/images.ts";
import { plainName } from "../../../src/shared/words.ts";
import { h, replace } from "../dom.ts";
import { walkShort } from "../format.ts";
import { layoutPins, PIN_SIZE, type Point } from "./map-layout.ts";

const CHALK = "#F3F5F8";
const FASCIA = "#243A53";
// Above the windows and below the pins, so a line back to a spot shows on lit windows too.
const LEADER_PANE = "leaders";
export const VENUE_PIN = { w: 40, h: 48 };
// Moved less than this, a pin still sits on its spot and needs no line back to it.
const MOVED_PX = 3;
// On a phone the map is about 350 px wide, so smaller photos keep the ring round the venue tight.
const NARROW_PX = 480;
const NARROW_PIN = 28;

interface Spot {
  place: LovedPlace;
  number: number;
  at: L.LatLng;
}

// A round photo of the place; without one, or when it fails, the place's number on paper.
function pinFace(s: Spot): HTMLElement {
  const face = h("span", { class: "pin-face" });
  const paper = (): void => {
    face.classList.add("pin-paper");
    replace(face, String(s.number));
  };
  const src = proxiedImage(s.place.image);
  if (!src) paper();
  else {
    const img = h("img", { src, alt: "", decoding: "async" });
    img.addEventListener("error", paper, { once: true });
    face.append(img);
  }
  return face;
}

function tip(p: LovedPlace): HTMLElement {
  return h("span", { class: "pin-tip-text" }, h("strong", null, plainName(p.name)), h("span", null, walkShort(p.distanceM)));
}

function placeMarker(s: Spot, at: L.LatLng, size: number): L.Marker {
  const half = size / 2;
  const icon = L.divIcon({ className: "pin pin-place", html: pinFace(s), iconSize: [size, size], iconAnchor: [half, half] });
  const marker = L.marker(at, { icon, keyboard: true, alt: plainName(s.place.name), zIndexOffset: 500 });
  marker.bindTooltip(tip(s.place), { direction: "top", offset: [0, -half - 2], className: "pin-tip" });
  marker.on("add", () => marker.getElement()?.setAttribute("aria-label", `${plainName(s.place.name)}, ${walkShort(s.place.distanceM)}`));
  return marker;
}

// Photo pins for the loved places, laid out again on every zoom so close places never cover each other or the venue.
export function lovedPlacesLayer(map: L.Map, venueAt: L.LatLng, loved: LovedPlace[]): L.LayerGroup {
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
    const size = map.getSize().x < NARROW_PX ? NARROW_PIN : PIN_SIZE;
    const shown = layoutPins(spots.map((s) => px(s.at)), venue, size);
    spots.forEach((s, i) => {
      const where = shown[i] ?? px(s.at);
      const drawnAt = map.unproject(L.point(where.x, where.y), zoom);
      const from = px(s.at);
      if (Math.hypot(where.x - from.x, where.y - from.y) > MOVED_PX) {
        group.addLayer(L.polyline([s.at, drawnAt], { ...line, color: FASCIA, weight: 3.5, opacity: 0.8 }));
        group.addLayer(L.polyline([s.at, drawnAt], { ...line, color: CHALK, weight: 1.25 }));
        group.addLayer(L.circleMarker(s.at, { ...line, radius: 3, color: FASCIA, weight: 1.5, fillColor: CHALK, fillOpacity: 1 }));
      }
      group.addLayer(placeMarker(s, drawnAt, size));
    });
  };

  map.on("zoomend", draw);
  draw();
  return group;
}
