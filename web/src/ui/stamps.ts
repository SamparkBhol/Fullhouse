import type { Baseline, BaselineName } from "../../../src/shared/contract.ts";
import { listWords, plainName, plural, possessive, shortName } from "../../../src/shared/words.ts";
import { h } from "../dom.ts";

type Stamp = "self" | "near" | "far" | "catalog" | "none" | "closed";

// The chatbot often names the venue itself. Qloo finds it, but it cannot be a partner, so it is stamped apart and left out of every count.
function isSelf(n: BaselineName, venueName: string): boolean {
  return n.kind === "place" && n.note?.startsWith(`This is ${venueName} itself`) === true;
}

function others(names: BaselineName[], venueName: string): BaselineName[] {
  return names.filter((n) => !isSelf(n, venueName));
}

// Distance only means something for places; a found artist, book or film is simply in Qloo's catalog.
function stampOf(n: BaselineName, venueName: string): Stamp {
  if (isSelf(n, venueName)) return "self";
  if (n.closed) return "closed";
  if (n.status === "not_found") return "none";
  if (n.status === "found_far") return "far";
  return n.kind === "place" ? "near" : "catalog";
}

const STAMP_WORDS: Record<Stamp, string> = {
  self: "Your venue",
  near: "Found near you",
  far: "Found far away",
  catalog: "Found",
  none: "Not found",
  closed: "Closed",
};

// The chips differ by mark as well as by word: filled for found near you, outlined for found, dashed for missing.
const STAMP_CHIP: Record<Stamp, string> = { self: "chip chip-line", near: "chip chip-yes", far: "chip chip-line", catalog: "chip chip-line", none: "chip chip-dash", closed: "chip chip-ink" };

export function stampList(names: BaselineName[], venueName: string, said?: string): HTMLElement {
  return h(
    "ul",
    { class: "checked" },
    names.map((n) => {
      const kind = stampOf(n, venueName);
      const quote = said ? quoteFor(said, n.name) : null;
      return h(
        "li",
        null,
        h("span", { class: "checked-name" }, n.name),
        h("span", { class: STAMP_CHIP[kind] }, STAMP_WORDS[kind]),
        quote ? h("span", { class: "checked-note checked-quote" }, `It said: ${quote}`) : null,
        n.note ? h("span", { class: "checked-note" }, n.note) : null,
        n.tieNote ? h("span", { class: n.tied ? "checked-note checked-tied" : "checked-note" }, n.tieNote) : null,
      );
    }),
  );
}

function nearCount(names: BaselineName[]): number {
  return names.filter((n) => n.status === "found_nearby" && !n.closed).length;
}

function foundCount(names: BaselineName[]): number {
  return names.filter((n) => n.status !== "not_found").length;
}

// The one line the page is for, worded as what was measured: places named, within walking distance, and among the
// 50 places Qloo ties to this crowd. Full House's own picks come from those answers, so they are never scored here.
export function heroLine(b: Baseline, venueName: string): string {
  const shown = plainName(venueName);
  const plain = others(b.plainNames, venueName);
  if (!plain.length) return `The plain chatbot named nothing Full House could look up for ${shown}.`;
  const places = plain.filter((n) => n.kind === "place");
  const works = plain.filter((n) => n.kind !== "place");
  const parts: string[] = [];
  if (places.length) {
    const tied = places.filter((n) => n.tied).length;
    const crowd = places.some((n) => n.tied !== undefined) ? `, ${tied} among the places Qloo ties to ${possessive(shortName(shown))} crowd` : "";
    parts.push(`${plural(places.length, "place", "places")} named, ${nearCount(places)} within walking distance${crowd}`);
  }
  if (works.length) {
    const found = foundCount(works);
    const tied = works.filter((n) => n.tied).length;
    parts.push(`${plural(works.length, "act or title", "acts and titles")} named, ${found} in the catalog${works.some((n) => n.tied !== undefined) ? `, ${tied} among what this crowd loves` : ""}`);
  }
  return `A plain chatbot, asked the same question with no taste data: ${parts.join(". ")}.`;
}

// One sentence from the chatbot's answer for each name, so the page quotes the claim instead of printing the essay.
export function quoteFor(text: string, name: string): string | null {
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  const hit = sentences.find((s) => s.toLowerCase().includes(name.toLowerCase()));
  if (!hit) return null;
  const clean = hit.replace(/\*\*/g, "").replace(/^[#\-*\s]+/, "").trim();
  return clean.length > 220 ? `${clean.slice(0, 200).trim()}...` : clean;
}

// The hard failures first: closed for good, not on Qloo at all, and real but not among what this crowd loves.
export function failLine(b: Baseline, venueName: string): string | null {
  const plain = others(b.plainNames, venueName);
  const closed = plain.filter((n) => n.closed).length;
  const missing = plain.filter((n) => !n.closed && n.status === "not_found").length;
  const untied = plain.filter((n) => !n.closed && n.status !== "not_found" && n.tied === false).length;
  const parts: string[] = [];
  if (closed) parts.push(`${closed} ${closed === 1 ? "is" : "are"} closed for good`);
  if (missing) parts.push(`${missing} ${missing === 1 ? "is" : "are"} not found at all`);
  if (untied) parts.push(`${untied} ${untied === 1 ? "is" : "are"} real but not among what people who like ${plainName(venueName)} love`);
  return parts.length ? `Of those, ${listWords(parts)}.` : null;
}

export const OWN_PICKS_NOTE = "These came from the same answers they are checked against, so they are listed for reference, not as a score.";

export function countLine(names: BaselineName[], venueName: string): string {
  if (!names.length) return "No names to check.";
  const counted = others(names, venueName);
  const places = counted.filter((n) => n.kind === "place");
  const rest = counted.filter((n) => n.kind !== "place");
  const parts: string[] = [];
  if (places.length) parts.push(`${nearCount(places)} of ${plural(places.length, "place", "places")} found near you`);
  if (rest.length) parts.push(`${foundCount(rest)} of ${plural(rest.length, "other name", "other names")} found`);
  if (counted.length < names.length) parts.push(`${plainName(venueName)} itself is not counted`);
  return `${parts.join(". ")}.`;
}
