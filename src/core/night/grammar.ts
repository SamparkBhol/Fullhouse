import type { KindGroup, NightFormat, PairFormat, QlooType } from "../../shared/contract.ts";
import { activityFor, minutesFor, serves, typesFor, type Activity } from "./activity.ts";

export interface PairFormatDef {
  format: PairFormat;
  label: string;
  // The Qloo types whose joint picks fill the night.
  types: QlooType[];
  // The night format the rest of the app files this under, for licence notes and turnout.
  legacy: NightFormat;
  // Which side's kind opens the night; null means the place that closes earlier goes first.
  opens: KindGroup | null;
  // What happens at the place that opens the night, and at the other one.
  main: Activity;
  other: Activity;
  // A bar, record shop or cafe is one of the two, so the night has somewhere for the playlist.
  music: boolean;
  firstMin: number;
  secondMin: number;
}

interface Row {
  format: PairFormat;
  opens: KindGroup | null;
  legacy: NightFormat;
}

const SERVES: KindGroup[] = ["drinks", "coffee", "food"];
const MUSIC_ROOMS = new Set<KindGroup>(["drinks", "record", "coffee"]);

function has(a: KindGroup | null, b: KindGroup | null, x: KindGroup, ys: Array<KindGroup | null>): boolean {
  return (a === x && ys.includes(b)) || (b === x && ys.includes(a));
}

function serving(g: KindGroup | null): boolean {
  return g !== null && SERVES.includes(g);
}

// First matching row wins. A TV show is never shown to a room: it only themes a quiz. A film is screened only at a cinema.
// A live room plays its own set, so the other place goes first and the set closes the night.
// Two stops with nothing on is the last row, so a bookshop, a cinema, a stage, a live room or a gallery always gets its own kind of night.
function rowFor(a: KindGroup | null, b: KindGroup | null): Row {
  if (has(a, b, "book", ["film"])) return { format: "book_then_film", opens: "book", legacy: "book" };
  if (has(a, b, "film", ["stage", "live"])) return { format: "film_then_show", opens: "film", legacy: "film" };
  if (has(a, b, "film", SERVES)) return { format: "screening_then_drinks", opens: "film", legacy: "film" };
  if (has(a, b, "book", [...SERVES, "stage", "live"])) return { format: "book_club_then_drinks", opens: "book", legacy: "book" };
  if (a === "record" || b === "record") return { format: "listening_party", opens: "record", legacy: "listening" };
  if (has(a, b, "live", [...SERVES, null])) return { format: "drinks_then_set", opens: a === "live" ? b : a, legacy: "show" };
  if (has(a, b, "stage", [...SERVES, "live"])) return { format: "show_then_drinks", opens: "stage", legacy: "show" };
  if (a === "art" || b === "art") return { format: "late_view", opens: "art", legacy: "art" };
  // A restaurant cannot stop service for a quiz round, so dinner comes first and the bar or cafe runs both rounds.
  if (has(a, b, "food", ["drinks", "coffee"])) return { format: "quiz_crawl", opens: "food", legacy: "quiz" };
  if (serving(a) && serving(b)) return { format: "quiz_crawl", opens: null, legacy: "quiz" };
  if (has(a, b, "book", [null])) return { format: "book_club_then_drinks", opens: "book", legacy: "book" };
  if (has(a, b, "film", [null])) return { format: "screening_then_drinks", opens: "film", legacy: "film" };
  if (has(a, b, "stage", [null])) return { format: "show_then_drinks", opens: "stage", legacy: "show" };
  return { format: "two_stop", opens: null, legacy: "tasting" };
}

const AFTER_NOUN: Partial<Record<Activity, string>> = {
  drinks: "drinks",
  dinner: "dinner",
  coffee: "coffee",
  show: "the show",
  set: "the set",
  screening: "a film",
  book_club: "a book club",
  meet: "on",
};

function labelFor(format: PairFormat, main: Activity, other: Activity): string {
  const then = (lead: string) => (AFTER_NOUN[other] ? `${lead} then ${AFTER_NOUN[other]}` : lead);
  switch (format) {
    case "book_then_film":
      return "book then film";
    case "film_then_show":
      return other === "set" ? "film then the set" : "film then show";
    case "screening_then_drinks":
      return then("screening");
    case "book_club_then_drinks":
      return then("book club");
    case "listening_party":
      return other === "set" ? "listening party then the set" : "listening party";
    case "drinks_then_set":
      return main === "meet" ? "meet first, then the set" : `${AFTER_NOUN[main] ?? "drinks"} then the set`;
    case "show_then_drinks":
      return then("show");
    case "late_view":
      return then("late view");
    case "quiz_crawl":
      return other === "quiz" ? "dinner then quiz" : "quiz crawl";
    case "two_stop":
      return serves(main) && serves(other) ? `${AFTER_NOUN[main]} then ${AFTER_NOUN[other]}` : "two stop night";
  }
}

function build(row: Row, a: KindGroup | null, b: KindGroup | null, main: Activity, other: Activity): PairFormatDef {
  const music = [a, b].some((g) => g !== null && MUSIC_ROOMS.has(g));
  return {
    format: row.format,
    label: labelFor(row.format, main, other),
    types: [...new Set([...typesFor(main), ...typesFor(other)])],
    legacy: row.legacy,
    opens: row.opens,
    main,
    other,
    music,
    firstMin: minutesFor(main, row.format, "first"),
    secondMin: minutesFor(other, row.format, "second"),
  };
}

export function pairFormat(a: KindGroup | null, b: KindGroup | null): PairFormatDef {
  const row = rowFor(a, b);
  const otherGroup = row.opens === null ? null : a === row.opens ? b : a;
  const crawl = row.format === "quiz_crawl" && row.opens === null;
  const main: Activity = crawl ? "quiz_tv" : row.opens ? activityFor(row.opens) : "meet";
  const other: Activity = crawl ? "quiz_film" : row.format === "quiz_crawl" ? "quiz" : row.format === "drinks_then_set" && !row.opens ? "set" : row.opens ? activityFor(otherGroup) : "meet";
  return build(row, a, b, main, other);
}

// The owner ruled the format out, so the two places still meet, with nothing on that the owner said no to.
// Two places that serve keep their own activities, dinner at one and drinks at the other.
export function plainTwoStop(a: KindGroup | null, b: KindGroup | null): PairFormatDef {
  if (serving(a) && serving(b) && a !== b) return build({ format: "two_stop", opens: a, legacy: "tasting" }, a, b, activityFor(a), activityFor(b));
  return build({ format: "two_stop", opens: null, legacy: "tasting" }, a, b, "meet", "meet");
}

// The joint read asks for the format's own types, plus artists only when a bar, record shop or cafe can play them.
export function jointTypes(def: Pick<PairFormatDef, "types" | "music">): QlooType[] {
  return [...new Set<QlooType>([...def.types, ...(def.music ? (["artist"] as QlooType[]) : [])])];
}
