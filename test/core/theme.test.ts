import { beforeAll, describe, expect, it } from "vitest";
import { createQloo, hasDash, planNights, planTheme, readStreet, templateCopy, themePhrase, themeWords } from "../../src/core/index.ts";
import type { NightPlan, QlooType, StreetRead, StreetTag } from "../../src/shared/contract.ts";
import { NOW, VENUE, fakeFetch, streetRoute } from "../fixtures/street.ts";

const KEYWORD = "urn:tag:keyword:media";
const MEDIA_GENRE = "urn:tag:genre:media";
const MUSIC_GENRE = "urn:tag:genre:music";

function phrase(name: string, namespace: string, type: QlooType = "tv_show", city = ""): string | null {
  return themePhrase({ name, namespace }, type, city)?.text ?? null;
}

function tag(name: string, namespace: string): StreetTag {
  return { id: `${namespace}:${name.toLowerCase().replace(/\W+/g, "_")}`, name, namespace, rank: 1 };
}

let read: StreetRead;
let film: NightPlan;

beforeAll(async () => {
  const f = fakeFetch([streetRoute]);
  read = await readStreet(createQloo({ apiKey: "k", fetch: f.fetch, now: () => NOW }), VENUE);
  film = planNights(read, VENUE, { preferFormats: ["film"] }, NOW, "owner", () => "p1").plan;
});

function themed(tags: StreetTag[], type: QlooType = "tv_show"): NightPlan {
  const feature = { ...film.feature!, name: "The Other Two", type, tags: tags.map((t) => t.id) };
  return { ...film, feature, themeTags: tags };
}

describe("theme phrases from live Qloo tags", () => {
  it("turns plot keywords into something a person would say", () => {
    expect(phrase("Female protagonist", KEYWORD)).toBe("stories with a female lead");
    expect(phrase("Mother daughter relationship", KEYWORD)).toBe("stories about mothers and daughters");
    expect(phrase("Brother brother relationship", KEYWORD)).toBe("stories about brothers");
    expect(phrase("Family relationships", KEYWORD)).toBe("stories about family");
    expect(phrase("Friendship", KEYWORD, "book")).toBe("books about friendship");
    expect(phrase("2010s", KEYWORD, "movie")).toBe("stories set in the 2010s");
    expect(phrase("New york city", KEYWORD, "tv_show", "New York")).toBe("stories set in New York City");
    expect(phrase("Satire comedy", KEYWORD)).toBe("satirical comedy");
    expect(phrase("Kdrama", KEYWORD)).toBe("Korean drama");
    expect(phrase("feel good romance", KEYWORD)).toBe("feel good romance");
  });

  it("leaves out keywords that do not read as a taste", () => {
    for (const name of ["21st century", "Actor playing himself", "Reference to twitter", "F rated", "hulu", "Title spoken by character", "Looking at oneself in a mirror", "Telephone call", "Friend", "Lesbian"]) {
      expect(phrase(name, KEYWORD), name).toBeNull();
    }
    expect(phrase("New york city", KEYWORD, "tv_show", "London")).toBeNull();
  });

  it("words genres by what the feature is and drops formats, ages and places", () => {
    expect(phrase("Cooking", MEDIA_GENRE, "book")).toBe("books about cooking");
    expect(phrase("Food & Drink", MEDIA_GENRE, "book")).toBe("books about food");
    expect(phrase("LGBT", MEDIA_GENRE, "movie")).toBe("LGBT stories");
    expect(phrase("Thriller", MEDIA_GENRE, "movie")).toBe("thrillers");
    expect(phrase("Biography & Memoir", MEDIA_GENRE, "book")).toBe("biography and memoir");
    expect(phrase("Historical", MEDIA_GENRE, "movie")).toBe("historical stories");
    expect(phrase("Comedy Interviews", MEDIA_GENRE, "podcast")).toBe("comedy interviews");
    expect(phrase("Role-Playing", "urn:tag:genre:qloo", "videogame")).toBe("role-playing games");
    for (const name of ["Audiobook", "+young Adult", "Juvenile", "Adult", "United States", "Women's", "Contemporary", "Podcasts", "Society & Culture", "African American"]) {
      expect(phrase(name, MEDIA_GENRE, "book"), name).toBeNull();
    }
  });

  it("cleans music genres the way Qloo spells them", () => {
    expect(phrase(" indie rock", MUSIC_GENRE, "artist")).toBe("indie rock");
    expect(phrase("Alt- country", MUSIC_GENRE, "artist")).toBe("alt country");
    expect(phrase("Lo-Fi", MUSIC_GENRE, "artist")).toBe("lo-fi");
    expect(phrase("UK Garage", MUSIC_GENRE, "artist")).toBe("UK garage");
    expect(phrase("french pop", MUSIC_GENRE, "artist")).toBe("French pop");
    expect(phrase("experimental", MUSIC_GENRE, "artist")).toBe("experimental music");
    for (const name of ["Usa", "funny", "Belarusian", "new york", "german"]) expect(phrase(name, MUSIC_GENRE, "artist"), name).toBeNull();
  });

  it("reads audience tags only when they name a taste, and nothing from other namespaces", () => {
    expect(phrase("Drama loving", "urn:tag:audience:qloo")).toBe("drama");
    expect(phrase("Socially conscious", "urn:tag:audience:qloo")).toBeNull();
    expect(phrase("Intimate", "urn:tag:style:qloo")).toBeNull();
    expect(phrase("Cozy", "urn:tag:ambience:qloo")).toBeNull();
  });

  it("never returns a dash or a raw tag id", () => {
    const names = ["Female protagonist", "Alt- country", "Stand-up-Comedy", "Reality-TV", "Lo-Fi", "Self-Discovery", "Neo-Soul"];
    for (const name of names) {
      for (const ns of [KEYWORD, MEDIA_GENRE, MUSIC_GENRE]) {
        const text = phrase(name, ns, "artist") ?? "";
        expect(hasDash(text), text).toBe(false);
        expect(text).not.toContain("urn:");
      }
    }
  });
});

describe("theme line in the template copy", () => {
  it("phrases the theme instead of pasting the tag", () => {
    const plan = themed([tag("Female protagonist", KEYWORD), tag("Comedy", MEDIA_GENRE)]);
    const copy = templateCopy(plan, VENUE);
    expect(copy.eventDescription).toContain("If you like stories with a female lead and comedy, this one is for you.");
    expect(copy.eventDescription).not.toMatch(/female protagonist/i);
  });

  it("keeps the more specific of two overlapping genres and at most two phrases", () => {
    const plan = themed([tag("Comedy", MEDIA_GENRE), tag("Dark comedy", KEYWORD), tag("Friendship", KEYWORD), tag("LGBT", MEDIA_GENRE)]);
    expect(planTheme(plan).map((p) => p.text)).toEqual(["dark comedy", "stories about friendship"]);
  });

  it("lets two subjects share one noun", () => {
    const local = themed([tag("Female protagonist", KEYWORD), tag("New york city", KEYWORD)]);
    expect(templateCopy(local, { ...VENUE, city: "New York" }).eventDescription).toContain(
      "If you like stories set in New York City with a female lead, this one is for you.",
    );
    expect(themeWords(planTheme(themed([tag("Friendship", KEYWORD), tag("Family relationships", KEYWORD)])))).toEqual(["stories about friendship and family"]);
  });

  it("leaves the line out when no tag reads as a phrase", () => {
    const plan = themed([tag("21st century", KEYWORD), tag("Audiobook", MEDIA_GENRE), tag("Reference to twitter", KEYWORD)]);
    const copy = templateCopy(plan, VENUE);
    expect(copy.eventDescription).not.toContain("If you like");
    expect(copy.eventDescription).not.toMatch(/21st century|audiobook|twitter/i);
  });

  it("gives quiz rounds only to genres", () => {
    const quiz = { ...themed([tag("Female protagonist", KEYWORD), tag("Comedy", MEDIA_GENRE)]), format: "quiz" as const };
    expect(templateCopy(quiz, VENUE).eventDescription).toContain("a round on The Other Two and rounds on comedy.");
  });
});
