import type { QlooType, Rising, StreetRead, Venue } from "../../../src/shared/contract.ts";
import { TYPE_SINGULAR, listWords } from "../../../src/shared/words.ts";
import { h, prefersReducedMotion } from "../dom.ts";
import { byLine } from "../joint.ts";
import { tagWord } from "../tags.ts";
import { cover } from "../ui/cover.ts";
import { displayTitle } from "../ui/flyer.ts";
import { PLACES_ON_MAP } from "../ui/loved.ts";
import { shortName } from "../ui/split-bar.ts";

const ORDER: QlooType[] = ["book", "tv_show", "artist", "podcast", "movie"];
const OWN_WORD: Partial<Record<QlooType, string>> = { tv_show: "show" };
const STEP_MS = 420;

export const READ_STEPS = [
  "Finding the places near you that your crowd also loves",
  "Reading the books, shows, artists, podcasts and films they love",
  "Seeing where on the street your crowd gathers",
];

// The top pick of each kind, read with the venue as the signal when Qloo used it.
export function topPicks(read: StreetRead): Rising[] {
  return ORDER.map((type) => {
    const of = read.rising.filter((r) => r.type === type).sort((a, b) => a.rank - b.rank);
    return of.find((r) => r.venueSignal !== false) ?? of[0];
  }).filter((r): r is Rising => Boolean(r));
}

// Some genre tags name the format, not the taste ("Audiobook", "Podcasts"), which says nothing on this screen.
const FORMAT_WORDS = /^(audiobooks?|e ?books?|podcasts?|books?|films?|movies?|tv|television|music|series)$/i;

function genres(r: Rising): string[] {
  const words = (r.tags ?? []).filter((t) => t.startsWith("urn:tag:genre:")).map(tagWord).filter((w) => w && !FORMAT_WORDS.test(w));
  return [...new Set(words)].slice(0, 2);
}

function coverItem(r: Rising, i: number, venueName: string): HTMLElement {
  const kind = OWN_WORD[r.type] ?? TYPE_SINGULAR[r.type];
  const by = byLine(r);
  const g = genres(r);
  const line = r.venueSignal === false ? `Liked around ${shortName(venueName)}, not tied to your crowd` : g.length ? listWords(g) : null;
  const item = h(
    "li",
    { class: "crowd-pick" },
    cover(r, { className: "crowd-cover", eager: true }),
    h(
      "div",
      { class: "crowd-words" },
      h("p", { class: "crowd-kind" }, i === 0 ? `Your crowd's ${kind}` : `Their ${kind}`),
      h("p", { class: "crowd-name" }, displayTitle(r.name), by ? h("span", { class: "crowd-by" }, ` by ${by}`) : null),
      line ? h("p", { class: "crowd-line" }, line) : null,
    ),
  );
  item.style.setProperty("--i", String(i));
  return item;
}

// The read lands all at once; the covers are then set out one at a time, which is the moment of this screen.
export function crowdCovers(read: StreetRead, venueName: string): HTMLElement {
  const picks = topPicks(read);
  if (!picks.length) return h("p", { class: "first-empty" }, `Qloo returned no books, shows, artists, podcasts or films for people who like ${venueName}.`);
  const list = h("ol", { class: "crowd-picks" }, picks.map((r, i) => coverItem(r, i, venueName)));
  if (!prefersReducedMotion()) {
    list.classList.add("crowd-reveal");
    window.setTimeout(() => list.classList.add("crowd-shown"), 30);
  }
  list.style.setProperty("--step", `${STEP_MS}ms`);
  return list;
}

export function crowdMap(read: StreetRead, venue: Venue): HTMLElement {
  const box = h("div", { class: "map first-map", role: "img", "aria-label": `Map of the streets around ${venue.entity.name}. Lit windows are where its crowd gathers.` });
  const places = read.lovedPlaces.slice(0, PLACES_ON_MAP);
  const key = h(
    "p",
    { class: "first-key" },
    `Lit windows are where people who like ${shortName(venue.entity.name)} gather. Round photos are the places nearby they also love.`,
  );
  void import("../ui/map.ts").then(({ drawStreetMap }) => {
    if (!box.isConnected) return;
    drawStreetMap(box, { venue, center: read.center, radiusM: read.radiusM, heat: read.heat.slice(0, 1), loved: places });
  });
  return h("figure", { class: "first-figure" }, box, h("figcaption", null, key));
}
