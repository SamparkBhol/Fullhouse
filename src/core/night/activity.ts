import type { KindGroup, PairFormat, QlooType, Rising } from "../../shared/contract.ts";
import { TYPE_PLURAL, listWords, possessive, shortName } from "../../shared/words.ts";
import { shortTitle } from "../copy/text.ts";

export type Activity = "book_club" | "screening" | "listening" | "show" | "set" | "late_view" | "quiz_tv" | "quiz_film" | "quiz" | "drinks" | "dinner" | "coffee" | "meet";

const BY_GROUP: Record<KindGroup, Activity> = {
  book: "book_club",
  film: "screening",
  record: "listening",
  live: "set",
  stage: "show",
  art: "late_view",
  drinks: "drinks",
  food: "dinner",
  coffee: "coffee",
};

export function activityFor(group: KindGroup | null): Activity {
  return group ? BY_GROUP[group] : "meet";
}

const TYPES: Partial<Record<Activity, QlooType[]>> = {
  book_club: ["book"],
  screening: ["movie"],
  listening: ["artist"],
  quiz_tv: ["tv_show"],
  quiz_film: ["movie"],
  quiz: ["tv_show", "movie"],
};

export function typesFor(a: Activity): QlooType[] {
  return TYPES[a] ?? [];
}

// A book club before a film is short, so the film still starts in the evening.
export function minutesFor(a: Activity, format: PairFormat, at: "first" | "second"): number {
  if (a === "book_club") return format === "book_then_film" ? 60 : 75;
  if (a === "screening") return 120;
  if (a === "listening" || a === "show" || a === "set") return at === "first" ? 90 : 75;
  if (a === "late_view") return at === "first" ? 75 : 60;
  if (a === "meet") return 75;
  if (a === "quiz") return 105;
  if (a === "dinner" && at === "first") return 75;
  return 60;
}

export const SERVING = new Set<Activity>(["drinks", "dinner", "coffee"]);

export function serves(a: Activity): boolean {
  return SERVING.has(a);
}

export interface QuizRound {
  type: QlooType;
  picks: Rising[];
}

export interface StopPicks {
  book?: Rising;
  film?: Rising;
  artist?: Rising;
  rounds?: [QuizRound, QuizRound];
}

const SERVE_WORD: Partial<Record<Activity, string>> = { drinks: "Drinks", dinner: "Dinner", coffee: "Coffee" };

function by(r: Rising | undefined): string {
  return r?.by ? ` by ${r.by}` : "";
}

function kindWord(r: QuizRound): string {
  return r.type === "tv_show" ? "TV" : TYPE_PLURAL[r.type];
}

function titlesOf(r: QuizRound): string {
  return listWords(r.picks.map((p) => shortTitle(p.name)));
}

function roundLine(n: "one" | "two", r: QuizRound | undefined): string {
  if (!r?.picks.length) return `Quiz round ${n}`;
  return `Quiz round ${n} on ${kindWord(r)}: ${titlesOf(r)}`;
}

function bothRounds(rounds: StopPicks["rounds"]): string {
  if (!rounds) return "Quiz in two rounds";
  const [a, b] = rounds;
  return `Quiz in two rounds, ${kindWord(a)} (${titlesOf(a)}), then ${kindWord(b)} (${titlesOf(b)})`;
}

// What happens at one stop, in the words the stop row shows.
export function activityText(a: Activity, place: { name: string }, picks: StopPicks, at: "first" | "second"): string {
  switch (a) {
    case "book_club":
      return picks.book ? `Book club on ${shortTitle(picks.book.name)}${by(picks.book)}` : "Book club";
    case "screening":
      return picks.film ? `Screening of ${picks.film.name}` : "Screening";
    case "listening":
      return picks.artist ? `Listening party for ${picks.artist.name}` : "Listening party";
    case "show":
      return `${possessive(shortName(place.name))} own show that night`;
    case "set":
      return `${possessive(shortName(place.name))} own set that night`;
    case "late_view":
      return "Late view of the current show";
    case "quiz_tv":
      return roundLine("one", picks.rounds?.[0]);
    case "quiz_film":
      return roundLine("two", picks.rounds?.[1]);
    case "quiz":
      return bothRounds(picks.rounds);
    case "meet":
      return at === "first" ? "Start here" : "Finish here";
    default:
      return `${SERVE_WORD[a] ?? "Drinks"} ${at === "first" ? "first" : "after"}`;
  }
}
