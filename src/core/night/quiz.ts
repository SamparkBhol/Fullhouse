import type { QlooType, Rising } from "../../shared/contract.ts";
import type { QuizRound } from "./activity.ts";
import { fallbackNote, ranked, type Chosen, type Place, type PickSet } from "./picks.ts";

export const ROUND_MAX = 4;
export const ROUND_MIN = 3;

export interface QuizSet extends PickSet {
  rounds: [QuizRound, QuizRound];
}

function round(type: QlooType, list: Chosen[]): QuizRound {
  return { type, picks: list.map((c) => c.pick) };
}

// A quiz is on a set people know: the TV shows both crowds share for round one, the films for round two, four of each
// when there are four. With too few of one, both rounds come from the other. The i-th night takes the next set.
export function quizSet(i: number, joint: Rising[], own: Rising[], venue: Place, partner: Place): QuizSet | null {
  const tv = ranked("tv_show", joint, own, venue, partner);
  const films = ranked("movie", joint, own, venue, partner);
  const at = (list: Chosen[], n: number) => list.slice(n * ROUND_MAX, n * ROUND_MAX + ROUND_MAX);
  let one: [QlooType, Chosen[]] = ["tv_show", at(tv, i)];
  let two: [QlooType, Chosen[]] = ["movie", at(films, i)];
  if (one[1].length < ROUND_MIN) one = ["movie", at(films, 2 * i)];
  if (one[0] === "movie") two = ["movie", at(films, 2 * i + 1)];
  if (two[1].length < ROUND_MIN && one[0] === "tv_show") two = ["tv_show", at(tv, 2 * i + 1)];
  if (one[1].length < ROUND_MIN || two[1].length < ROUND_MIN) return null;
  const chosen = [...one[1], ...two[1]];
  const notes = [...new Set(chosen.filter((c) => !c.joint).map((c) => fallbackNote(c, venue.name, partner.name)))];
  return { chosen, notes, link: null, rounds: [round(one[0], one[1]), round(two[0], two[1])] };
}
