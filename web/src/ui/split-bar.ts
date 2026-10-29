import { plainName } from "../../../src/shared/words.ts";
import { h } from "../dom.ts";
import type { CrowdSplit } from "../joint.ts";

// "Angelika Film Center & Cafe, New York" is said as "Angelika Film Center & Cafe" beside a number.
export function shortName(name: string): string {
  return plainName(name).split(",")[0]?.trim() || name;
}

// One bar for the two crowds behind a pick, read from one Qloo answer: your side solid, theirs hatched.
export function splitBar(split: CrowdSplit, venueName: string, partnerName: string, opts: { className?: string } = {}): HTMLElement {
  const a = h("span", { class: "split-a" });
  const b = h("span", { class: "split-b" });
  const total = split.venue + split.partner || 1;
  a.style.flexGrow = String(split.venue / total);
  b.style.flexGrow = String(split.partner / total);
  return h(
    "figure",
    { class: ["split", opts.className].filter(Boolean).join(" ") },
    h("div", { class: "split-bar", "aria-hidden": "true" }, a, b),
    h(
      "figcaption",
      { class: "split-words" },
      h("span", { class: "split-word split-word-a" }, `${shortName(venueName)} crowd `, h("strong", null, String(split.venue))),
      h("span", { class: "split-word split-word-b" }, `${shortName(partnerName)} crowd `, h("strong", null, String(split.partner))),
    ),
  );
}
