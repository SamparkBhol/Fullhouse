import type { ScanAnswer, ScanRecord, ScanTotals } from "../../../src/shared/scan.ts";
import { h } from "../dom.ts";
import { callsLine, cityLine, formatsLine, scanFacts, scanHeadline, twoWayLine } from "./scan-words.ts";

let asked: Promise<ScanRecord | null> | null = null;

// The latest stored scan, asked once per page load. Any failure reads as no scan, so the band stays away.
export function loadScan(): Promise<ScanRecord | null> {
  asked ??= fetch("/api/scan", { headers: { Accept: "application/json" }, credentials: "same-origin" })
    .then(async (res) => (res.ok ? ((await res.json()) as ScanAnswer).scan : null))
    .catch(() => null);
  return asked;
}

type DoorKind = "both" | "one" | "none";

function door(kind: DoorKind): HTMLElement {
  return h("i", { class: `door-mark door-${kind}` });
}

// One door per venue read: split in both colours when the pair goes both ways within the walk.
const MOST_IN_A_ROW = 24;

function street(city: string, t: ScanTotals): HTMLElement {
  const doors = [
    ...Array.from({ length: t.twoWay }, () => door("both")),
    ...Array.from({ length: t.matched - t.twoWay }, () => door("one")),
    ...Array.from({ length: t.venues - t.matched }, () => door("none")),
  ];
  const row = h("div", { class: "street-doors", "aria-hidden": "true" }, doors);
  row.style.setProperty("--cols", String(Math.max(1, Math.min(doors.length, MOST_IN_A_ROW))));
  return h("div", { class: "street" }, row, h("p", { class: "street-name" }, h("b", null, city), h("span", null, cityLine(t))));
}

function key(r: ScanRecord): HTMLElement {
  const unmatched = r.overall.venues - r.overall.matched;
  return h(
    "ul",
    { class: "street-key" },
    h("li", null, door("both"), `Two way within ${r.walkMax} minutes`),
    h("li", null, door("one"), "Partner found, not two way within the walk"),
    unmatched > 0 ? h("li", null, door("none"), "No partner found") : null,
  );
}

export function scanFigure(r: ScanRecord, opts: { heading: "h2" | "h3" }): HTMLElement {
  const formats = formatsLine(r.overall);
  return h(
    "div",
    { class: "scan" },
    h(
      "div",
      { class: "scan-copy" },
      h(opts.heading, { class: "scan-title" }, scanHeadline(r)),
      h("p", { class: "scan-lead" }, twoWayLine(r.overall, r.walkMax)),
      h(
        "dl",
        { class: "scan-facts" },
        scanFacts(r.overall).map((f) => h("div", null, h("dt", null, f.label), h("dd", null, h("strong", null, f.value), h("span", null, f.note)))),
      ),
      formats ? h("p", { class: "scan-formats" }, formats) : null,
    ),
    h("div", { class: "scan-streets" }, r.cities.map((c) => street(c.city, c.totals)), key(r)),
    h("p", { class: "scan-method" }, `${r.method} ${callsLine(r)}`),
  );
}
