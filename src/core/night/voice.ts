import type { NightStop, PairFormat } from "../../shared/contract.ts";
import { shortName } from "../../shared/words.ts";

export function walkWords(min: number | undefined): string {
  if (!min || min <= 1) return "a minute away";
  return `about ${min} minutes away on foot`;
}

function apart(min: number | undefined): string {
  if (!min || min <= 1) return "a minute apart";
  return `about ${min} minutes apart on foot`;
}

function lower(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

// "Drinks after" is how the stop row says it; in a sentence it is "drinks".
function serving(what: string): string {
  return lower(what.replace(/ (after|first)$/, ""));
}

// A stop row inside a sentence: "the book club on Hunger", "drinks", "quiz round two on film: ...".
export function phrase(what: string): string {
  if (/^(Book club|Screening|Listening party|Late view)\b/.test(what)) return `the ${lower(what)}`;
  if (/ own set that night$/.test(what)) return what;
  if (/ (after|first)$/.test(what)) return serving(what);
  if (/^(Start|Finish) here$/.test(what)) return "the rest of the night";
  if (/^Quiz in /.test(what)) return `the ${lower(what)}`;
  return /^Quiz /.test(what) ? lower(what) : what;
}

// Why this night suits these two places, said the way someone who books venues would say it to the owner.
export function formatWhy(format: PairFormat, stops: NightStop[], link: string | null): string {
  const [a, b] = stops;
  if (!a || !b) return "";
  const A = shortName(a.name);
  const B = shortName(b.name);
  const walk = walkWords(a.walkMin);
  const lead = link ? `${link} ` : "";
  if (/ first$/.test(a.what) && format !== "quiz_crawl" && format !== "drinks_then_set" && format !== "two_stop") return `${A} shuts before the evening is out, so the night starts there with ${serving(a.what)} and moves on to ${B} for ${phrase(b.what)}, ${walk}.`;
  switch (format) {
    case "book_then_film":
      return link
        ? `${lead}A short book club at ${A}, then the film at ${B}, ${walk}. Readers find the cinema and the film crowd finds the shelves.`
        : `One evening, two rooms: a short book club at ${A}, then a film at ${B}, ${walk}. Readers find the cinema and the film crowd finds the shelves.`;
    case "film_then_show":
      return `${A} shows the film, then everyone walks to ${B} for its own ${/own set/.test(b.what) ? "set" : "show"}, ${walk}. Each crowd gets a night out in the other room.`;
    case "drinks_then_set":
      return `${A} gets the early crowd for ${serving(a.what)}, then everyone walks to ${B} for its own set, ${walk}. The room is full before the first note.`;
    case "screening_then_drinks":
      return `Nobody wants to go straight home after a good film. ${B} is ${walk}, so the talk carries on there over ${serving(b.what)}.`;
    case "book_club_then_drinks":
      return `${A} gets a full room on a quiet night, and ${B} gets the talk that carries on after, ${walk}.`;
    case "listening_party":
      return /own set/.test(b.what)
        ? `${A} plays the records first, then everyone walks to ${B} for the real thing, its own set, ${walk}.`
        : `${A} plays the records the way they should be heard, then ${B} takes everyone after, ${walk}.`;
    case "show_then_drinks":
      return `${A} fills its seats first, then the audience walks to ${B}, ${walk}, still talking about the show.`;
    case "late_view":
      return `${lead}${A} stays open late for one evening, and ${B} takes everyone after, ${walk}.`;
    case "quiz_crawl":
      if (/^Dinner first$/.test(a.what)) return `Dinner at ${A} first, then the quiz at ${B}, ${walk}. ${A} gets a full early sitting and ${B} gets the room for the rest of the night.`;
      return `Two rounds, one in each place, ${apart(a.walkMin)}. Each crowd spends an hour in the other room, and the walk between rounds is the point.`;
    case "two_stop":
      if (/ (first|after)$/.test(a.what) && / (first|after)$/.test(b.what)) return `${serving(a.what).replace(/^./, (c) => c.toUpperCase())} at ${A}, then ${serving(b.what)} at ${B}, ${apart(a.walkMin)}. Each crowd ends the night in the other room.`;
      return `Start at ${A} and finish at ${B}, ${apart(a.walkMin)}.`;
  }
}
