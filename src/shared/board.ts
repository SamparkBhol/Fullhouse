import type { Considered, Verdict } from "./contract.ts";
import { article, ordinal, shortName } from "./words.ts";

export const BOARD_SHOWN = 10;

// The first rows in Qloo's order, always with the rows that must show (the partner, and on the partner screen the
// runners up) even when they sit further down, so the jump in rank is there to see.
export function boardRows(rows: Considered[], n: number, keep: Verdict[] = ["partner", "runner_up"]): { shown: Considered[]; folded: Considered[] } {
  const must = rows.filter((r) => keep.includes(r.verdict)).slice(0, n);
  const rest = rows.filter((r) => !must.includes(r)).slice(0, Math.max(0, n - must.length));
  const shown = rows.filter((r) => must.includes(r) || rest.includes(r));
  return { shown, folded: rows.filter((r) => !shown.includes(r)) };
}

// What happened to the place at the top of the list, as the end of a sentence.
function fate(r: Considered): string {
  switch (r.verdict) {
    case "not_a_room":
      return `is ${article(r.kind)}`;
    case "rival":
      return `is another ${r.kind}`;
    case "no_owner":
      return "lists no website";
    case "closed":
      return "is listed as closed";
    case "you":
      return "is your own venue";
    default:
      return r.score !== undefined ? `scored ${r.score}` : "scored lower";
  }
}

// One sentence on top of the board, said as Full House's decision about Qloo's list.
export function boardSentence(rows: Considered[], of: number, crowd = "your crowd"): string | null {
  const partner = rows.find((r) => r.verdict === "partner");
  if (!partner) return null;
  const name = shortName(partner.name);
  if (partner.rank === 1) return `Full House checked the ${of} places Qloo lists for ${crowd} nearby and chose the 1st, ${name}.`;
  const first = [...rows].sort((a, b) => a.rank - b.rank)[0];
  const lead = `Full House chose the ${ordinal(partner.rank)} of Qloo's ${of}, ${name}.`;
  return first && first.rank === 1 ? `${lead} The 1st, ${shortName(first.name)}, ${fate(first)}.` : lead;
}
