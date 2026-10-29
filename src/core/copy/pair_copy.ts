import type { MatchPartner, NightCopy, NightPlan, NightStop, PairNight, Rising, Venue } from "../../shared/contract.ts";
import { capFirst, listWords, ordinal, shortName, theTitle } from "../../shared/words.ts";
import { describeDate } from "../planner/time.ts";
import { phrase } from "../night/voice.ts";
import { fit, shortTitle, withArticle } from "./text.ts";

type CopyFields = Omit<NightCopy, "writtenBy">;

// A stop row at the start of a clause: "book club on Hunger", but "Soho Theatre's own show" keeps its capital.
function rowLower(stop: NightStop | undefined): string {
  const what = stop?.what ?? "";
  if (stop && what.startsWith(shortName(stop.name))) return what;
  return what ? what.charAt(0).toLowerCase() + what.slice(1) : what;
}

function serveWord(stop: NightStop | undefined, at: "first" | "after"): string | null {
  const m = new RegExp(`^(Drinks|Dinner|Coffee) ${at}$`).exec(stop?.what ?? "");
  return m ? m[1]! : null;
}

function afterNoun(stop: NightStop | undefined, b: string): string {
  const served = serveWord(stop, "after");
  if (served) return served.toLowerCase();
  const what = stop?.what ?? "";
  if (/own show/.test(what)) return `the show at ${b}`;
  if (/own set/.test(what)) return `the set at ${b}`;
  if (what.startsWith("Book club")) return `a book club at ${b}`;
  if (what.startsWith("Screening")) return `a film at ${b}`;
  if (what.startsWith("Late view")) return `a late view at ${b}`;
  return `on to ${b}`;
}

function pickOf(pair: PairNight, type: Rising["type"]): Rising | undefined {
  return pair.picks.find((p) => p.type === type);
}

function quizKind(pair: PairNight): string {
  const tv = pair.picks.some((p) => p.type === "tv_show");
  const film = pair.picks.some((p) => p.type === "movie");
  return tv && film ? "TV and film quiz" : tv ? "TV quiz" : "Film quiz";
}

function titles(pair: PairNight, a: string, b: string): string[] {
  const [s1, s2] = pair.stops;
  const book = pickOf(pair, "book");
  const film = pickOf(pair, "movie");
  const artist = pickOf(pair, "artist");
  const bk = book ? shortTitle(book.name) : "the book";
  const fm = film?.name ?? "the film";
  const fs = film ? shortTitle(film.name) : "the film";
  const first = serveWord(s1, "first");
  const after = afterNoun(s2, b);
  const club = `${theTitle(bk)} book club`;
  switch (pair.format) {
    case "book_then_film":
      if (book?.filmOf && book.filmOf === film?.id) return [`${fm}: the book, then the film`, `${fs}: book, then film`, `Book then film at ${a} and ${b}`, "Book then film"];
      return [`${capFirst(club)}, then ${fm}`, `${bk}, then ${fs}`, `Book then film at ${a} and ${b}`, "Book then film"];
    case "film_then_show": {
      const noun = /own set/.test(s2?.what ?? "") ? "the set" : "a show";
      return [`${fm} at ${a}, then ${noun} at ${b}`, `${fs}, then ${noun} at ${b}`, `${fs}, then ${noun}`, `Film then ${noun} at ${a} and ${b}`, `Film then ${noun}`];
    }
    case "drinks_then_set":
      return [`${first ?? "Drinks"}, then the set at ${b}`, `${first ?? "Drinks"} at ${a}, then the set at ${b}`, "Then the set"];
    case "screening_then_drinks":
      if (first) return [`${first}, then ${fm}`, `${first}, then ${fs}`, `${first}, then the film`];
      return [`${fm}, then ${after} at ${b}`, `${fs}, then ${after}`, `Screening then ${after}`];
    case "book_club_then_drinks":
      if (first) return [`${first}, then ${club}`, `${first}, then the book club`];
      return [`${capFirst(club)}, then ${after}`, `${bk} book club, then ${after}`, `Book club then ${after}`];
    case "listening_party":
      if (/own set/.test(s2?.what ?? "")) return [`${artist?.name ?? "Records"} at ${a}, then the set at ${b}`, `Listening party, then the set at ${b}`, "Listening party then the set"];
      return [`${artist?.name ?? "Records"} listening party at ${a}`, `${artist?.name ?? "A"} listening party`, "Listening party"];
    case "show_then_drinks":
      if (first) return [`${first}, then a show at ${b}`, "Drinks, then a show"];
      return [`A show at ${a}, then ${after} at ${b}`, `Show then ${after}`, "Show then drinks"];
    case "late_view":
      if (first) return [`${first}, then a late view at ${b}`, "Late view"];
      if (film) return [`Late view at ${a}, then ${fm}`, `Late view, then ${fs}`, "Late view, then a film"];
      if (book) return [`Late view at ${a}, then the ${bk} book club`, `Late view, then ${bk}`, "Late view, then a book club"];
      return [`Late view at ${a}, then ${after}`, `Late view, then ${after.replace(/ at .*$/, "")}`, "Late view"];
    case "quiz_crawl":
      if (first) return [`${first}, then the ${quizKind(pair)} at ${b}`, `${first}, then the ${quizKind(pair)}`, "Dinner then quiz"];
      return [`${quizKind(pair)} crawl at ${a} and ${b}`, `${quizKind(pair)} crawl`];
    case "two_stop":
      if (first && serveWord(s2, "after")) return [`${first} at ${a}, then ${afterNoun(s2, b)} at ${b}`, `${first}, then ${afterNoun(s2, b)}`];
      return [`One night at ${a} and ${b}`, "Two stop night"];
  }
}

function opensLate(stop: NightStop | undefined, name: string): string {
  return stop?.afterHours ? ` ${name} opens late for it.` : "";
}

function playlistLine(plan: NightPlan, pair: PairNight): string {
  const at = pair.stops.filter((s) => (pair.playlistAt ?? []).includes(s.at)).map((s) => shortName(s.name));
  const lead = pickOf(pair, "artist")?.id;
  const names = plan.playlist.filter((x) => x.id !== lead).slice(0, 3).map((x) => x.name);
  if (!at.length || !names.length) return "";
  return ` The playlist at ${listWords(at)}: ${names.join(", ")} and more.`;
}

// A screening, a show or a set sells its own seats. Nothing is ever called free: each place keeps its own door and prices.
function ticketed(pair: PairNight): string[] {
  return pair.stops.filter((s) => /^Screening|own show|own set/.test(s.what)).map((s) => shortName(s.name));
}

function closing(pair: PairNight): string {
  const t = ticketed(pair);
  const rsvp = "RSVP so both places know how many to expect.";
  if (!t.length) return `Entry and prices as usual at each place. ${rsvp}`;
  return `${listWords(t)} ${t.length > 1 ? "sell their" : "sells its"} own tickets as usual. ${rsvp}`;
}

// Every two stop night names both places, so it only goes up once the partner has said yes.
export function pairCopy(plan: NightPlan, venue: Venue): CopyFields {
  const pair = plan.pair as PairNight;
  const [first, second] = pair.stops;
  const a = shortName(first?.name ?? venue.entity.name);
  const b = shortName(second?.name ?? plan.match?.partner.name ?? "");
  const day = describeDate(plan.date);
  const dayShort = day.split(" ")[0] ?? day;
  const stop1 = first ? `${first.start} to ${first.end} at ${a}: ${rowLower(first)}.${opensLate(first, a)}` : "";
  const stop2 = second ? ` Then ${walkTo(first?.walkMin)} to ${b} for ${phrase(second.what)}, ${second.start} to ${second.end}.${opensLate(second, b)}` : "";
  const link = pair.link ? ` ${pair.link}` : "";
  const all = titles(pair, a, b);
  const free = "";
  const rsvp = " RSVP at the link.";
  const title = fit(all, 60);
  return {
    eventTitle: title,
    eventDescription: `${day}. ${stop1}${stop2}${link}${playlistLine(plan, pair)} ${closing(pair)}`,
    posterHeadline: fit([title, ...all.slice(1)], 40),
    posterSub: fit([`${first?.start ?? plan.start} at ${a}, ${second?.start ?? ""} at ${b}.${free}`, `${a} then ${b}.${free}`], 90),
    social: fit(
      [
        `${dayShort} ${first?.start ?? plan.start}: ${rowLower(first)} at ${a}, then ${phrase(second?.what ?? "")} at ${b}.${rsvp}`,
        `${dayShort} ${plan.start}, ${a} then ${b}.${rsvp}`,
      ],
      280,
    ),
    partnerPitch: pairPitch(plan, venue, pair, day),
  };
}

function walkTo(min: number | undefined): string {
  return !min || min <= 1 ? "a minute's walk" : `about ${min} minutes on foot`;
}

function fromYou(min: number | undefined): string {
  return !min || min <= 1 ? "a minute from you" : `about ${min} minutes on foot from you`;
}

function backLine(partner: MatchPartner, v: string): string {
  const back = partner.reverseRank;
  const p = shortName(partner.name);
  if (back?.rank) return `Taste data puts ${v} ${ordinal(back.rank)} of the ${back.of} places nearby that people who like ${p} love, and ${p} ${ordinal(partner.rank)} on our list.`;
  return `Taste data puts your place ${ordinal(partner.rank)} of the places nearby that people who like ${v} love.`;
}

function pairPitch(plan: NightPlan, venue: Venue, pair: PairNight, day: string): CopyFields["partnerPitch"] {
  const v = shortName(venue.entity.name);
  const partner = plan.match?.partner as MatchPartner;
  const [first, second] = pair.stops;
  const at = (s: NightStop | undefined) => (s?.at === "partner" ? "at yours" : `at ${v}`);
  const to = (s: NightStop | undefined) => (s?.at === "partner" ? "to yours" : `to ${v}`);
  const steps = first && second ? `${rowLower(first)} ${at(first)} from ${first.start} to ${first.end}, then everyone walks over ${to(second)} for ${phrase(second.what)} until ${second.end}` : pair.label;
  const link = pair.link ? ` ${pair.link}` : "";
  return {
    subject: fit([`${capFirst(pair.label)} with ${v} on ${day}`, `A night with ${v} on ${day}`], 100),
    body: [
      "Hi there,",
      "",
      `We run ${v}, ${fromYou(first?.walkMin)}. ${partner ? backLine(partner, v) : ""}`.trim(),
      "",
      `So we would like to put on ${withArticle(/night$/.test(pair.label) ? pair.label : `${pair.label} night`)} with you on ${day}: ${steps}.${link} Your regulars come to ours and ours come to yours. We each tell our own crowd, and both names go on the event page once you say yes.`,
      "",
      "Are you in?",
      "",
      "Thanks,",
      v,
    ].join("\n"),
  };
}

export function pairName(plan: Pick<NightPlan, "pair">): string | null {
  return plan.pair?.label ?? null;
}
