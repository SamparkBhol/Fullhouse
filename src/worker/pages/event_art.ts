import type { NightPlan } from "../../shared/contract.ts";
import { proxiedImage } from "../../shared/images.ts";
import { shortName } from "../../shared/words.ts";
import { panel } from "./chrome.ts";
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

// The cover sits beside a heading that already names it, so the image itself stays silent.
export function artHtml(art: PublicArt): string {
  const shape = art.shape === "square" ? "square" : "portrait";
  return `<span class="art art-${shape}"><img src="${esc(art.image)}" alt="" decoding="async"></span>`;
}

export function headWithArt(heading: string, art: PublicArt | undefined): string {
  if (!art) return heading;
  return `<div class="head">${heading}${artHtml(art)}</div>`;
}

// The partner appears only after it said yes, as the other half of the night. The page says how the yes came
// (through an invite link), whether the partner confirmed its own stop, and whether it tells its regulars.
export function partnerSection(p: PublicPartner | undefined, venueName: string): string {
  if (!p) return "";
  const name = esc(shortName(p.name));
  const walk = `about ${p.walkMin} minute${p.walkMin === 1 ? "" : "s"} on foot`;
  const v = esc(shortName(venueName));
  const stop = p.hosts ? `It happens at ${name}, ${walk} from ${v}.` : `${name} is ${walk} from ${v}.`;
  const how = p.confirmed
    ? `${name} answered through an invite link and set its own time and what runs there.`
    : p.answered
      ? `${name} answered through an invite link. Its stop is proposed, subject to its own programme.`
      : "";
  const regulars = p.tellsRegulars ? " It tells its regulars too." : "";
  const where = [stop, how].filter(Boolean).join(" ") + regulars;
  const photo = p.image ? `<img class="with-photo" src="${esc(p.image)}" alt="${esc(shortName(p.name))}, from the street" loading="lazy" decoding="async">` : "";
  return panel(
    "with-title",
    `Put on with ${shortName(p.name)}`,
    `<div class="with${photo ? "" : " with-plain"}">${photo}<div><p class="with-name">${name}</p><p class="with-why">${where}</p></div></div>`,
  );
}
