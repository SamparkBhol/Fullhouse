import { ordinal, possessive, shortName } from "../../../src/shared/words.ts";
import type { Example } from "../joint.ts";

// The two numbers behind the pair, one from each crowd's list. Without both, the plain line from the checks.
export function both(ex: Example): { ranks: [string, string] } | { line: string } | null {
  const v = shortName(ex.venue.name);
  const p = shortName(ex.partner.name);
  if (ex.partnerRank && ex.consideredOf && ex.back) {
    return {
      ranks: [
        `${p} is ${ordinal(ex.partnerRank)} of the ${ex.consideredOf} places ${possessive(v)} crowd loves nearby.`,
        `${v} is ${ordinal(ex.back.rank)} of the ${ex.back.of} places ${possessive(p)} crowd loves.`,
      ],
    };
  }
  const crowd = ex.checks.find((c) => c.key === "crowd");
  const back = ex.checks.find((c) => c.key === "back");
  if (crowd?.pass && back?.pass) return { line: "Each crowd counts the other place among the ones it loves nearby." };
  if (crowd?.pass) return { line: `Your crowd loves ${p}.` };
  return null;
}
