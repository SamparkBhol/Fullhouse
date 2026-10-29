import type { Rising } from "../../shared/contract.ts";
import { CITIES } from "../../shared/cities.ts";
import { listWords } from "../../shared/words.ts";
import { bookRank } from "./books.ts";
import { fallbackNote, ranked, type Chosen, type Place, type PickSet } from "./picks.ts";

const LINK_NS = /^urn:tag:(genre|subgenre|keyword):(media|qloo):/;

// Formats, ages and the commonest genres come back on almost every title, so two titles sharing them share nothing.
const NOISE = new Set([
  "audiobook", "adult", "adult_fiction", "fiction", "nonfiction", "non_fiction", "contemporary", "drama", "comedy", "ebook",
  "hardcover", "paperback", "young_adult", "kids", "children", "teen", "literary", "literary_fiction", "novel", "novels",
  "classic", "classics", "bestseller", "book_club", "independent_film", "boy", "girl", "man", "woman", "fear", "rain", "lie",
  "love", "family", "friendship", "life", "death", "hope", "loss", "relationship", "relationships", "food", "money", "sex",
]);
const NOISE_PART = /(^|_)(title|titles|credits?|reference|narrat\w*|flashback|timeline|scene|shot|cameo|sequel|remake|ending|protagonist|written|directed|cast|actor|actress|character|opening)(_|$)/;
const FORM = /^(memoirs?|autobiography|biography|biography_memoir|based_on_real_person|based_on_true_story|true_story)$/;
const ADAPTED = /^based_on_/;

const CITY_KEYS = CITIES.map((c) => ({ key: c.name.toLowerCase().replace(/ /g, "_"), name: c.name }));

interface Labels {
  // How the label reads, keyed by its singular form, which is what two titles are matched on.
  shown: Map<string, string>;
  themes: Set<string>;
  genres: Set<string>;
  settings: Set<string>;
  form: boolean;
}

const GENRE_NS = /^urn:tag:(genre|subgenre):/;
// "Historical fiction" reads as "historical" in "both are historical stories".
const GENRE_WORD: Record<string, string> = { historical_fiction: "historical" };

function single(label: string): string {
  return label.length > 4 ? label.replace(/ies$/, "y").replace(/(?<!s)s$/, "") : label;
}

function labelsOf(r: Pick<Rising, "tags">): Labels {
  const out: Labels = { shown: new Map(), themes: new Set(), genres: new Set(), settings: new Set(), form: false };
  for (const t of r.tags ?? []) {
    if (!LINK_NS.test(t)) continue;
    const label = t.split(":").pop() ?? "";
    if (FORM.test(label)) out.form = true;
    const city = CITY_KEYS.find((c) => `_${label}_`.includes(`_${c.key}_`));
    if (city) out.settings.add(city.name);
    else if (!ADAPTED.test(label) && !NOISE.has(label) && !NOISE_PART.test(label) && !FORM.test(label)) {
      const plain = GENRE_WORD[label] ?? label;
      const word = single(plain);
      if (!out.shown.has(word)) out.shown.set(word, plain);
      (GENRE_NS.test(t) ? out.genres : out.themes).add(word);
    }
  }
  return out;
}

export interface Connection {
  score: number;
  themes: string[];
  genre: string | null;
  setting: string | null;
  form: boolean;
}

// A tag every title in the joint read carries ties nothing together, so each shared tag counts for how rare it is there.
function all(l: Labels): Set<string> {
  return new Set([...l.themes, ...l.genres]);
}

function rarity(pool: Labels[]): (label: string) => number {
  const sets = pool.map(all);
  return (label) => Math.log((pool.length + 1) / (sets.filter((l) => l.has(label)).length + 1));
}

// A label one side files as a genre is a genre for both, so "coming of age" on a book and a film reads as a kind of story.
export function connection(book: Rising, film: Rising, pool: Rising[]): Connection {
  const weight = rarity(pool.map(labelsOf));
  const a = labelsOf(book);
  const b = labelsOf(film);
  const bAll = all(b);
  const shared = [...all(a)].filter((t) => bAll.has(t)).sort((x, y) => weight(y) - weight(x) || x.localeCompare(y));
  const isGenre = (t: string) => a.genres.has(t) || b.genres.has(t);
  const genre = shared.find(isGenre) ?? null;
  const themes = shared.filter((t) => !isGenre(t) && !(genre && (genre.includes(t) || t.includes(genre))));
  const setting = [...a.settings].find((s) => b.settings.has(s)) ?? null;
  const form = a.form && b.form;
  const score = shared.reduce((s, t) => s + weight(t), 0) + (setting ? 1 : 0) + (form ? 1 : 0);
  const shown = (t: string) => [a.shown.get(t), b.shown.get(t), t].filter((x): x is string => Boolean(x)).sort((x, y) => y.length - x.length)[0]!;
  return { score, themes: themes.slice(0, 2).map(shown), genre: genre ? shown(genre) : null, setting, form };
}

function words(label: string): string {
  return label.replace(/_/g, " ");
}

// "Both are true stories about addiction and family, set in New York."
export function linkLine(c: Connection): string | null {
  const about = c.themes.length ? ` about ${listWords(c.themes.map(words))}` : "";
  const set = c.setting ? `, set in ${c.setting}` : "";
  if (c.form) return `Both are true stories${about}${set}.`;
  if (c.genre) return `Both are ${words(c.genre)} stories${about}${set}.`;
  if (about) return `The book and the film are both${about}${c.setting ? `, and both are set in ${c.setting}` : ""}.`;
  return c.setting ? `The book and the film are both set in ${c.setting}.` : null;
}

export const ADAPTED_LINK = "The film is made from the book, so the room comes to the screening having read it.";

const POOL_TOP = 6;

interface Pair {
  book: Chosen;
  film: Chosen;
  score: number;
  link: string | null;
}

function toSet(p: Pair, venueName: string, partnerName: string): PickSet {
  const notes = [p.book, p.film].filter((c) => !c.joint).map((c) => fallbackNote(c, venueName, partnerName));
  return { chosen: [p.book, p.film], notes, link: p.link };
}

// The book and the film are chosen together: the book the film is made from first, then the pairs whose tags
// overlap most, then, when nothing ties any two together, the best known book and film as one evening with no link claimed.
export function bookFilmSets(joint: Rising[], own: Rising[], venue: Place, partner: Place, max: number): PickSet[] {
  const all = ranked("book", joint, own, venue, partner);
  // A story, a life or essays when there is one; a textbook only when there is nothing else.
  const best = Math.min(...all.map((c) => bookRank(c.pick)));
  const books = all.filter((c) => bookRank(c.pick) === best);
  const films = ranked("movie", joint, own, venue, partner);
  const pool = joint.filter((r) => (r.type === "book" || r.type === "movie") && !r.filmOf);
  const adapted: Pair[] = films.flatMap((film) => {
    const book = joint.find((b) => b.type === "book" && b.filmOf === film.pick.id);
    return book ? [{ book: { pick: book, split: film.split, joint: film.joint, side: film.side }, film, score: Infinity, link: ADAPTED_LINK }] : [];
  });
  const linked: Pair[] = books.slice(0, POOL_TOP).flatMap((book, i) =>
    films.slice(0, POOL_TOP).flatMap((film, j) => {
      const c = connection(book.pick, film.pick, pool);
      const link = c.score > 0 ? linkLine(c) : null;
      return link ? [{ book, film, score: c.score - (i + j) / 100, link }] : [];
    }),
  );
  const loose: Pair[] = books.flatMap((book, i) => (films[i] ? [{ book, film: films[i]!, score: -1 - i, link: null }] : []));
  const used = new Set<string>();
  const out: PickSet[] = [];
  for (const p of [...adapted, ...linked.sort((x, y) => y.score - x.score), ...loose]) {
    if (out.length >= max) break;
    if (used.has(p.book.pick.id) || used.has(p.film.pick.id)) continue;
    used.add(p.book.pick.id);
    used.add(p.film.pick.id);
    out.push(toSet(p, venue.name, partner.name));
  }
  return out;
}
