import type { Because, QlooType, Rising, StreetRead } from "../../../src/shared/contract.ts";
import { TREND_WORDS } from "../format.ts";
import { type FoldPart } from "./fold.ts";
import { ownReasons, sharedLine } from "./lists.ts";
import { pickLine, shelf } from "./shelf.ts";
import { ledge } from "./ledge.ts";

export const TYPE_HEADINGS: Record<QlooType, string> = {
  place: "Places",
  artist: "Artists",
  book: "Books",
  movie: "Films",
  tv_show: "TV shows",
  podcast: "Podcasts",
  videogame: "Video games",
  brand: "Brands",
  person: "People",
  destination: "Destinations",
};

function byType(read: StreetRead): [QlooType, Rising[]][] {
  const types = [...new Set(read.rising.map((r) => r.type))];
  return types.map((t) => [t, read.rising.filter((r) => r.type === t).sort((a, b) => a.rank - b.rank)]);
}

// One shelf per kind, its covers standing face out on a plain shelf line at their own shapes.
export function pickShelves(read: StreetRead): HTMLElement[] {
  return byType(read).map(([type, picks]) => {
    const ranked = picks.every((r) => r.venueSignal !== false);
    const label = TYPE_HEADINGS[type] ?? type;
    return ledge(
      { label, level: "h3", className: "pick-group" },
      shelf(
        picks.map((r) => ({ entity: r, line: pickLine(r) })),
        { label, ranked },
      ),
    );
  });
}

// Qloo's weekly series held flat on this host, so a trend is told only when one actually moved.
export function pickParts(read: StreetRead): FoldPart[] {
  return byType(read).map(([type, picks]) => {
    const shared = sharedLine(picks);
    const own: Because[] = picks.flatMap((r) => [
      ...ownReasons(r, shared).map((b) => ({ ...b, text: `${r.name}. ${b.text}` })),
      ...(r.trend !== "unknown" ? [{ kind: "trending" as const, text: `${r.name}. ${TREND_WORDS[r.trend]}${r.trendNote ? `, ${r.trendNote}` : ""}`, provenance: -1 }] : []),
    ]);
    return { heading: TYPE_HEADINGS[type] ?? type, because: [...(shared ? [shared] : []), ...own], nested: true };
  });
}
