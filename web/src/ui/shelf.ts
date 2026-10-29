import type { EntityRef } from "../../../src/shared/contract.ts";
import { h } from "../dom.ts";
import { cover } from "./cover.ts";
import { shapeOf } from "./lines.ts";

export { mixedLine, pickLine } from "./lines.ts";

export interface ShelfItem {
  entity: Pick<EntityRef, "name" | "type" | "image">;
  line?: string;
}

// Covers stand face out on one shelf at their own shapes; on a phone the shelf scrolls sideways.
export function shelf(items: ShelfItem[], opts: { label: string; size?: "big" | "small"; ranked?: boolean }): HTMLElement {
  const size = opts.size ?? "big";
  return h(
    "div",
    { class: `shelf shelf-${size}`, role: "region", "aria-label": opts.label, tabindex: "0" },
    h(
      opts.ranked === false ? "ul" : "ol",
      { class: "shelf-row" },
      items.map((it) =>
        h(
          "li",
          { class: `shelf-item shelf-${shapeOf(it.entity.type)}` },
          h("span", { class: "shelf-stand" }, cover(it.entity)),
          h("p", { class: "shelf-name" }, it.entity.name),
          it.line ? h("p", { class: "shelf-line" }, it.line) : null,
        ),
      ),
    ),
  );
}
