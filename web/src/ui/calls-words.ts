import type { Provenance } from "../../../src/shared/contract.ts";
import { listWords, plural } from "../../../src/shared/words.ts";

// The calls behind the choice: the read itself, not the joint night planned from it afterwards, which asks with both
// places as the signal.
export function choiceCalls(rows: Provenance[]): Provenance[] {
  return rows.filter((p) => p.call !== "source_book" && !(p.call.startsWith("insights_") && (p.params["signal.interests.entities"] ?? "").includes(",")));
}

const REST: [RegExp, string][] = [
  [/_tags$/, "tags"],
  [/^heat_/, "heat"],
  [/^insights_/, "what your crowd loves"],
];

function joinParts(parts: string[]): string {
  if (parts.length < 3) return parts.join(" and ");
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function callsSentence(rows: Provenance[]): string | null {
  if (!rows.length) return null;
  const of = (call: string) => rows.filter((p) => p.call === call);
  const loved = of("loved_places");
  const back = of("loves_back").length;
  const compare = of("compare").length;
  const rest = rows.filter((p) => !["loved_places", "loves_back", "compare"].includes(p.call));
  const restWords = REST.filter(([re]) => rest.some((p) => re.test(p.call))).map(([, w]) => w);
  if (rest.some((p) => !REST.some(([re]) => re.test(p.call)))) restWords.push("other lookups");
  const parts = [
    loved.length === 1 ? `1 list of ${loved[0]!.resultCount} places` : loved.length ? `${loved.length} lists of places` : null,
    back ? (back === 1 ? "1 list from a candidate's own crowd" : `${back} lists from each candidate's own crowd`) : null,
    compare ? plural(compare, "comparison", "comparisons") : null,
    rest.length ? `${rest.length} for ${listWords(restWords)}` : null,
  ].filter((x): x is string => Boolean(x));
  return `This choice took ${plural(rows.length, "call", "calls")}: ${joinParts(parts)}.`;
}

// While the read runs: every answer that has come back, and how many came from the neighbours' own crowds.
export function answersSoFar(done: string[]): string | null {
  if (!done.length) return null;
  const back = done.filter((c) => c === "loves_back").length;
  return `${plural(done.length, "answer", "answers")} back so far, ${back} from your neighbours' side`;
}
