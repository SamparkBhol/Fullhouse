import type { NightPlan } from "../../shared/contract.ts";
import { proxiedImage } from "../../shared/images.ts";
import { plainName } from "../../shared/words.ts";
import type { PublicPartner } from "./event.ts";
import { esc } from "./html.ts";

export interface PublicArt {
  image: string;
  shape: "square" | "portrait";
}

export function featureArt(n: Pick<NightPlan, "feature">): PublicArt | null {
  const f = n.feature;
  const image = proxiedImage(f?.image);
  if (!f || !image) return null;
  return { image, shape: f.type === "artist" || f.type === "podcast" ? "square" : "portrait" };
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

// The partner appears only after it said yes, as the other half of the night, not as a place to go before or after.
export function partnerSection(p: PublicPartner | undefined, venueName: string): string {
  if (!p) return "";
  const name = esc(plainName(p.name));
  const where = p.hosts ? `It happens at ${name}, ${p.walkMin} min walk from ${esc(venueName)}.` : `${name} is ${p.walkMin} min walk away and tells its regulars too.`;
  const card =
    `<li>${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async">` : `<span class="blank" aria-hidden="true">${name}</span>`}` +
    `<p><strong>${name}</strong><span>${p.walkMin} min walk</span></p></li>`;
  return ledgeHtml("with-title", `Put on with ${plainName(p.name)}`, `<p class="near-why">${where}</p><ul class="near">${card}</ul>`);
}
