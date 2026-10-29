import type { LovedPlace, NightPlan } from "../../shared/contract.ts";
import { proxiedImage } from "../../shared/images.ts";
import { plainName } from "../../shared/words.ts";
import { esc } from "./html.ts";

export interface PublicArt {
  image: string;
  shape: "square" | "portrait";
}

export interface PublicNearby {
  name: string;
  walkMin: number;
  image?: string;
  reason: string;
}

const NEARBY_SHOWN = 3;

export function featureArt(n: Pick<NightPlan, "feature">): PublicArt | null {
  const f = n.feature;
  const image = proxiedImage(f?.image);
  if (!f || !image) return null;
  return { image, shape: f.type === "artist" || f.type === "podcast" ? "square" : "portrait" };
}

// Guests see the nearby places as places to go before or after, never as partners who have agreed to anything.
export function nearbyPlaces(partners: LovedPlace[], venueName: string): PublicNearby[] {
  return partners.slice(0, NEARBY_SHOWN).map((p) => {
    const out: PublicNearby = {
      name: p.name,
      walkMin: Math.max(1, Math.round(p.distanceM / 80)),
      reason: `Loved by people who like ${venueName}`,
    };
    const image = proxiedImage(p.image);
    if (image) out.image = image;
    return out;
  });
}

// The cover printed in the flyer's one ink beside the headline.
export function headWithArt(heading: string, art: PublicArt | undefined): string {
  if (!art) return heading;
  return `<div class="head">${heading}<span class="print print-${art.shape}"><img src="${esc(art.image)}" alt="" decoding="async"></span></div>`;
}

// Under the one lit window, each part rests on the street side with a plain label, as in the owner app.
export function ledgeHtml(id: string, heading: string, body: string): string {
  return `<section class="ledge" aria-labelledby="${id}"><h2 id="${id}">${esc(heading)}</h2>${body}</section>`;
}

// When every place is there for the same reason, the reason is said once above the postcards.
export function nearbySection(places: PublicNearby[] | undefined): string {
  if (!places?.length) return "";
  const first = places[0]?.reason;
  const shared = places.length > 1 && places.every((p) => p.reason === first) ? first : null;
  const rows = places
    .map((p) => {
      const name = esc(plainName(p.name));
      return (
        `<li>${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async">` : `<span class="blank" aria-hidden="true">${name}</span>`}` +
        `<p><strong>${name}</strong><span>${p.walkMin} min walk</span>${shared ? "" : `<span>${esc(p.reason)}.</span>`}</p></li>`
      );
    })
    .join("");
  return ledgeHtml("near-title", "Close by, for before or after", `${shared ? `<p class="near-why">${esc(shared)}.</p>` : ""}<ul class="near">${rows}</ul>`);
}
