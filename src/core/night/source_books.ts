import type { Rising } from "../../shared/contract.ts";
import { normalizeName } from "../copy/claims.ts";
import { parseEntities } from "../qloo/entities.ts";
import { TYPE_URN } from "../qloo/urns.ts";
import type { Runner } from "../street/runner.ts";
import { authorOf } from "../street/steps/cross_domain.ts";
import { evenPicks } from "./picks.ts";

export const SOURCE_BOOKS = 3;

// Qloo tags a film "Based on novel", "Based on book" or "Based on memoir" when it is adapted from one.
const ADAPTED = /^urn:tag:keyword:media:based_on_(novel|book|memoir|short_story|novella)$/;

function title(s: string): string {
  return normalizeName(s.split(/: | \(/)[0] ?? s).replace(/^the /, "");
}

export function adapted(r: Pick<Rising, "tags">): boolean {
  return (r.tags ?? []).some((t) => ADAPTED.test(t));
}

// For the evenly shared films that are adaptations, the book with the film's own title, looked up once each.
// The book club then reads the book the film is made from.
export async function sourceBooks(run: Runner, joint: Rising[], venue: { id: string; name: string }, partner: { id: string; name: string }): Promise<Rising[]> {
  const films = evenPicks(joint, "movie", venue.id, partner.id, [venue.name, partner.name]).filter((c) => adapted(c.pick)).slice(0, SOURCE_BOOKS);
  const found = await Promise.all(
    films.map(async ({ pick }): Promise<Rising | null> => {
      const got = await run.call("source_book", "/search", { query: pick.name, types: TYPE_URN.book, take: "3" }, `The book ${pick.name} is based on`);
      if (!got) return null;
      const book = parseEntities(got.body).find((e) => (e.type === "book" || e.type === null) && title(e.name) === title(pick.name));
      if (!book) return null;
      const r: Rising = {
        id: book.id,
        name: book.name,
        type: "book",
        rank: pick.rank,
        trend: "unknown",
        venueSignal: true,
        tags: book.tags.map((t) => t.id),
        filmOf: pick.id,
        because: [{ kind: "tag", text: `${pick.name} is filed as based on a book, and this is that book`, provenance: got.ref }],
      };
      const author = authorOf(book.disambiguation);
      if (author) r.by = author;
      if (book.image) r.image = book.image;
      if (book.url) r.url = book.url;
      return r;
    }),
  );
  return found.filter((r): r is Rising => r !== null);
}
