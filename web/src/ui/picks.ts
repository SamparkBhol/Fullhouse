import type { QlooType, Rising, StreetRead } from "../../../src/shared/contract.ts";
import { h, uid } from "../dom.ts";
import { TREND_WORDS } from "../format.ts";
import { listReason, moreRows, ownReasons, sharedLine } from "./lists.ts";
import { reasons } from "./receipt.ts";

const TYPE_HEADINGS: Record<QlooType, string> = {
  place: "Places",
  artist: "Artists",
  book: "Books",
  movie: "Films",
  tv_show: "TV shows",
  podcast: "Podcasts",
  videogame: "Video games",
  brand: "Brands",
  person: "People",
  destination: "Destinations",
};

const PICKS_SHOWN = 5;

// Qloo's weekly series held flat, so a trend is shown only when one actually moved.
function pickRow(r: Rising, read: StreetRead, tz: string, shared: ReturnType<typeof sharedLine>): HTMLElement {
  return h(
    "li",
    { class: "pick pick-ranked" },
    h("span", { class: "rank-no", "aria-hidden": "true" }, String(r.rank)),
    h(
      "div",
      { class: "pick-head" },
      h("p", { class: "pick-name" }, r.name),
      r.trend !== "unknown" ? h("p", { class: `trend trend-${r.trend}` }, TREND_WORDS[r.trend]) : null,
    ),
    r.trendNote ? h("p", { class: "meta" }, `${r.trendNote}.`) : null,
    reasons(ownReasons(r, shared), read.provenance, tz),
  );
}

export function pickGroups(read: StreetRead, tz: string): HTMLElement[] {
  const types = [...new Set(read.rising.map((r) => r.type))];
  return types.map((type) => {
    const picks = read.rising.filter((r) => r.type === type).sort((a, b) => a.rank - b.rank);
    const shared = sharedLine(picks);
    const id = uid("picks");
    const rows = picks.map((r) => pickRow(r, read, tz, shared));
    return h(
      "div",
      { class: "pick-group" },
      h("h3", { id }, TYPE_HEADINGS[type] ?? type),
      listReason(shared, read.provenance, tz),
      h("ol", { class: "picks", "aria-labelledby": id }, rows.slice(0, PICKS_SHOWN)),
      moreRows(rows, PICKS_SHOWN, (n) => `${n} more`, "picks"),
    );
  });
}
