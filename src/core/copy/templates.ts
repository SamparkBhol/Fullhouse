import type { NightCopy, NightPlan, Venue } from "../../shared/contract.ts";
import { FORMATS, menuItem } from "../planner/formats.ts";
import { describeDate } from "../planner/time.ts";
import { capFirst, listWords, plainName } from "../../shared/words.ts";
import { fit, shortTitle, withArticle } from "./text.ts";
import { pairCopy } from "./pair_copy.ts";
import { planTheme, themeWords } from "./theme.ts";

type CopyFields = Omit<NightCopy, "writtenBy">;

// The same note goes to every partner, so it greets them as a neighbour and gets to the ask in three short paragraphs.
function pitch(plan: NightPlan, venue: Venue, day: string, night: string): CopyFields["partnerPitch"] {
  const v = plainName(venue.entity.name);
  const what = plan.feature ? `${night} around ${plan.feature.name}` : night;
  if (plan.match) return jointPitch(plan, v, day, what);
  return {
    subject: fit([`${capFirst(night)} at ${v} on ${day}`, `${capFirst(night)} on ${day}`], 100),
    body: [
      "Hi there,",
      "",
      `We run ${v}, a short walk from you. On ${day} from ${plan.start} to ${plan.end} we are putting on ${withArticle(what)}.`,
      "",
      `Taste data puts your place among the spots nearby that people who like ${v} also like, which is why we are writing to you.`,
      "",
      "Would you cross promote it with us? We would put your name on our event page and poster, and we are happy to do the same for one of your nights.",
      "",
      "Thanks,",
      v,
    ].join("\n"),
  };
}

// A joint night is asked for, not announced: nothing names the partner in public until they say yes.
function jointPitch(plan: NightPlan, v: string, day: string, what: string): CopyFields["partnerPitch"] {
  const m = plan.match;
  const shared = listWords((m?.shared ?? []).slice(0, 3).map((t) => t.name.toLowerCase()));
  const where = m?.host === "partner" ? "at your place" : `at ${v}`;
  return {
    subject: fit([`A night with ${v} on ${day}`, `A joint night on ${day}`], 100),
    body: [
      "Hi there,",
      "",
      `We run ${v}, a short walk from you. Qloo's aggregate taste data says the people who like ${v} also love your place${shared ? `, and that both crowds go for ${shared}` : ""}.`,
      "",
      `So we would like to put on ${withArticle(what)} with you, ${where}, on ${day} from ${plan.start} to ${plan.end}. We each tell our regulars, and both names go on the event page once you say yes.`,
      "",
      "Are you in?",
      "",
      "Thanks,",
      v,
    ].join("\n"),
  };
}

function tastingLead(plan: NightPlan): string {
  const lead = plan.themeTags[0];
  return lead ? menuItem(lead).replace(/ food$/, "") : "street favourites";
}

export function nightName(plan: NightPlan): string {
  if (plan.pair) return plan.pair.label;
  if (plan.format === "film") return "film night";
  if (plan.format === "tasting") return `${tastingLead(plan)} tasting night`;
  return FORMATS[plan.format].label;
}

// A night the partner hosts is held at the partner's place, so its public copy names that place.
// Qloo puts a spaced dash before a branch's city; copy reads it as "Angelika Film Center & Cafe, New York".
export function hostName(plan: Pick<NightPlan, "match">, venue: Venue): string {
  return plainName(plan.match?.host === "partner" ? plan.match.partner.name : venue.entity.name);
}

export function templateCopy(plan: NightPlan, venue: Venue): NightCopy {
  if (plan.pair) return { ...pairCopy(plan, venue), writtenBy: "template" };
  const v = hostName(plan, venue);
  const day = describeDate(plan.date);
  const dayShort = day.split(" ")[0] ?? day;
  const f = plan.feature?.name ?? "";
  const fs = shortTitle(f);
  const theme = planTheme(plan, venue.city);
  const themeText = listWords(themeWords(theme));
  const genreText = listWords(theme.filter((p) => p.kind === "genre").map((p) => p.text));
  const others = plan.playlist.filter((a) => a.name !== f).slice(0, 4).map((a) => a.name);
  const when = `On ${day} from ${plan.start} to ${plan.end}`;
  const rsvp = "Entry and prices as usual. RSVP so we know how many chairs to put out.";
  // A joint pick is loved by both crowds; a solo pick by the venue's own, and the copy says which without naming anyone.
  const crowd = plan.match?.split ? "both crowds" : `people who like ${plainName(venue.entity.name)}`;
  let c: Omit<CopyFields, "partnerPitch">;

  switch (plan.format) {
    case "listening": {
      const between = others.length ? ` Between records we play more artists ${crowd} love, like ${listWords(others)}.` : "";
      const lean = themeText ? ` Expect ${themeText}.` : "";
      c = {
        eventTitle: fit([`${f} listening night at ${v}`, `${f} listening night`, `${fs} listening night at ${v}`, `${fs} listening night`, `Listening night at ${v}`], 60),
        eventDescription: `${when}, ${v} puts on the records of ${f} and plays them properly, with room to listen and room to talk.${between}${lean} ${rsvp}`,
        posterHeadline: fit([`${f} on the speakers`, `${f} night`, "Listening night"], 40),
        posterSub: "Records played properly, with room to listen and room to talk.",
        social: fit(
          [
            `${day}, ${plan.start}. ${f} on the speakers at ${v}, plus artists ${crowd} love. RSVP at the link.`,
            `${dayShort} ${plan.start}. ${f} listening night at ${v}. RSVP at the link.`,
          ],
          280,
        ),
      };
      break;
    }
    case "film": {
      const noun = nightName(plan);
      const lean = themeText ? ` If you like ${themeText}, this one is for you.` : "";
      c = {
        eventTitle: fit([`${f} ${noun} at ${v}`, `${f} ${noun}`, `${fs} ${noun} at ${v}`, `${fs} ${noun}`, `${capFirst(noun)} at ${v}`], 60),
        eventDescription: `${when}, ${v} hosts a ${noun} around ${f}. Pull up a chair, get a drink and settle in.${lean} ${rsvp}`,
        posterHeadline: fit([`${f}`, `${fs}`, capFirst(noun)], 40),
        posterSub: fit([`${capFirst(noun)}. Pull up a chair and settle in.`, `${capFirst(noun)}.`], 90),
        social: fit(
          [`${capFirst(noun)} at ${v} on ${day} at ${plan.start}. We are watching ${f}. RSVP at the link.`, `${capFirst(noun)}, ${dayShort} ${plan.start}. RSVP at the link.`],
          280,
        ),
      };
      break;
    }
    case "quiz": {
      const rounds = genreText ? ` and rounds on ${genreText}` : "";
      c = {
        eventTitle: fit([`${f} quiz night at ${v}`, `${f} quiz night`, `${fs} quiz night at ${v}`, `${fs} quiz night`, `Quiz night at ${v}`], 60),
        eventDescription: `${when}, ${v} runs a quiz night with a round on ${f}${rounds}. Teams of up to six. RSVP so we can print enough answer sheets.`,
        posterHeadline: fit([`${f} quiz night`, "Quiz night"], 40),
        posterSub: "Teams of up to six.",
        social: fit(
          [`Quiz night at ${v}, ${day} at ${plan.start}, with a round on ${f}. Teams of up to six. RSVP at the link.`, `Quiz night, ${dayShort} ${plan.start}. RSVP at the link.`],
          280,
        ),
      };
      break;
    }
    case "book": {
      c = {
        eventTitle: fit([`${f} book night at ${v}`, `${f} book night`, `${fs} book night at ${v}`, `${fs} book night`, `Book night at ${v}`], 60),
        eventDescription: `${when}, ${v} hosts a book night around ${f}. Come if you have read it, come if you mean to. RSVP so we can save you a seat.`,
        posterHeadline: fit([`${f}`, `${fs}`, "Book night"], 40),
        posterSub: "Come if you have read it, come if you mean to.",
        social: fit(
          [`Book night at ${v} on ${day} at ${plan.start}. We are talking about ${f}. RSVP at the link.`, `Book night, ${dayShort} ${plan.start}. RSVP at the link.`],
          280,
        ),
      };
      break;
    }
    case "games": {
      c = {
        eventTitle: fit([`${f} game night at ${v}`, `${f} game night`, `${fs} game night at ${v}`, `${fs} game night`, `Game night at ${v}`], 60),
        eventDescription: `${when}, ${v} hosts a game night around ${f}. Play, watch, or just hang out with people who like the same games.${themeText ? ` Expect ${themeText}.` : ""} ${rsvp}`,
        posterHeadline: fit([`${f} game night`, "Game night"], 40),
        posterSub: "Play, watch or just hang out.",
        social: fit([`Game night at ${v}, ${day} at ${plan.start}, around ${f}. RSVP at the link.`, `Game night, ${dayShort} ${plan.start}. RSVP at the link.`], 280),
      };
      break;
    }
    case "podcast": {
      c = {
        eventTitle: fit([`${f} listening night at ${v}`, `${f} listening night`, `${fs} listening night at ${v}`, `${fs} listening night`, `Podcast night at ${v}`], 60),
        eventDescription: `${when}, ${v} plays an episode of ${f} for the room, then we talk about it over a drink.${themeText ? ` Good for anyone into ${themeText}.` : ""} ${rsvp}`,
        posterHeadline: fit([`${f}, together`, "Podcast night"], 40),
        posterSub: "One episode for the room, then we talk about it over a drink.",
        social: fit([`Podcast night at ${v}, ${day} at ${plan.start}. We are playing ${f} for the room. RSVP at the link.`, `Podcast night, ${dayShort} ${plan.start}. RSVP at the link.`], 280),
      };
      break;
    }
    case "tasting": {
      const t = tastingLead(plan);
      const menu = plan.themeTags.slice(0, 3).map(menuItem);
      const menuLine = menu.length ? ` On the menu: ${listWords(menu)}.` : "";
      c = {
        eventTitle: fit([`${capFirst(t)} tasting night at ${v}`, `${capFirst(t)} tasting night`, `Tasting night at ${v}`], 60),
        eventDescription: `${when}, ${v} hosts ${withArticle(`${t} tasting night`)} built around the food and drink this street goes for.${menuLine} Entry and prices as usual. RSVP so we can plan portions.`,
        posterHeadline: fit([`${capFirst(t)} tasting night`, "Tasting night"], 40),
        posterSub: fit([`${capFirst(t)} and more of what this street eats and drinks.`, "Entry and prices as usual."], 90),
        social: fit([`${capFirst(t)} tasting night at ${v}, ${day} at ${plan.start}. RSVP at the link.`, `Tasting night, ${dayShort} ${plan.start}. RSVP at the link.`], 280),
      };
      break;
    }
    case "show":
    case "art": {
      const noun = nightName(plan);
      c = {
        eventTitle: fit([`${capFirst(noun)} at ${v}`, capFirst(noun)], 60),
        eventDescription: `${when}, ${v} puts on ${withArticle(noun)}. ${rsvp}`,
        posterHeadline: fit([capFirst(noun)], 40),
        posterSub: "Entry and prices as usual.",
        social: fit([`${capFirst(noun)} at ${v}, ${day} at ${plan.start}. RSVP at the link.`, `${capFirst(noun)}, ${dayShort} ${plan.start}. RSVP at the link.`], 280),
      };
      break;
    }
  }
  return { ...c, partnerPitch: pitch(plan, venue, day, nightName(plan)), writtenBy: "template" };
}
