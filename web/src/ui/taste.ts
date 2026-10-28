import type { StreetRead, StreetTag } from "../../../src/shared/contract.ts";
import { h, uid } from "../dom.ts";
import { prettyTag } from "../format.ts";
import { reasons } from "./receipt.ts";
import { empty } from "./states.ts";

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
    h("h3", { id }, label),
    top.length
      ? h(ranked ? "ol" : "ul", { class: ranked ? "ranked" : "ranked tag-set", "aria-labelledby": id }, top.map((t) => tagItem(t, shared, ranked)))
      : h("p", { class: "meta" }, emptyText),
  );
}

export function tasteSection(read: StreetRead, venueName: string): HTMLElement {
  const shared = new Set(read.shared.map((t) => t.id));
  return h(
    "section",
    { class: "block", "aria-labelledby": "taste-title" },
    h("h2", { id: "taste-title" }, "What the street likes, and what you are liked for"),
    h("p", { class: "meta" }, "Taste tags from Qloo. The street's come as a set in no order, yours are ranked. Marked tags are in both."),
    h(
      "div",
      { class: "tag-cols" },
      tagColumn("The street", read.streetTags, shared, false, "Qloo returned no taste tags for this street."),
      tagColumn(venueName, read.venueTags, shared, true, "Qloo returned no taste tags for your venue."),
    ),
  );
}

export function gapSection(read: StreetRead, tz: string): HTMLElement {
  return h(
    "section",
    { class: "block", "aria-labelledby": "gap-title" },
    h("h2", { id: "gap-title" }, "Found nearby, not here"),
    h("p", { class: "meta" }, "Tags that two or more of the places your audience loves nearby carry, and your venue does not."),
    read.gaps.length
      ? h(
          "ul",
          { class: "picks" },
          read.gaps.map((g) => h("li", { class: "pick" }, h("p", { class: "pick-name" }, prettyTag(g.tag.name)), h("p", { class: "pick-note" }, g.note), reasons(g.because, read.provenance, tz))),
        )
      : empty("Qloo compared your venue with the places your audience loves most nearby. No tag is on two or more of them and missing from yours."),
  );
}
