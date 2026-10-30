import type { ScanRecord } from "../../../src/shared/scan.ts";
import { asTable } from "../charts/table.ts";
import { h, replace } from "../dom.ts";
import { loadScan, scanFigure } from "../ui/scan-band.ts";

function table(r: ScanRecord): HTMLDetailsElement {
  const rows = [{ city: "Both cities", totals: r.overall }, ...r.cities].map(({ city, totals: t }) => [
    city,
    t.venues,
    t.twoWay,
    t.medianFit ?? "none",
    t.medianWalk ?? "none",
    t.openTogether,
  ]);
  return asTable("scan", {
    caption: "The street scan",
    head: ["Where", "Venues read", `Two way within ${r.walkMax} min`, "Median fit", "Median walk, min", "Open together"],
    rows,
    numeric: [false, true, true, true, true, true],
  });
}

// The stored scan under the live counters. It changes only when a new scan is stored, so it is asked once.
export function scanPanel(): HTMLElement {
  const panel = h("section", { class: "panel pane board-scan", hidden: true, "aria-label": "The street scan", "data-pane": "scan" });
  void loadScan().then((r) => {
    if (!r?.overall.venues) return;
    replace(panel, scanFigure(r, { heading: "h2" }), table(r));
    panel.hidden = false;
  });
  return panel;
}
