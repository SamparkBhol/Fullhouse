import { h, replace } from "../dom.ts";
import { loadScan, scanFigure } from "../ui/scan-band.ts";

// Hidden until a stored scan arrives; with none stored the landing shows nothing here.
export function scanBand(): HTMLElement {
  const wrap = h("div", { class: "wrap" });
  const band = h("section", { class: "band band-scan", id: "scan", hidden: true, "aria-label": "The street scan" }, wrap);
  void loadScan().then((r) => {
    if (!r?.overall.venues) return;
    replace(wrap, scanFigure(r, { heading: "h2" }));
    band.hidden = false;
  });
  return band;
}
