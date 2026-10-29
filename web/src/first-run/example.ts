import { listWords } from "../../../src/shared/words.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { prettyTag } from "../format.ts";
import type { Example } from "../joint.ts";
import { cover } from "../ui/cover.ts";
import { shortName, splitBar } from "../ui/split-bar.ts";

function photo(p: Example["venue"]): HTMLElement {
  return h("figure", { class: "pair-place" }, cover(p, { shape: "square", className: "pair-photo", eager: true }), h("figcaption", { class: "pair-name" }, shortName(p.name)));
}

export function examplePair(ex: Example): HTMLElement {
  const shared = ex.shared.map((t) => prettyTag(t).toLowerCase());
  return h(
    "section",
    { class: "example", "aria-labelledby": "example-title" },
    h("h2", { id: "example-title", class: "example-title" }, "Two places whose crowds overlap, from a real Qloo read"),
    h(
      "div",
      { class: "pair" },
      photo(ex.venue),
      h("p", { class: "pair-apart" }, ex.minutes ? `${ex.minutes} min walk` : "Nearby"),
      photo(ex.partner),
    ),
    ex.title ? h("p", { class: "example-night" }, "The night both crowds would want is ", h("strong", null, ex.title), ".") : null,
    ex.split ? splitBar(ex.split, ex.venue.name, ex.partner.name) : null,
    shared.length ? h("p", { class: "example-shared" }, `Both crowds share ${listWords(shared)}.`) : null,
  );
}

// The landing shows the example only when the server holds one; otherwise the slot stays empty.
export function loadExample(slot: HTMLElement): void {
  void api.example().then((ex) => {
    if (!ex || !slot.isConnected) return;
    replace(slot, examplePair(ex));
    slot.hidden = false;
  });
}
