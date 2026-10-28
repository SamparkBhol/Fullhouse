import type { NightPlan, QlooType, StreetTag } from "../../shared/contract.ts";
import { FORMATS, menuItem } from "../planner/formats.ts";
import { cleanTagName } from "../qloo/tags.ts";
import { listWords } from "../../shared/words.ts";
import { normalizeName } from "./claims.ts";

// A Qloo tag is a label, not a phrase: "Female protagonist" or "Audiobook" cannot follow "If you like".
// Each tag is turned into words a person would say, or left out when no plain wording fits.

export interface ThemePhrase {
  text: string;
  kind: "genre" | "subject";
  // "stories" and "about friendship", kept apart so two subjects can share one noun.
  noun?: string;
  clause?: string;
}

function subject(noun: string, clause: string): ThemePhrase {
  return { text: `${noun} ${clause}`, kind: "subject", noun, clause };
}

const NOUN: Partial<Record<QlooType, string>> = { movie: "stories", tv_show: "stories", book: "books", podcast: "shows", videogame: "games", artist: "music" };

const GENRE_NS = new Set(["urn:tag:genre:media", "urn:tag:genre:music", "urn:tag:genre:qloo", "urn:tag:subgenre:qloo"]);
const KEYWORD_NS = new Set(["urn:tag:keyword:media", "urn:tag:keyword:qloo", "urn:tag:theme:qloo"]);
const AUDIENCE_NS = "urn:tag:audience:qloo";

// Formats, ages, places and moods that Qloo files as genres but nobody would call a taste.
const NOT_A_TASTE = new Set(
  [
    "adult", "adults", "adult fiction", "young adult", "new adult", "kids", "children", "juvenile", "teen", "teens", "picture books",
    "audiobook", "audiobooks", "ebook", "paperback", "hardcover", "novels", "short", "shorts", "contemporary", "general", "other",
    "podcasts", "news", "society and culture", "education", "arts", "music", "fiction", "nonfiction", "non fiction",
    "usa", "us", "uk", "united states", "united kingdom", "america", "american", "british", "english", "french", "german", "deutsch",
    "italian", "spanish", "european", "international", "global", "world", "germany", "france", "south africa", "belarusian",
    "new york", "seattle", "chicago", "london", "los angeles", "paris", "berlin", "funny", "smart", "womens", "women", "mens",
    "spoken words", "drag queen", "african american",
  ].map(normalizeName),
);

// Genres that are really subjects read as "books about cooking" or "stories about politics".
const SUBJECT_GENRES: Record<string, string> = {
  food: "food", "food and drink": "food", cooking: "cooking", cookbooks: "cooking", culinary: "cooking", cuisine: "food",
  travel: "travel", design: "design", art: "art", fashion: "fashion", race: "race", feminism: "feminism",
  "social justice": "social justice", activism: "activism", politics: "politics", "political science": "politics",
  government: "politics", history: "history", "mental health": "mental health", relationships: "relationships",
  sports: "sport", science: "science", technology: "technology", business: "business", religion: "faith", nature: "nature",
};

const IDENTITY_GENRES: Record<string, string> = { lgbt: "LGBT", lgbtq: "LGBTQ", queer: "queer", gay: "gay", lesbian: "lesbian" };

const PLURAL_GENRES: Record<string, string> = {
  thriller: "thrillers", documentary: "documentaries", musical: "musicals", mystery: "mysteries", western: "westerns",
  biography: "biographies", memoir: "memoirs", "romantic comedy": "romantic comedies", "period drama": "period dramas",
  "family drama": "family dramas", "biographical drama": "biographical dramas", "romantic drama": "romantic dramas",
  "period piece": "period pieces", "character study": "character studies", "literary adaptation": "literary adaptations",
  autobiography: "autobiographies", "biography memoir": "biography and memoir", "reality tv": "reality TV",
  "stand up comedy": "stand up comedy",
};

const ADJECTIVE_GENRES = new Set([
  "historical", "political", "psychological", "satirical", "literary", "experimental", "electronic", "acoustic", "instrumental",
  "classical", "alternative", "romantic", "dramatic", "comedic", "ambient", "crime",
]);

const PROPER_WORDS: Record<string, string> = Object.fromEntries(
  ["Broadway", "Bollywood", "Motown", "Christmas", "Latin", "Korean", "Japanese", "British", "English", "Irish", "Scottish", "French", "German", "Italian", "Spanish", "Brazilian", "African", "American", "Nordic"].map((w) => [w.toLowerCase(), w]),
);

const SUBJECT_KEYWORDS = new Set([
  "friendship", "love", "grief", "family", "identity", "ambition", "memory", "loss", "home", "immigration", "adolescence",
  "growing up", "race", "class", "gender", "politics", "art", "food", "fashion", "community", "war", "dating", "marriage",
  "sisters", "brothers", "motherhood", "fatherhood", "parenthood", "faith", "revenge", "survival", "heartbreak", "sexuality",
  "feminism", "activism", "cooking", "dance", "dancing", "singing", "sport", "sports", "fame", "addiction", "mental health",
  "ageing", "aging", "childhood", "youth", "high school", "college", "career", "divorce", "coming out", "poetry", "money",
]);

const KIN: Record<string, string> = {
  mother: "mothers", father: "fathers", brother: "brothers", sister: "sisters", son: "sons", daughter: "daughters",
  grandmother: "grandmothers", grandfather: "grandfathers", husband: "husbands", wife: "wives",
};

const GENRE_MODIFIERS: Record<string, string> = {
  dark: "dark", black: "black", romantic: "romantic", period: "period", family: "family", teen: "teen", political: "political",
  korean: "Korean", british: "British", "feel good": "feel good", slapstick: "slapstick", crime: "crime", legal: "legal",
  medical: "medical", satire: "satirical", workplace: "workplace", musical: "musical",
};

const LEAD = /^(female|male|teenage|young|older|queer|gay|lesbian)\s+(protagonist|lead|hero|heroine)$/;
const KIN_PAIR = /^(\w+)\s+(\w+)\s+relationships?$/;
const DECADE = /^(1[89]|20)\d0s$/;
const GENRE_KEYWORD = /^(.+?)\s+(comedy|drama|romance|thriller|horror)$/;

function lowerWord(word: string): string {
  return word
    .split("-")
    .map((part) => (/^[\p{Lu}\d&+]{2,}$/u.test(part) ? part : (PROPER_WORDS[part.toLowerCase()] ?? part.toLowerCase())))
    .join("-");
}

function spoken(name: string): string {
  return cleanTagName(name).replace(/\s&\s/g, " and ").split(" ").map(lowerWord).join(" ");
}

function looksLikeWords(text: string): boolean {
  return /^[\p{L}&' -]+$/u.test(text) && text.split(" ").length <= 3;
}

function genrePhrase(name: string, noun: string): ThemePhrase | null {
  const key = normalizeName(name);
  const topic = SUBJECT_GENRES[key];
  if (topic) return subject(noun, `about ${topic}`);
  const identity = IDENTITY_GENRES[key];
  if (identity) return noun === "music" ? null : { text: `${identity} ${noun}`, kind: "subject" };
  if (NOT_A_TASTE.has(key) || NOT_A_TASTE.has(key.replace(/ music$/, "")) || !key) return null;
  const words = spoken(name);
  if (!looksLikeWords(words)) return null;
  const plural = PLURAL_GENRES[key];
  if (plural) return { text: plural, kind: "genre" };
  if (ADJECTIVE_GENRES.has(key)) return { text: `${words} ${noun}`, kind: "genre" };
  if (noun === "games" && !/games?$/.test(key)) return { text: `${words} games`, kind: "genre" };
  return { text: words, kind: "genre" };
}

function keywordPhrase(name: string, noun: string, city: string): ThemePhrase | null {
  const key = normalizeName(name);
  const about = (what: string): ThemePhrase => subject(noun, `about ${what}`);
  const lead = LEAD.exec(key);
  if (lead) return subject(noun, `with a ${lead[1]} lead`);
  if (key === "family relationships" || key === "family relationship") return about("family");
  const kin = KIN_PAIR.exec(key);
  if (kin) {
    const [a, b] = [KIN[kin[1] ?? ""], KIN[kin[2] ?? ""]];
    if (a && b) return about(a === b ? a : `${a} and ${b}`);
  }
  if (key === "kdrama" || key === "k drama") return { text: "Korean drama", kind: "genre" };
  const genre = GENRE_KEYWORD.exec(key);
  if (genre) {
    const modifier = GENRE_MODIFIERS[genre[1] ?? ""];
    return modifier ? { text: `${modifier} ${genre[2]}`, kind: "genre" } : null;
  }
  if (key === "coming of age") return { text: `coming of age ${noun}`, kind: "subject" };
  if (noun === "music") return null;
  if (DECADE.test(key)) return subject(noun, `set in the ${key}`);
  const home = normalizeName(city);
  if (home && (key === home || key.startsWith(`${home} `))) {
    return subject(noun, `set in ${key.split(" ").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ")}`);
  }
  return SUBJECT_KEYWORDS.has(key) ? about(key) : null;
}

export function themePhrase(tag: Pick<StreetTag, "name" | "namespace">, type: QlooType, city = ""): ThemePhrase | null {
  const noun = NOUN[type] ?? "nights";
  if (GENRE_NS.has(tag.namespace)) return genrePhrase(tag.name, noun);
  if (KEYWORD_NS.has(tag.namespace)) return keywordPhrase(tag.name, noun, city);
  if (tag.namespace === AUDIENCE_NS) {
    const loving = /^(.+?)\s+loving$/.exec(normalizeName(tag.name));
    return loving?.[1] ? genrePhrase(loving[1], noun) : null;
  }
  return null;
}

// "comedy" next to "dark comedy" says the same thing twice, so the longer one stays.
function addPhrase(out: ThemePhrase[], p: ThemePhrase): void {
  const t = p.text.toLowerCase();
  if (out.some((o) => o.text.toLowerCase().includes(t))) return;
  const shorter = out.findIndex((o) => t.includes(o.text.toLowerCase()));
  if (shorter >= 0) out.splice(shorter, 1, p);
  else out.push(p);
}

export const THEME_PHRASES = 2;

export function planTheme(plan: NightPlan, city = ""): ThemePhrase[] {
  if (plan.format === "tasting") return plan.themeTags.slice(0, THEME_PHRASES).map((t) => ({ text: menuItem(t), kind: "subject" }));
  const carried = new Set(plan.feature?.tags ?? []);
  const own = FORMATS[plan.format].themeNamespaces;
  const type = plan.feature?.type ?? FORMATS[plan.format].types[0] ?? "movie";
  const out: ThemePhrase[] = [];
  for (const t of plan.themeTags) {
    if (!carried.has(t.id) && !(plan.format === "listening" && own.includes(t.namespace))) continue;
    const p = themePhrase(t, type, city);
    if (p) addPhrase(out, p);
  }
  return out.slice(0, THEME_PHRASES);
}

const CLAUSE_ORDER = ["set in", "about", "with"];

function joinClauses(clauses: string[]): string {
  return CLAUSE_ORDER.flatMap((prefix) => {
    const objects = clauses.filter((c) => c.startsWith(`${prefix} `)).map((c) => c.slice(prefix.length + 1));
    return objects.length ? [`${prefix} ${listWords(objects)}`] : [];
  }).join(" ");
}

// Two subjects of one kind share the noun: "stories set in New York City with a female lead", not "stories ... and stories ...".
export function themeWords(phrases: ThemePhrase[]): string[] {
  const out: Array<string | { noun: string; clauses: string[] }> = [];
  for (const p of phrases) {
    const shared = p.noun && p.clause ? out.find((o): o is { noun: string; clauses: string[] } => typeof o !== "string" && o.noun === p.noun) : undefined;
    if (shared && p.clause) shared.clauses.push(p.clause);
    else if (p.noun && p.clause) out.push({ noun: p.noun, clauses: [p.clause] });
    else out.push(p.text);
  }
  return out.map((o) => (typeof o === "string" ? o : `${o.noun} ${joinClauses(o.clauses)}`));
}
