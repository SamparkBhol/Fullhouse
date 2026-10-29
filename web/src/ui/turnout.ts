import type { Night, Venue } from "../../../src/shared/contract.ts";
import { DREW_LITTLE, turnoutVerdict } from "../../../src/shared/turnout.ts";
import { nightKind } from "../format.ts";

// Says what next Monday's run will do with this turnout, using the same rule the run uses.
export function mondayLine(night: Night, venue: Venue): string | null {
  if (night.headcount === undefined) return null;
  const cap = night.maxPeople ?? venue.capacity;
  const kind = `${nightKind(night).toLowerCase()}s`;
  const verdict = turnoutVerdict(night.headcount, cap);
  if (!verdict || !cap) return `${night.headcount} came. Say how many fit and Monday can use the turnout to choose the next kind of night.`;
  const seats = `${night.headcount} of ${cap} seats`;
  if (verdict.next === "change_format") return `${seats}, under ${Math.round(DREW_LITTLE * 100)} percent. Monday will plan a different kind of night.`;
  if (verdict.next === "keep_format") return `${seats}. Monday keeps ${kind} in the mix.`;
  return `${seats}. Monday plans from the fresh read as usual.`;
}

export function lastLogged(nights: Night[]): Night | null {
  return [...nights].filter((n) => n.headcount !== undefined).sort((a, b) => `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`))[0] ?? null;
}
