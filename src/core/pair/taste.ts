import type { LovedPlace, StreetTag } from "../../shared/contract.ts";
import { BANNED_WORDS } from "../copy/text.ts";
import type { CompareRead } from "../qloo/compare.ts";
import { cleanTagName, tagLabel, tagNamespace } from "../qloo/tags.ts";
import { sameId } from "../qloo/values.ts";

export const SHOWN_TAGS = 3;

// Namespaces that say what people go to a place for: the first ones lead, the rest count for less.
// How you pay, how you get in, what age, what time of day and which amenities say nothing about taste.
const PREFERRED_NS = new Set([
  "urn:tag:interests:qloo",
  "urn:tag:ambience:qloo",
  "urn:tag:decor:qloo",
  "urn:tag:setting:qloo",
  "urn:tag:genre:music",
  "urn:tag:genre:media",
  "urn:tag:cuisine:qloo",
  "urn:tag:neighborhood_characteristic:qloo",
]);
const OTHER_NS = new Set([
  "urn:tag:keyword:media",
  "urn:tag:activity_type:qloo",
  "urn:tag:characteristic:place",
  "urn:tag:offerings:place",
  "urn:tag:beverage_offering:qloo",
  "urn:tag:culinary_style:qloo",
]);
const OTHER_WEIGHT = 0.6;

// These say how a place serves or what it is fit for, not what its crowd goes for.
const SERVICE = /\b(email|wedding|private|all you can eat|gluten|halal|kosher|healthy|organic|vegan|vegetarian|prepared|salad bar|used goods|ok to order|go for just|ingredients|options|catering|order ahead|counter|seating|service|takeout|delivery|outside food|grab and go|to go|quick bites?|remote work|work meetings?|work dinner|dining drinking|retail|supplies|clean|safe|efficient|bright|busy|cramped|productive|focused|early morning|all day|activism|social justice|politic\w*|religio\w*|faith|spiritual\w*)\b/;

const IDENTITY = /\b(lgbt\w*|queer|gay|lesbian|trans|transgender|race|racial|female|male|women\w*|men|mens|black|african|latin[aox]?|latinx|asian american|jewish|feminis\w*|gender|sexuality|identifies)\b/;

// Ages, formats and the plainest kinds of place come back for almost every pair, so they say nothing about these two.
const SAYS_NOTHING = new Set([
  "adult", "young adult", "contemporary", "kids", "children", "teen", "audiobook", "ebook", "paperback", "hardcover",
  "fiction", "nonfiction", "place", "food", "restaurant", "event venue", "shopping", "tourist attraction", "drinks", "alcohol",
]);

// What any evening out is: never a shared taste, even when nothing else is shared.
const ACTIVITY = new Set([
  "dining drinking", "social", "evening", "entertainment", "socializing", "casual socializing", "casual gathering", "nightlife",
  "culture arts", "arts culture", "browsing", "shopping", "sightseeing", "tours", "fun", "night out", "hanging out",
  "wifi", "free wifi", "restroom", "restrooms", "parking", "reservations", "credit cards",
]);

// True of almost any place that serves people, so these only show when nothing more specific is shared.
const GENERIC = new Set([
  "casual", "dinner", "lunch", "breakfast", "brunch", "trendy", "hip", "chic", "cozy", "good for groups", "groups", "family friendly",
  "coffee", "food", "drinks", "alcohol", "beer", "wine", "dessert", "seating", "quick bite", "morning", "midday", "afternoon",
  "comfortable", "welcoming", "charming", "social", "relaxed", "friendly", "locals", "dining drinking", "shopping", "sightseeing", "tours",
  "evening", "birthday", "anniversary", "informal", "fun", "browsing", "socializing", "casual socializing", "casual gathering", "entertainment",
]);

// A tag carried by a tenth of the places nearby or fewer is as telling as a tag gets.
const FULL_AT = Math.log(10);

export interface TasteTag {
  tag: StreetTag;
  distinct: number;
  strength: number;
  generic: boolean;
}

function words(name: string): string {
  return cleanTagName(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function telling(id: string, name: string): boolean {
  const w = words(name);
  const ns = tagNamespace(id);
  if (!w || !(PREFERRED_NS.has(ns) || OTHER_NS.has(ns))) return false;
  return !(IDENTITY.test(w) || SAYS_NOTHING.has(w) || ACTIVITY.has(w) || SERVICE.test(w) || BANNED_WORDS.some((b) => w.includes(b)));
}

function nsWeight(id: string): number {
  return PREFERRED_NS.has(tagNamespace(id)) ? 1 : OTHER_WEIGHT;
}

function nameOf(id: string): string {
  return cleanTagName(tagLabel(id)).toLowerCase();
}

// Shared tags from both places' own Qloo tags and, when there is one, the compare call between them. Each is weighed
// by the lower of the two sides' affinity times the log of one over its base rate among the places nearby.
export function sharedTaste(venue: { id: string; tags: string[] }, partner: Pick<LovedPlace, "id" | "tags">, nearby: Pick<LovedPlace, "id" | "tags">[], compare: CompareRead | null = null): TasteTag[] {
  const pool = nearby.filter((p) => !sameId(p.id, partner.id) && !sameId(p.id, venue.id));
  const theirs = new Set(partner.tags);
  const affinity = new Map<string, { name: string; aff: number }>();
  for (const id of venue.tags) if (theirs.has(id)) affinity.set(id, { name: nameOf(id), aff: 1 });
  for (const t of compare?.shared ?? []) {
    const had = affinity.get(t.id);
    const aff = Math.min(1, Math.max(0, t.score ?? 0));
    if (!had || had.aff < aff) affinity.set(t.id, { name: words(t.name), aff });
  }
  const scored = [...affinity.entries()]
    .filter(([id, v]) => v.aff > 0 && telling(id, v.name))
    .map(([id, v]): TasteTag => {
      const carriers = pool.filter((p) => p.tags.includes(id)).length;
      const base = (carriers + 1) / (pool.length + 1);
      const distinct = v.aff * nsWeight(id) * Math.log(1 / base);
      return {
        tag: { id, name: v.name, namespace: tagNamespace(id), rank: 0, carriers, pool: pool.length },
        distinct,
        strength: Math.min(1, distinct / FULL_AT),
        generic: GENERIC.has(v.name) || carriers * 2 > pool.length,
      };
    })
    .sort((a, b) => Number(a.generic) - Number(b.generic) || b.distinct - a.distinct || a.tag.name.localeCompare(b.tag.name));
  const seen = new Set<string>();
  return scored
    .filter((t) => (seen.has(t.tag.name) ? false : (seen.add(t.tag.name), true)))
    .map((t, i) => ({ ...t, tag: { ...t.tag, rank: i + 1 } }));
}

// The chips, the invite, the event page and the poster all show the same list: only tags that set the pair apart.
export const LIKED_FOR_SHOWN = 5;

// What the venue is liked for: its own ranked tags that say something about taste, the rare ones on the street first.
// Menu items, service words and tags most of the street carries never make the list.
export function likedFor(venueTags: StreetTag[], nearby: Pick<LovedPlace, "tags">[]): StreetTag[] {
  const pool = nearby.length;
  return venueTags
    .filter((t) => telling(t.id, t.name))
    .map((t) => ({ ...t, carriers: nearby.filter((p) => p.tags.includes(t.id)).length, pool }))
    .filter((t) => !GENERIC.has(words(t.name)) && !(pool && (t.carriers ?? 0) * 2 > pool))
    .sort((a, b) => (a.carriers ?? 0) - (b.carriers ?? 0) || a.rank - b.rank)
    .slice(0, LIKED_FOR_SHOWN);
}

export function shownTags(taste: TasteTag[]): StreetTag[] {
  return taste.filter((t) => !t.generic).slice(0, SHOWN_TAGS).map((t) => t.tag);
}
