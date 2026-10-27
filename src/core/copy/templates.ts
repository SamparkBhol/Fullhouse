import type { NightCopy, NightPlan, Venue } from "../../shared/contract.ts";
import { tagLabel } from "../qloo/parse.ts";
import { FORMATS, MENU_NAMESPACES, menuItem } from "../planner/formats.ts";
import { describeDate } from "../planner/time.ts";
import { capFirst, fit, listWords } from "./text.ts";

type CopyFields = Omit<NightCopy, "writtenBy">;

function themeWords(plan: NightPlan): string[] {
  const carried = new Set(plan.feature?.tags ?? []);
  const own = FORMATS[plan.format].themeNamespaces;
  return plan.themeTags
    .filter((t) => carried.has(t.id) || (plan.format === "listening" && own.includes(t.namespace)) || plan.format === "tasting")
    .slice(0, 2)
    .map((t) => tagLabel(t.id).toLowerCase());
}

function pitch(plan: NightPlan, venue: Venue, day: string): CopyFields["partnerPitch"] {
  const v = venue.entity.name;
  const label = FORMATS[plan.format].label;
  const what = plan.feature ? `${label} around ${plan.feature.name}` : label;
  return {
    subject: fit([`A ${label} at ${v} on ${day}`, `A ${label} on ${day}`], 100),
    body: [
      "Hi,",
      "",
      `We run ${v}, a short walk from you, and we are hosting a ${what} on ${day} from ${plan.start} to ${plan.end}.`,
      `Your place came up among the spots people around our street rate highly in Qloo's aggregate taste data, so we thought of you first.`,
      "Would you like to cross promote the night? We would be glad to put your name on our event page and poster and to return the favour for something of yours.",
      "",
      "Thanks,",
      v,
    ].join("\n"),
  };
}

export function templateCopy(plan: NightPlan, venue: Venue): NightCopy {
  const v = venue.entity.name;
  const day = describeDate(plan.date);
  const dayShort = day.split(" ")[0] ?? day;
  const f = plan.feature?.name ?? "";
  const theme = themeWords(plan);
  const themeText = theme.length ? listWords(theme) : "";
  const others = plan.playlist.filter((a) => a.name !== f).slice(0, 4).map((a) => a.name);
  const when = `On ${day} from ${plan.start} to ${plan.end}`;
  const rsvp = "Free to come in. RSVP so we know how many chairs to put out.";
  let c: CopyFields;

  switch (plan.format) {
    case "listening": {
      const between = others.length ? ` Between records we play more artists people around here love, like ${listWords(others)}.` : "";
      const lean = themeText ? ` Expect ${themeText}.` : "";
      c = {
        eventTitle: fit([`${f} listening night at ${v}`, `${f} listening night`, `Listening night at ${v}`], 60),
        eventDescription: `${when}, ${v} puts on the records of ${f} and plays them properly, with room to listen and room to talk.${between}${lean} ${rsvp}`,
        posterHeadline: fit([`${f} on the speakers`, `${f} night`, "Listening night"], 40),
        posterSub: fit([`${day}, ${plan.start} at ${v}. Free entry.`, `${dayShort} ${plan.start}. Free entry.`], 90),
        social: fit(
          [
            `${day}, ${plan.start}. ${f} on the speakers at ${v}, plus artists people around here love. Free, RSVP at the link.`,
            `${dayShort} ${plan.start}. ${f} listening night at ${v}. Free, RSVP at the link.`,
          ],
          280,
        ),
        partnerPitch: pitch(plan, venue, day),
      };
      break;
    }
    case "film": {
      const isShow = plan.feature?.type === "tv_show";
      const noun = isShow ? "watch night" : "film night";
      const lean = themeText ? ` If you like ${themeText}, this one is for you.` : "";
      c = {
        eventTitle: fit([`${f} ${noun} at ${v}`, `${f} ${noun}`, `${capFirst(noun)} at ${v}`], 60),
        eventDescription: `${when}, ${v} hosts a ${noun} around ${f}. Pull up a chair, get a drink and settle in.${lean} ${rsvp}`,
        posterHeadline: fit([`${f}`, capFirst(noun)], 40),
        posterSub: fit([`${capFirst(noun)}, ${day}, ${plan.start} at ${v}`, `${dayShort} ${plan.start} at ${v}`], 90),
        social: fit(
          [`${capFirst(noun)} at ${v} on ${day} at ${plan.start}. We are watching ${f}. Free, RSVP at the link.`, `${capFirst(noun)}, ${dayShort} ${plan.start}. Free, RSVP at the link.`],
          280,
        ),
        partnerPitch: pitch(plan, venue, day),
      };
      break;
    }
    case "quiz": {
      const rounds = themeText ? ` and rounds on ${themeText}` : "";
      c = {
        eventTitle: fit([`${f} quiz night at ${v}`, `${f} quiz night`, `Quiz night at ${v}`], 60),
        eventDescription: `${when}, ${v} runs a quiz night with a round on ${f}${rounds}. Teams of up to six, free to enter. RSVP so we can print enough answer sheets.`,
        posterHeadline: fit([`${f} quiz night`, "Quiz night"], 40),
        posterSub: fit([`${day}, ${plan.start} at ${v}. Teams of up to six.`, `${dayShort} ${plan.start}. Teams of up to six.`], 90),
        social: fit(
          [`Quiz night at ${v}, ${day} at ${plan.start}, with a round on ${f}. Teams of up to six, free to enter. RSVP at the link.`, `Quiz night, ${dayShort} ${plan.start}. RSVP at the link.`],
          280,
        ),
        partnerPitch: pitch(plan, venue, day),
      };
      break;
    }
    case "book": {
      const lean = themeText ? ` Fans of ${themeText} especially welcome.` : "";
      c = {
        eventTitle: fit([`${f} book night at ${v}`, `${f} book night`, `Book night at ${v}`], 60),
        eventDescription: `${when}, ${v} hosts a book night around ${f}. Come if you have read it, come if you mean to.${lean} Free, RSVP so we can save you a seat.`,
        posterHeadline: fit([`${f}`, "Book night"], 40),
        posterSub: fit([`Book night, ${day}, ${plan.start} at ${v}`, `Book night, ${dayShort} ${plan.start}`], 90),
        social: fit(
          [`Book night at ${v} on ${day} at ${plan.start}. We are talking about ${f}. Free, RSVP at the link.`, `Book night, ${dayShort} ${plan.start}. RSVP at the link.`],
          280,
        ),
        partnerPitch: pitch(plan, venue, day),
      };
      break;
    }
    case "games": {
      c = {
        eventTitle: fit([`${f} game night at ${v}`, `${f} game night`, `Game night at ${v}`], 60),
        eventDescription: `${when}, ${v} hosts a game night around ${f}. Play, watch, or just hang out with people who like the same games.${themeText ? ` Expect ${themeText}.` : ""} ${rsvp}`,
        posterHeadline: fit([`${f} game night`, "Game night"], 40),
        posterSub: fit([`${day}, ${plan.start} at ${v}`, `${dayShort} ${plan.start}`], 90),
        social: fit([`Game night at ${v}, ${day} at ${plan.start}, around ${f}. Free, RSVP at the link.`, `Game night, ${dayShort} ${plan.start}. RSVP at the link.`], 280),
        partnerPitch: pitch(plan, venue, day),
      };
      break;
    }
    case "podcast": {
      c = {
        eventTitle: fit([`${f} listening night at ${v}`, `${f} listening night`, `Podcast night at ${v}`], 60),
        eventDescription: `${when}, ${v} plays an episode of ${f} for the room, then we talk about it over a drink.${themeText ? ` Good for anyone into ${themeText}.` : ""} ${rsvp}`,
        posterHeadline: fit([`${f}, together`, "Podcast night"], 40),
        posterSub: fit([`Podcast listening night, ${day}, ${plan.start} at ${v}`, `${dayShort} ${plan.start} at ${v}`], 90),
        social: fit([`Podcast night at ${v}, ${day} at ${plan.start}. We are playing ${f} for the room. Free, RSVP at the link.`, `Podcast night, ${dayShort} ${plan.start}. RSVP at the link.`], 280),
        partnerPitch: pitch(plan, venue, day),
      };
      break;
    }
    case "tasting": {
      const menuTags = plan.themeTags.filter((x) => MENU_NAMESPACES.includes(x.namespace));
      const t = menuTags[0] ? menuItem(menuTags[0]).replace(/ food$/, "") : "street favourites";
      const menu = menuTags.slice(0, 3).map(menuItem);
      const menuLine = menu.length ? ` On the menu: ${listWords(menu)}.` : "";
      c = {
        eventTitle: fit([`${capFirst(t)} tasting night at ${v}`, `${capFirst(t)} tasting night`, `Tasting night at ${v}`], 60),
        eventDescription: `${when}, ${v} hosts a ${t} tasting night built around what people on this street rate highest.${menuLine} Free to come in. RSVP so we can plan portions.`,
        posterHeadline: fit([`${capFirst(t)} tasting night`, "Tasting night"], 40),
        posterSub: fit([`${day}, ${plan.start} at ${v}`, `${dayShort} ${plan.start}`], 90),
        social: fit([`${capFirst(t)} tasting night at ${v}, ${day} at ${plan.start}. Free to come in, RSVP at the link.`, `Tasting night, ${dayShort} ${plan.start}. RSVP at the link.`], 280),
        partnerPitch: pitch(plan, venue, day),
      };
      break;
    }
  }
  return { ...c, writtenBy: "template" };
}
