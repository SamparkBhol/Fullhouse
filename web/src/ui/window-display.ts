import type { StreetRead, Venue } from "../../../src/shared/contract.ts";
import { h } from "../dom.ts";
import { moment, prettyTag } from "../format.ts";
import { postcards } from "./postcard.ts";
import { mixedLine, shelf } from "./shelf.ts";
import { ledge } from "./ledge.ts";

// The venue's window this week: the top two of each kind Qloo ranked for its audience, then the places nearby it loves most.
export function windowSection(venueId: string, venue: Venue, read: StreetRead): HTMLElement {
  const base = `/v/${encodeURIComponent(venueId)}`;
  const ranked = read.rising.filter((r) => r.venueSignal !== false && r.rank <= 2).sort((a, b) => a.rank - b.rank);
  const kinds = [...new Set(read.rising.map((r) => r.type))];
  const picks = kinds.flatMap((k) => ranked.filter((r) => r.type === k));
  const places = [...read.lovedPlaces].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const gaps = read.gaps.slice(0, 3).map((g) => prettyTag(g.tag.name));
  return ledge(
    { label: "This week's window", className: "ledge-week" },
    h("p", { class: "meta" }, `What people who like ${venue.entity.name} love, from the read on ${moment(read.at, venue.tz)}.`),
    picks.length
      ? shelf(
          picks.map((r) => ({ entity: r, line: mixedLine(r) })),
          { label: "This week's picks" },
        )
      : h("p", null, "Qloo returned no artists, books, films, shows or podcasts tied to your venue."),
    places.length ? [h("h3", { class: "ledge-sub" }, "Loved nearby"), postcards(places)] : null,
    gaps.length ? h("p", { class: "gap-line" }, `Found nearby, not here: ${gaps.join(", ")}.`) : null,
    h("p", { class: "actions" }, h("a", { class: "button button-quiet", href: `${base}/street` }, "Open the street read")),
  );
}
