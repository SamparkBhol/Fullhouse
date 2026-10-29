import type { EntityRef } from "../../../src/shared/contract.ts";
import { proxiedImage } from "../../../src/shared/images.ts";
import { h } from "../dom.ts";
import { shapeOf, type CoverShape } from "./lines.ts";

export function hasImage(e: Pick<EntityRef, "image">): boolean {
  return proxiedImage(e.image) !== null;
}

// Some Qloo covers arrive as a tiny or single colour placeholder, which shows as a blank tile. The image comes through
// the Worker on this origin, so eight by eight pixels of it can be read back to tell.
function looksBlank(img: HTMLImageElement): boolean {
  if (img.naturalWidth < 16 || img.naturalHeight < 16) return true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) return false;
    g.drawImage(img, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data;
    let low = 255;
    let high = 0;
    let alpha = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = ((d[i] ?? 0) + (d[i + 1] ?? 0) + (d[i + 2] ?? 0)) / 3;
      low = Math.min(low, v);
      high = Math.max(high, v);
      alpha = Math.max(alpha, d[i + 3] ?? 0);
    }
    return alpha < 10 || high - low < 6;
  } catch {
    return false;
  }
}

// The name is set in the tile from the first paint, so a tile is never an empty rectangle. The picture covers it when
// it arrives; with no image, or one that fails or decodes blank, the name stays.
export function cover(e: Pick<EntityRef, "name" | "type" | "image">, opts: { shape?: CoverShape; className?: string; eager?: boolean; alt?: string } = {}): HTMLElement {
  const shape = opts.shape ?? shapeOf(e.type);
  const box = h("span", { class: ["cover", `cover-${shape}`, opts.className].filter(Boolean).join(" ") }, h("span", { class: "cover-paper", "aria-hidden": "true" }, e.name));
  const src = proxiedImage(e.image);
  if (!src) {
    box.classList.add("cover-none");
    return box;
  }
  const img = h("img", { src, alt: opts.alt ?? e.name, loading: opts.eager ? "eager" : "lazy", decoding: "async", ...(opts.eager ? { fetchpriority: "high" } : {}) });
  const paper = (): void => {
    box.classList.add("cover-none");
    img.remove();
  };
  img.addEventListener("error", paper, { once: true });
  img.addEventListener("load", () => (looksBlank(img) ? paper() : box.classList.add("cover-shown")), { once: true });
  box.append(img);
  return box;
}

const warmed = new Set<string>();

// Fetches a few images ahead of the screen that shows them, so the pair's two photos are in the cache before the
// partner screen lands.
export function warmImages(entities: Array<Pick<EntityRef, "image"> | undefined | null>): void {
  for (const e of entities) {
    const src = e ? proxiedImage(e.image) : null;
    if (!src || warmed.has(src)) continue;
    warmed.add(src);
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  }
}
