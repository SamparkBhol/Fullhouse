import type { Fit, FitCheck, FitKey, LovedPlace, QuietSlot, Venue } from "../../shared/contract.ts";
import { BACK_CHECKS, FIT_LABELS, FIT_MAX } from "../../shared/engine.ts";
import { listedHours } from "../../shared/hours.ts";
import { walkMinutes } from "../../shared/walk.ts";
import { capFirst, listWords, ordinal, possessive, shortName } from "../../shared/words.ts";
import type { Back } from "./reverse.ts";
import { pairFormat } from "../night/grammar.ts";
import { dayFit, type DayFit } from "../night/schedule.ts";
import { article, complement, groupOf, kindOf, pluralWord } from "./groups.ts";
import { SHOWN_TAGS, type TasteTag } from "./taste.ts";

export { FIT_LABELS, FIT_MAX } from "../../shared/engine.ts";

const WALK_FULL_M = 300;
const WALK_NONE_M = 1500;
const BOTH_WAYS_TOP = 10;
const EVENINGS = 7;

export interface FitInput {
  venue: Pick<Venue, "entity" | "quietSlot">;
  partner: LovedPlace;
  forward: { rank: number; of: number; ref: number | null };
  back: Back;
  taste: TasteTag[];
  tasteRef: number | null;
}

function check(key: FitKey, raw: number, pass: boolean, sentence: string, ref: number | null): FitCheck {
  const c: FitCheck = { key, label: FIT_LABELS[key], pass, points: Math.round(Math.max(0, Math.min(1, raw)) * FIT_MAX[key]), max: FIT_MAX[key], sentence };
  if (ref !== null) c.provenance = ref;
  return c;
}

function rankShare(rank: number, of: number): number {
  return of > 0 ? 1 - (rank - 1) / of : 0;
}

function crowd(i: FitInput): FitCheck {
  const { rank, of } = i.forward;
  const share = rankShare(rank, of);
  return check("crowd", share, share >= 0.5, `${shortName(i.partner.name)} is ${ordinal(rank)} of the ${of} places your crowd loves nearby.`, i.forward.ref);
}

function back(i: FitInput): FitCheck {
  const v = shortName(i.venue.entity.name);
  const theirs = `${possessive(shortName(i.partner.name))} crowd`;
  const r = i.back.rank;
  if (!r.checked) return check("back", 0, false, `Not checked. Full House asks this of the ${BACK_CHECKS} places that score best on the other checks.`, null);
  if (r.rank === null) {
    const why = r.of ? `${v} is not among the ${r.of} places ${theirs} loves nearby.` : `No places came back for ${theirs} nearby.`;
    return check("back", 0, false, why, i.back.ref);
  }
  const share = rankShare(r.rank, r.of);
  const both = r.rank <= BOTH_WAYS_TOP ? " It goes both ways." : "";
  // The same bar as crowd pull: the top half of the partner's list passes, lower down is a mention, not a finding.
  return check("back", share, share >= 0.5, `${v} is ${ordinal(r.rank)} of the ${r.of} places ${theirs} loves.${both}`, i.back.ref);
}

function partners(i: FitInput): FitCheck {
  const mine = kindOf(i.venue.entity);
  const theirs = kindOf(i.partner);
  const value = complement(mine.group, theirs.group);
  const pair = `${capFirst(article(mine.word))} and ${article(theirs.word)}`;
  const sentence =
    value >= 0.9
      ? `${pair} send each other people. Two ${pluralWord(mine.word)} would compete for them.`
      : value >= 0.7
        ? `${pair} suit each other, and they sell different things.`
        : `${pair} are not rivals, but they are not a natural pair either.`;
  return check("partners", value, value >= 0.7, sentence, null);
}

function on(n: number): string {
  return n === EVENINGS ? "every evening" : `on ${n} of the next ${EVENINGS} evenings`;
}

// Each place is checked at the time of its own stop, the way the night would run: the main activity first, an hour
// earlier if that keeps a shop inside its hours, the serving place first if it shuts early. The venue opening late
// for its own part counts for half.
function open(i: FitInput): FitCheck {
  const v = shortName(i.venue.entity.name);
  const p = shortName(i.partner.name);
  const venue = { at: "venue" as const, place: i.venue.entity, group: groupOf(i.venue.entity) };
  const partner = { at: "partner" as const, place: i.partner, group: groupOf(i.partner) };
  const setup = { def: pairFormat(venue.group, partner.group), venue, partner, slot: i.venue.quietSlot, distanceM: i.partner.distanceM };
  const days = Array.from({ length: EVENINGS }, (_, d) => dayFit(setup, d as QuietSlot["weekday"]));
  const count = (x: DayFit) => days.filter((d) => d === x).length;
  const [opened, late, unknown] = [count("open"), count("late"), count("unknown")];
  const venueListed = listedHours(i.venue.entity) !== null;
  const partnerListed = listedHours(i.partner) !== null;
  let sentence: string;
  if (!partnerListed && !venueListed) sentence = "Neither place lists its opening hours, so check both before the night.";
  else if (!partnerListed) sentence = `${p} lists no opening hours, so check them before you ask.${unknown ? ` ${v} is open for its part ${on(unknown)}.` : late ? ` ${v} would open late for its part.` : ""}`;
  else if (!venueListed) sentence = `${p} is open for its part ${on(unknown)}. ${possessive(v)} own hours are not listed.`;
  else if (opened) sentence = `Both are open for their part of the night ${on(opened)}.${late ? ` On ${late} more, ${v} would open late for its part.` : ""}`;
  else if (late) sentence = `${v} shuts before its part of the night, so it would open late for it. ${p} is open for its part ${on(late)}.`;
  else sentence = "By their listed hours the two are never open together for their parts of the night.";
  return check("open", (opened + 0.5 * (late + unknown)) / EVENINGS, opened >= 4, sentence, null);
}

function walk(i: FitInput): FitCheck {
  const m = i.partner.distanceM;
  const share = m <= WALK_FULL_M ? 1 : (WALK_NONE_M - m) / (WALK_NONE_M - WALK_FULL_M);
  const n = walkMinutes(m);
  return check("walk", share, share >= 0.5, `About ${n} minute${n === 1 ? "" : "s"} on foot.`, i.forward.ref);
}

// Only tags that set the pair apart from the street count. A tag most of the street carries says nothing about these two,
// so it earns nothing and is never named.
function taste(i: FitInput): FitCheck {
  const specific = i.taste.filter((t) => !t.generic).slice(0, SHOWN_TAGS);
  if (!i.taste.length) return check("taste", 0, false, "The two places share no tags that say what their crowds go for.", i.tasteRef);
  if (!specific.length) return check("taste", 0, false, "They share only what the whole street shares.", i.tasteRef);
  const strength = specific.reduce((s, t) => s + t.strength, 0) / SHOWN_TAGS;
  const names = listWords(specific.map((t) => t.tag.name));
  const rarest = [...specific].sort((a, b) => (a.tag.carriers ?? 0) - (b.tag.carriers ?? 0))[0]!;
  const { carriers = 0, pool = 0 } = rarest.tag;
  const few = pool ? ` ${carriers === 0 ? "None" : `Only ${carriers}`} of the ${pool} other places nearby ${carriers === 1 ? "is" : "are"} tagged ${rarest.tag.name}.` : "";
  return check("taste", strength, true, `Both places share ${names}.${carriers <= pool / 4 ? few : ""}`, i.tasteRef);
}

export function fitOf(i: FitInput): Fit {
  const checks = [crowd(i), back(i), partners(i), open(i), walk(i), taste(i)];
  return { score: checks.reduce((s, c) => s + c.points, 0), checks };
}
