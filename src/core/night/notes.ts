import type { NightStop } from "../../shared/contract.ts";
import { DAY_PLURAL } from "../../shared/hours.ts";
import { shortName } from "../../shared/words.ts";
import { describeDate } from "../planner/time.ts";
import { closesOn, type Schedule } from "./schedule.ts";
import { phrase } from "./voice.ts";
import type { Side } from "./stops.ts";

function phraseOf(stop: NightStop | undefined): string {
  const what = stop?.what ?? "";
  if (/own show/.test(what)) return "the show";
  if (/own set/.test(what)) return "the set";
  return phrase(what || "the second part");
}

function closeWords(side: Side, weekday: number): string {
  const t = closesOn(side, weekday);
  return t ? `closes at ${t} on ${DAY_PLURAL[weekday]}` : `is shut on ${DAY_PLURAL[weekday]}`;
}

// "the book club", "the screening": what the venue opens late for, from its own stop.
export function activityNoun(what: string): string {
  const w = what.toLowerCase();
  if (w.startsWith("book club")) return "the book club";
  if (w.startsWith("screening")) return "the screening";
  if (w.startsWith("quiz")) return "the quiz";
  if (w.startsWith("listening")) return "the listening party";
  if (w.startsWith("late view")) return "the late view";
  if (w.includes("show")) return "the show";
  if (w.includes("own set")) return "the set";
  return "the night";
}

function checkHours(s: Schedule): string | null {
  const unknown = s.fitting.unknown.filter((x) => x.at === "partner");
  if (!unknown.length) return null;
  const date = describeDate(s.fitting.day.date);
  const venueUnknown = s.fitting.unknown.some((x) => x.at === "venue");
  if (venueUnknown) return `Neither place lists opening hours, so check both are open on ${date} before you ask.`;
  return `${shortName(unknown[0]!.place.name)} lists no opening hours, so check they are open on ${date} before you ask.`;
}

// One plain line per thing the owner should know about the day and the hours, in the order they matter.
function runs(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} hour${h === 1 ? "" : "s"}${m ? ` ${m} minutes` : ""}`;
}

export function dayNotes(s: Schedule, stops: NightStop[], venue: Side, film: { name: string; minutes?: number } | null = null): string[] {
  const f = s.fitting;
  const out: string[] = [];
  const b = s.blockers[0];
  const partner = s.blockers.find((x) => x.at === "partner");
  if (s.stuck) {
    const who = partner ?? b;
    out.push(`By the listed hours ${who ? shortName(who.place.name) : "one of the two places"} is shut for its part of the night on every evening this week, so pick another start time before you ask.`);
  } else if (b && s.moved) {
    out.push(`${shortName(b.place.name)} ${closeWords(b, s.asked)}, so the night moves to ${describeDate(f.day.date)}, when both places are open for their part.`);
  } else if (b && f.earlier) {
    out.push(`${shortName(b.place.name)} ${closeWords(b, s.asked)}, so the night starts at ${stops[0]?.start}, while it is still open.`);
  } else if (f.earlier && !b) {
    const lead = film?.minutes ? `${film.name} runs ${runs(film.minutes)}` : "The first part runs long";
    out.push(`${lead}, so the night starts at ${stops[0]?.start} and ${phraseOf(stops[1])} at ${shortName(stops[1]?.name ?? "")} starts at ${stops[1]?.start}.`);
  } else if (partner && f.arranged.swapped) {
    out.push(`${shortName(partner.place.name)} ${closeWords(partner, f.day.weekday)}, so the night starts there while it is open.`);
  }
  if (f.afterHours) {
    const mine = stops.find((x) => x.at === "venue");
    out.push(`${shortName(venue.place.name)} ${closeWords(venue, f.day.weekday)}, so this is an after hours event: you open late for ${activityNoun(mine?.what ?? "")}.`);
  }
  const check = checkHours(s);
  if (check) out.push(check);
  return out;
}
