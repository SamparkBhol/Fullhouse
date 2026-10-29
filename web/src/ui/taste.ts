import type { StreetRead, StreetTag } from "../../../src/shared/contract.ts";
import { h, uid } from "../dom.ts";
import { prettyTag } from "../format.ts";
import { gapLines } from "./lines.ts";

const TAGS_SHOWN = 10;

function tagItem(t: StreetTag, shared: Set<string>, ranked: boolean): HTMLElement {
  const both = shared.has(t.id);
  return h(
    "li",
    { class: both ? "tag-both" : null },
    ranked ? h("span", { class: "rank" }, String(t.rank)) : null,
    h("span", null, prettyTag(t.name)),
    both ? h("span", { class: "chip chip-yes" }, "both") : null,
  );
}

// A location signal scores the street's tags almost level, so that column is a set; the venue's own tags are ranked.
function tagColumn(label: string, tags: StreetTag[], shared: Set<string>, ranked: boolean, emptyText: string): HTMLElement {
  const id = uid("tags");
  const top = [...tags].sort((a, b) => a.rank - b.rank).slice(0, TAGS_SHOWN);
  return h(
    "div",
    { class: "tag-col" },
    h("h3", { id }, label),
    top.length ? h(ranked ? "ol" : "ul", { class: "tag-rows", "aria-labelledby": id }, top.map((t) => tagItem(t, shared, ranked))) : h("p", { class: "empty" }, emptyText),
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
    tagColumn("The street", read.streetTags, shared, false, "No taste tags came back for this street."),
    tagColumn(venueName, read.venueTags, shared, true, "No taste tags came back for your venue."),
  );
}

const LIKED_MIN = 3;

// What the venue is liked for: the engine's filtered list, rarest on the street first. A read from before the list
// existed, or one with under three telling tags, shows nothing here rather than a menu.
export function tastePanel(read: StreetRead, venueName: string): HTMLElement | null {
  const liked = read.likedFor ?? [];
  if (liked.length < LIKED_MIN) return null;
  const id = uid("liked");
  return h(
    "section",
    { class: "panel", "aria-labelledby": id },
    h("h2", { id }, `What ${venueName} is liked for`),
    h("p", null, "The tags people who like you put on you that most of the street does not carry, rarest first."),
    h("ul", { class: "tags" }, liked.map((t) => h("li", null, prettyTag(t.name), t.pool ? h("small", null, `${t.carriers ?? 0} of ${t.pool} nearby`) : null))),
  );
}

export function gapPanel(read: StreetRead): HTMLElement {
  const { intro, lines } = gapLines(read.gaps);
  return h(
    "section",
    { class: "panel", "aria-labelledby": "gaps-title" },
    h("h2", { id: "gaps-title" }, "What the places your crowd loves have that you do not"),
    h("p", null, intro ?? "Tags two or more of the places your crowd loves carry, and your venue does not."),
    lines.length
      ? h("ul", { class: "items" }, lines.map((l) => h("li", { class: "item item-text" }, h("div", null, h("span", { class: "item-name" }, l.text), l.note ? h("span", { class: "item-sub" }, l.note) : null), l.count ? h("span", { class: "item-end num" }, l.count) : h("span"))))
      : h("p", { class: "empty" }, "No tag is on two or more of the places your crowd loves most and missing from yours."),
  );
}
