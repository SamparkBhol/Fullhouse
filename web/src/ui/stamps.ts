import type { Baseline, BaselineName } from "../../../src/shared/contract.ts";
import { listWords, plainName, plural } from "../../../src/shared/words.ts";
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
  catalog: "In Qloo's catalog",
  none: "Not found",
  closed: "Closed",
};

// Each name with Qloo's stamp beside it. The stamps differ by mark as well as by word: filled, outlined, dashed.
export function stampList(names: BaselineName[], venueName: string): HTMLElement {
  return h(
    "ul",
    { class: "stamped" },
    names.map((n) => {
      const kind = stampOf(n, venueName);
      return h(
        "li",
        { class: `stamped-row stamp-row-${kind}` },
        h("span", { class: "stamped-name" }, n.name),
        h("span", { class: `stamp stamp-${kind}` }, STAMP_WORDS[kind]),
        n.note ? h("span", { class: "stamped-note" }, n.note) : null,
        n.tieNote ? h("span", { class: n.tied ? "stamped-note stamped-tied" : "stamped-note" }, n.tieNote) : null,
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

// The one line the page is for: how much of what a plain chatbot said holds up for this venue's crowd on Qloo.
// Full House's own picks come from the same Qloo answers they would be checked against, so they are never scored here.
export function heroLine(b: Baseline, venueName: string): string {
  const shown = plainName(venueName);
  const plain = others(b.plainNames, venueName);
  if (!plain.length) return `The plain chatbot named nothing Qloo could look up for ${shown}.`;
  const what = plural(plain.length, "name", "names");
  if (plain.every((n) => n.tied === undefined)) {
    const places = plain.filter((n) => n.kind === "place");
    return `A plain chatbot gave ${what} for ${shown}. Qloo found ${nearCount(places)} of its ${plural(places.length, "place", "places")} near the venue.`;
  }
  const tied = plain.filter((n) => n.tied).length;
  return `A plain chatbot gave ${what} for ${shown}. Qloo ties ${tied ? tied : "none"} of them to its crowd.`;
}

// The hard failures first: closed for good, not on Qloo at all, and real but not among what this crowd loves.
export function failLine(b: Baseline, venueName: string): string | null {
  const plain = others(b.plainNames, venueName);
  const closed = plain.filter((n) => n.closed).length;
  const missing = plain.filter((n) => !n.closed && n.status === "not_found").length;
  const untied = plain.filter((n) => !n.closed && n.status !== "not_found" && n.tied === false).length;
  const parts: string[] = [];
  if (closed) parts.push(`${closed} ${closed === 1 ? "is" : "are"} closed for good`);
  if (missing) parts.push(`${missing} ${missing === 1 ? "is" : "are"} not on Qloo at all`);
  if (untied) parts.push(`${untied} ${untied === 1 ? "is" : "are"} real but not among what people who like ${plainName(venueName)} love`);
  return parts.length ? `Of those, ${listWords(parts)}.` : null;
}

export const OWN_PICKS_NOTE = "These came from the same Qloo answers they are checked against, so they are listed for reference, not as a score.";

export function countLine(names: BaselineName[], venueName: string): string {
  if (!names.length) return "No names to check.";
  const counted = others(names, venueName);
  const places = counted.filter((n) => n.kind === "place");
  const rest = counted.filter((n) => n.kind !== "place");
  const parts: string[] = [];
  if (places.length) parts.push(`${nearCount(places)} of ${plural(places.length, "place", "places")} found near you`);
  if (rest.length) parts.push(`${foundCount(rest)} of ${plural(rest.length, "other name", "other names")} found on Qloo`);
  if (counted.length < names.length) parts.push(`${plainName(venueName)} itself is not counted`);
  return `${parts.join(". ")}.`;
}
