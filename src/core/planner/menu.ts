import type { Because, MenuIdea, StreetRead, StreetTag, Venue } from "../../shared/contract.ts";
import { ordinal } from "../../shared/words.ts";
import { foodLed } from "../street/hosts.ts";
import { streetTagLine } from "../street/words.ts";
import { MENU_NAMESPACES, menuItem } from "./formats.ts";
import { provIndex, streetTagsIndex } from "./provenance.ts";

export const MENU_IDEAS = 3;

export interface MenuTag {
  tag: StreetTag;
  source: "venue" | "street" | "gap";
  order: number;
}

function words(name: string): string[] {
  return name.trim().toLowerCase().split(/\s+/);
}

// Fries and French Fries are one dish, so a name whose words end another name's words is the same idea.
function sameDish(a: string, b: string): boolean {
  const [x, y] = [words(a), words(b)];
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return long.slice(long.length - short.length).join(" ") === short.join(" ");
}

function isMenuTag(t: StreetTag): boolean {
  return MENU_NAMESPACES.includes(t.namespace) && t.namespace !== "urn:tag:dining_options:place";
}

// The venue's own audience ranks its food tags with a real spread; the street's arrive near level, so they come second.
export function menuTags(read: StreetRead): MenuTag[] {
  const out: MenuTag[] = [];
  const add = (tag: StreetTag, source: MenuTag["source"], order: number) => {
    if (!out.some((m) => m.tag.id === tag.id || sameDish(m.tag.name, tag.name))) out.push({ tag, source, order });
  };
  read.venueTags.filter(isMenuTag).forEach((t, i) => add(t, "venue", i + 1));
  read.streetTags.filter(isMenuTag).forEach((t, i) => add(t, "street", i + 1));
  return out;
}

function menuBecause(m: MenuTag, read: StreetRead, venue: Venue): Because | null {
  if (m.source === "gap") {
    const gap = read.gaps.find((g) => g.tag.id === m.tag.id);
    const prov = gap?.because[0]?.provenance;
    return gap && prov !== undefined ? { kind: "compare", text: gap.note.replace(/\.$/, ""), provenance: prov } : null;
  }
  if (m.source === "venue") {
    const prov = provIndex(read, ["venue_tags"]);
    return prov >= 0 ? { kind: "tag", text: `${ordinal(m.order)} among the food tags for people who like ${venue.entity.name}`, provenance: prov } : null;
  }
  const prov = streetTagsIndex(read);
  return prov >= 0 ? { kind: "tag", text: streetTagLine(m.tag.name, venue.entity.name), provenance: prov } : null;
}

// A bookshop or a cinema with a coffee counter is not asked to change its menu for a night.
export function menuFor(lead: StreetTag | null, read: StreetRead, venue: Venue): MenuIdea[] {
  if (!foodLed(venue.entity)) return [];
  const tags = menuTags(read);
  const first = lead ? (tags.find((m) => m.tag.id === lead.id) ?? { tag: lead, source: "gap" as const, order: 0 }) : undefined;
  const ordered = first ? [first, ...tags.filter((m) => m.tag.id !== first.tag.id)] : tags;
  return ordered.slice(0, MENU_IDEAS).flatMap((m) => {
    const because = menuBecause(m, read, venue);
    return because ? [{ text: `Add ${menuItem(m.tag)} to the menu for the night`, because: [because] }] : [];
  });
}
