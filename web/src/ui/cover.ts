import type { EntityRef } from "../../../src/shared/contract.ts";
import { proxiedImage } from "../../../src/shared/images.ts";
import { h, replace } from "../dom.ts";
import { shapeOf, type CoverShape } from "./lines.ts";

export function hasImage(e: Pick<EntityRef, "image">): boolean {
  return proxiedImage(e.image) !== null;
}

// The name is printed beside every cover, so the image itself carries no alt text.
// With no image, or one that fails to load, the name is set on paper in its place.
export function cover(e: Pick<EntityRef, "name" | "type" | "image">, opts: { shape?: CoverShape; className?: string; eager?: boolean } = {}): HTMLElement {
  const shape = opts.shape ?? shapeOf(e.type);
  const box = h("span", { class: ["cover", `cover-${shape}`, opts.className].filter(Boolean).join(" ") });
  const paper = (): void => {
    box.classList.add("cover-none");
    replace(box, h("span", { class: "cover-paper", "aria-hidden": "true" }, e.name));
  };
  const src = proxiedImage(e.image);
  if (!src) {
    paper();
    return box;
  }
  const img = h("img", { src, alt: "", loading: opts.eager ? "eager" : "lazy", decoding: "async" });
  img.addEventListener("error", paper, { once: true });
  box.append(img);
  return box;
}
