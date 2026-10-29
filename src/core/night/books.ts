import type { Rising } from "../../shared/contract.ts";

// "Circe / The Song of Achilles" is two books, and a book club reads one.
const BUNDLE = /\/|\b(box(ed)?\s*set|omnibus|collection set|books?\s+\d+\s*(to|and|&|-)\s*\d+|\d+\s+books?\s+in\s+\d+|trilogy\s+set)\b/i;

export function bundle(name: string): boolean {
  return BUNDLE.test(name);
}

function label(tag: string): string {
  return tag.split(":").pop() ?? "";
}

const GENRE = /^urn:tag:(genre|subgenre):(media|qloo):/;

// A story, a life or an essay gives a room something to argue about for an hour.
const STORY = /(^|_)(fiction|novels?|memoirs?|autobiography|essays?|short_stor(y|ies)|short_fiction|romance|thriller|mystery|fantasy|horror|magical_realism)$/;
const NOT_STORY = /^non_?fiction$/;

// A textbook, a reference work or a policy study reads like homework at a book club.
const HOMEWORK = /(^|_)(textbooks?|reference|academic|education(al)?|teaching|sociology|sociopolitical|study_aids?|test_prep|dictionar(y|ies)|encyclopedias?|cultural_studies|political_science|politics|economics|law|research|criticism|theory)$/;

export type BookKind = "story" | "other" | "homework";

export function bookKind(r: Pick<Rising, "tags">): BookKind {
  const genres = (r.tags ?? []).filter((t) => GENRE.test(t)).map(label);
  if (genres.some((g) => STORY.test(g) && !NOT_STORY.test(g))) return "story";
  if (genres.some((g) => HOMEWORK.test(g))) return "homework";
  return "other";
}

const KIND_ORDER: Record<BookKind, number> = { story: 0, other: 1, homework: 2 };

export function bookRank(r: Pick<Rising, "type" | "tags">): number {
  return r.type === "book" ? KIND_ORDER[bookKind(r)] : 0;
}
