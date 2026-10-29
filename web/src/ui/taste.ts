import type { StreetRead, StreetTag } from "../../../src/shared/contract.ts";
import { h, uid } from "../dom.ts";
import { prettyTag } from "../format.ts";
import { chalkboard } from "./chalkboard.ts";
import { gapLines } from "./lines.ts";

const TAGS_SHOWN = 10;

function tagItem(t: StreetTag, shared: Set<string>, ranked: boolean): HTMLElement {
  const both = shared.has(t.id);
  return h(
    "li",
    { class: both ? "shared" : "" },
    ranked ? h("span", { class: "rank-no" }, String(t.rank)) : null,
    h("span", { class: "rank-name" }, prettyTag(t.name)),
    both ? h("span", { class: "shared-mark" }, h("span", { class: "sr-only" }, "in both lists")) : null,
  );
}

// A location signal scores the street's tags almost level, so that column is a set; the venue's own tags are ranked.
function tagColumn(label: string, tags: StreetTag[], shared: Set<string>, ranked: boolean, emptyText: string): HTMLElement {
  const id = uid("tags");
  const top = [...tags].sort((a, b) => a.rank - b.rank).slice(0, TAGS_SHOWN);
  return h(
    "div",
    { class: "tag-col" },
    h("h4", { id }, label),
    top.length
      ? h(ranked ? "ol" : "ul", { class: ranked ? "ranked" : "ranked tag-set", "aria-labelledby": id }, top.map((t) => tagItem(t, shared, ranked)))
      : h("p", null, emptyText),
  );
}

// Marked means the tag is in both columns on screen, matched by id or by name across namespaces.
function inBoth(street: StreetTag[], venue: StreetTag[]): Set<string> {
  const key = (t: StreetTag) => prettyTag(t.name).toLowerCase();
  const venueKeys = new Set(venue.flatMap((t) => [t.id, key(t)]));
  const streetKeys = new Set(street.flatMap((t) => [t.id, key(t)]));
  const marked = new Set<string>();
  for (const t of street) if (venueKeys.has(t.id) || venueKeys.has(key(t))) marked.add(t.id);
  for (const t of venue) if (streetKeys.has(t.id) || streetKeys.has(key(t))) marked.add(t.id);
  return marked;
}

export function tagColumns(read: StreetRead, venueName: string): HTMLElement {
  const top = (tags: StreetTag[]) => [...tags].sort((a, b) => a.rank - b.rank).slice(0, TAGS_SHOWN);
  const shared = inBoth(top(read.streetTags), top(read.venueTags));
  return h(
    "div",
    { class: "tag-cols" },
    tagColumn("The street", read.streetTags, shared, false, "Qloo returned no taste tags for this street."),
    tagColumn(venueName, read.venueTags, shared, true, "Qloo returned no taste tags for your venue."),
  );
}

export function gapBoard(read: StreetRead): HTMLElement {
  const { intro, lines } = gapLines(read.gaps);
  return chalkboard({
    title: "Found nearby, not here",
    level: "h2",
    className: "slate-gaps",
    ...(intro ? { intro } : {}),
    lines,
    empty: "Qloo compared your venue with the places your audience loves most nearby. No tag is on two or more of them and missing from yours.",
  });
}
