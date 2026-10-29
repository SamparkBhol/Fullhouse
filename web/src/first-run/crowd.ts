import type { LovedPlace, QlooType, Rising, StreetRead } from "../../../src/shared/contract.ts";
import { TYPE_SINGULAR, capFirst, listWords, ordinal, shortName } from "../../../src/shared/words.ts";
import { h, uid } from "../dom.ts";
import { PLACES_ON_MAP, displayTitle, walk } from "../format.ts";
import { byLine } from "../joint.ts";
import { describingTags, tagWord } from "../tags.ts";
import { cover } from "../ui/cover.ts";
import type { ServerStep } from "../ui/progress.ts";

const ORDER: QlooType[] = ["book", "movie", "tv_show", "artist", "podcast"];
const PER_KIND = 3;

export const READ_STEPS: ServerStep[] = [
  { label: "Finding the places near you that your crowd also loves", call: /^loved_places$/ },
  { label: "Seeing where on the street your crowd gathers", call: /^heat_venue$/ },
  { label: "Reading the books, shows, artists, podcasts and films they love", call: /^insights_/ },
  { label: "Asking the best of those places whether their crowd loves you back", call: /^(compare|loves_back)$/ },
];

// Some genre tags name the format, not the taste ("Audiobook", "Podcasts"), which says nothing here.
const FORMAT_WORDS = /^(audiobooks?|e ?books?|podcasts?|books?|films?|movies?|tv|television|music|series)$/i;

function genres(r: Rising): string[] {
  const words = (r.tags ?? []).filter((t) => t.startsWith("urn:tag:genre:")).map(tagWord).filter((w) => w && !FORMAT_WORDS.test(w));
  return [...new Set(words)].slice(0, 2);
}

// The same word the partner screen uses for a place's kind; a raw catalogue label only when the engine filed it under none.
export function kindWord(p: Pick<LovedPlace, "kind" | "tags">): string | undefined {
  return p.kind ? capFirst(p.kind) : describingTags(p.tags, 1)[0];
}

export function placeItem(p: LovedPlace, opts: { rank?: boolean; eager?: boolean } = {}): HTMLElement {
  return h(
    "li",
    { class: "item" },
    cover(p, { shape: "square", ...(opts.eager ? { eager: true } : {}) }),
    h("div", null, h("span", { class: "item-name" }, shortName(p.name)), h("span", { class: "item-sub" }, [kindWord(p), walk(p.distanceM)].filter(Boolean).join(", "))),
    opts.rank === false ? h("span") : h("span", { class: "item-end" }, h("span", { class: "rank" }, ordinal(p.rank))),
  );
}

// A place that can host a night comes first, with its rank on the crowd's list kept, so a jump from 1st to 11th is
// explained by the shops, libraries and gardens folded under it.
function split(places: LovedPlace[]): { hosts: LovedPlace[]; others: LovedPlace[] } {
  const known = places.some((p) => p.hosts !== undefined);
  if (!known) return { hosts: places, others: [] };
  return { hosts: places.filter((p) => p.hosts), others: places.filter((p) => !p.hosts) };
}

export function placesPanel(read: StreetRead, name: string): HTMLElement {
  const id = uid("places");
  const places = [...read.lovedPlaces].sort((a, b) => a.rank - b.rank);
  const { hosts, others } = split(places);
  const top = hosts.slice(0, PLACES_ON_MAP);
  const rest = hosts.slice(PLACES_ON_MAP);
  return h(
    "section",
    { class: "panel", "aria-labelledby": id },
    h("div", { class: "panel-head" }, h("h2", { id }, "Places your crowd loves nearby"), places.length ? h("span", { class: "small" }, `${places.length} in all`) : null),
    h("p", null, `Ranked by how strongly people who like ${name} also love them. The number is each place's rank on the whole list.`),
    top.length
      ? h("ol", { class: "items" }, top.map((p, i) => placeItem(p, { eager: i < 4 })))
      : h("p", { class: "empty" }, `No places nearby that could host a night came back for people who like ${name}.`),
    rest.length ? h("details", { class: "more disclose" }, h("summary", null, `${rest.length} more places that could host`), h("ol", { class: "items" }, rest.map((p) => placeItem(p)))) : null,
    others.length
      ? h("details", { class: "more disclose items-fold" }, h("summary", null, `Also on the list, not places for a night: ${others.length}`), h("ol", { class: "items" }, others.map((p) => placeItem(p))))
      : null,
  );
}

function pickItem(r: Rising, eager: boolean): HTMLElement {
  const by = byLine(r);
  const g = genres(r);
  return h(
    "li",
    { class: "item item-cover" },
    cover(r, eager ? { eager: true } : {}),
    h(
      "div",
      null,
      h("span", { class: "item-name" }, displayTitle(r.name), by ? h("span", { class: "item-by" }, ` by ${by}`) : null),
      r.venueSignal === false ? h("span", { class: "item-sub" }, "Liked around you, with no rank for your crowd") : g.length ? h("span", { class: "item-sub" }, listWords(g)) : null,
    ),
    r.venueSignal === false ? h("span") : h("span", { class: "item-end" }, h("span", { class: "rank" }, ordinal(r.rank))),
  );
}

const KIND_HEAD: Record<string, string> = { book: "Books", movie: "Films", tv_show: "TV shows", artist: "Artists", podcast: "Podcasts" };

// What the crowd loves beyond the street, the top few of each kind with their covers.
export function shelvesPanel(read: StreetRead, name: string, perKind = PER_KIND): HTMLElement {
  const id = uid("shelves");
  const kinds = ORDER.map((type) => [type, read.rising.filter((r) => r.type === type).sort((a, b) => a.rank - b.rank).slice(0, perKind)] as const).filter(([, list]) => list.length);
  return h(
    "section",
    { class: "panel", "aria-labelledby": id },
    h("h2", { id }, "What they love beyond the street"),
    h("p", null, `The books, films, shows, artists and podcasts people who like ${name} rank highest.`),
    kinds.length
      ? h("ul", { class: "kinds" }, kinds.map(([type, list], k) => h("li", null, h("h3", null, KIND_HEAD[type] ?? capFirst(TYPE_SINGULAR[type])), h("ol", { class: "items" }, list.map((r) => pickItem(r, k < 2))))))
      : h("p", { class: "empty" }, `No books, shows, artists, podcasts or films came back for people who like ${name}.`),
  );
}
