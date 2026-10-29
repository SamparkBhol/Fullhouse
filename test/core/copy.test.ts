import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  BANNED_WORDS,
  COPY_SCHEMA,
  COPY_SYSTEM_PROMPT,
  bannedIn,
  buildBrief,
  copyUserPrompt,
  createQloo,
  extractJson,
  fixDashes,
  hasDash,
  jsonObjectIn,
  parseCopy,
  planNights,
  readStreet,
  repairJson,
  templateCopy,
  writeCopy,
} from "../../src/core/index.ts";
import type { NightPlan, StreetRead } from "../../src/shared/contract.ts";
import { NOW, VENUE, fakeFetch, streetRoute } from "../fixtures/street.ts";

const SPACED_HYPHEN = " " + "-" + " ";

let read: StreetRead;
let plan: NightPlan;

const good = {
  eventTitle: "Alice Coltrane listening night",
  eventDescription: "On Thursday 29 October from 19:00 to 22:00 we play Alice Coltrane records at Cafe Lumen, with Sade between sides. Free entry.",
  posterHeadline: "Alice Coltrane night",
  posterSub: "Thursday 29 October, 19:00 at Cafe Lumen",
  social: "Alice Coltrane on the speakers at Cafe Lumen this Thursday. Free, RSVP at the link.",
  partnerPitch: { subject: "A listening night at Cafe Lumen", body: "Hi there, we are hosting a listening night on Thursday. Qloo's aggregate taste data puts your place among the spots nearby that people who like Cafe Lumen also like. Would you cross promote it? Thanks, Cafe Lumen" },
};

beforeAll(async () => {
  const f = fakeFetch([streetRoute]);
  read = await readStreet(createQloo({ apiKey: "k", fetch: f.fetch, now: () => NOW }), VENUE);
  plan = planNights(read, VENUE, {}, NOW, "owner", () => "p1").plan;
});

describe("extractJson", () => {
  it("finds the object inside fences and prose", () => {
    expect(extractJson('Sure! ```json\n{"a": 1, "b": "x}"}\n``` hope that helps')).toEqual({ a: 1, b: "x}" });
    expect(extractJson('Here: {"a": {"b": [1, 2]}} and {"c": 3}')).toEqual({ a: { b: [1, 2] } });
    expect(extractJson("{ broken { \"a\": 2 }")).toEqual({ a: 2 });
    expect(extractJson("no json here")).toBeNull();
  });

  it("repairs raw line breaks and trailing commas that Llama leaves in its JSON", () => {
    const raw = 'Here is the copy:\n{"body": "Hi there,\n\nWe run Cafe Lumen.\tThanks",\n "tags": ["a", "b",],}';
    expect(extractJson(raw)).toEqual({ body: "Hi there,\n\nWe run Cafe Lumen.\tThanks", tags: ["a", "b"] });
    expect(repairJson('{"a": "x,}"}')).toBe('{"a": "x,}"}');
  });

  it("reads an object sent as a JSON string and says why nothing came out", () => {
    expect(extractJson(JSON.stringify(JSON.stringify({ a: 1 })))).toEqual({ a: 1 });
    expect(jsonObjectIn("I cannot help with that")).toEqual({ failure: "no_object" });
    expect(jsonObjectIn('{"eventTitle": "Alice Coltrane night", "eventDescription": "On Thursday we pl')).toEqual({ failure: "cut_off" });
    expect(jsonObjectIn('{"eventTitle": "The "Other" Two"}')).toEqual({ failure: "unparsed" });
  });

  it("closes a reply cut off after its last value, and says so when only a nested object survives", () => {
    const whole = JSON.stringify(good);
    expect(jsonObjectIn(whole.slice(0, -1))).toEqual({ value: good });
    expect(jsonObjectIn(`Here it is:\n${JSON.stringify(good, null, 2).slice(0, -2)}`)).toEqual({ value: good });
    const cutInPitch = whole.slice(0, whole.indexOf('"body"')) + '"body": "Hi, we are hosting a list';
    expect(jsonObjectIn(cutInPitch)).toEqual({ failure: "cut_off" });
    const pitchFirst = `{"partnerPitch": ${JSON.stringify(good.partnerPitch)}, "eventTitle": "Alice Coltrane list`;
    expect(jsonObjectIn(pitchFirst)).toEqual({ value: good.partnerPitch, inside: true });
    expect(parseCopy(pitchFirst)).toEqual({ problem: "stopped before its JSON object was complete" });
  });
});

describe("writeCopy", () => {
  it("returns the plan as is without a model", async () => {
    expect(await writeCopy(plan, VENUE, read, null)).toBe(plan);
  });

  it("uses model copy when every name is in the brief", async () => {
    const generate = vi.fn(async () => "```json\n" + JSON.stringify(good) + "\n```");
    const out = await writeCopy(plan, VENUE, read, generate);
    const headline = plan.feature && plan.feature.name.length <= 40 ? plan.feature.name : good.posterHeadline;
    expect(out.copy).toEqual({ ...good, posterHeadline: headline, writtenBy: "model" });
    expect(out.checks).toEqual({ claimsVerified: true, unverified: [] });
    const [system, user, options] = generate.mock.calls[0] as unknown as [string, string, { schema?: unknown; maxTokens?: number }];
    expect(system).toBe(COPY_SYSTEM_PROMPT);
    expect(user).toBe(copyUserPrompt(buildBrief(plan, VENUE, read), plan.copy));
    expect(user).toContain(plan.copy.eventDescription.slice(0, 40));
    expect(user).toContain('"name":"Alice Coltrane"');
    expect(user).not.toContain("urn:");
    expect(options.schema).toBe(COPY_SCHEMA);
    expect(options.maxTokens).toBeGreaterThanOrEqual(1200);
  });

  it("keeps the template copy when the model names something outside the brief", async () => {
    const bad = { ...good, eventDescription: `${good.eventDescription} Special guest Kamasi Washington.` };
    const out = await writeCopy(plan, VENUE, read, async () => JSON.stringify(bad));
    expect(out.copy).toEqual(plan.copy);
    expect(out.copy.writtenBy).toBe("template");
    expect(out.checks).toEqual({ claimsVerified: true, unverified: ["Kamasi Washington"] });
    expect(out.limits.at(-1)).toBe("The model copy named Kamasi Washington, which is not in the Qloo brief, so the copy comes from templates.");
  });

  it("keeps the template copy when the model names a partner, who has not said yes to anything", async () => {
    const partner = plan.partners[0]!.name;
    const named = { ...good, eventDescription: `${good.eventDescription} With our friends at ${partner}.` };
    const out = await writeCopy(plan, VENUE, read, async () => JSON.stringify(named));
    expect(out.copy.writtenBy).toBe("template");
    expect(out.checks.unverified.some((n) => partner.includes(n))).toBe(true);
    expect(buildBrief(plan, VENUE, read).partners).toEqual([]);
  });

  it("keeps the template copy on failure, bad JSON, missing fields or banned words", async () => {
    const fails = await writeCopy(plan, VENUE, read, async () => {
      throw new Error("down");
    });
    expect(fails.copy).toEqual(plan.copy);
    expect(fails.limits.at(-1)).toBe("The model did not answer, so the copy comes from templates.");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const plain = "The model's reply was not usable, so the copy comes from templates.";
    expect((await writeCopy(plan, VENUE, read, async () => "I cannot help")).limits.at(-1)).toBe(plain);
    expect(warn).toHaveBeenCalledWith("model copy refused", expect.stringContaining("had no JSON object in it"));
    expect(warn).toHaveBeenCalledWith("model copy refused", expect.stringContaining("I cannot help"));
    const cut = await writeCopy(plan, VENUE, read, async () => JSON.stringify(good).slice(0, 120));
    expect(cut.limits.at(-1)).toBe(plain);
    expect(warn).toHaveBeenLastCalledWith("model copy refused", expect.stringContaining("stopped before its JSON object was complete"));
    const missing = await writeCopy(plan, VENUE, read, async () => JSON.stringify({ ...good, social: 4 }));
    expect(missing.limits.at(-1)).toBe(plain);
    expect(missing.limits.join(" ")).not.toMatch(/JSON|social|posterSub/);
    expect(warn).toHaveBeenLastCalledWith("model copy refused", expect.stringContaining("social"));
    warn.mockRestore();
    const long = await writeCopy(plan, VENUE, read, async () => JSON.stringify({ ...good, social: "x ".repeat(200) }));
    expect(long.copy.writtenBy).toBe("template");
    const banned = await writeCopy(plan, VENUE, read, async () => JSON.stringify({ ...good, social: `A night to ${BANNED_WORDS[1]} your Thursday.` }));
    expect(banned.copy.writtenBy).toBe("template");
  });

  it("takes copy the model wrapped in prose, nested one level down or with raw line breaks", async () => {
    const pitchBody = "Hi there,\n\nWe run Cafe Lumen and we play Alice Coltrane on Thursday.\n\nThanks,\nCafe Lumen";
    const json = JSON.stringify({ copy: { ...good, partnerPitch: { subject: "Alice Coltrane at Cafe Lumen", body: pitchBody } } }).replace(/\\n/g, "\n");
    const out = await writeCopy(plan, VENUE, read, async () => `Sure, here it is.\n${json}\nEnjoy the night.`);
    expect(out.copy.writtenBy).toBe("model");
    expect(out.copy.partnerPitch.body).toBe(pitchBody);
  });

  it("repairs dashes in model copy instead of rejecting it", async () => {
    const dashed = { ...good, posterSub: "Thursday 29 October \u2014 19:00 at Cafe Lumen", social: `Doors 19:00\u201322:00 at Cafe Lumen${SPACED_HYPHEN}free` };
    const out = await writeCopy(plan, VENUE, read, async () => JSON.stringify(dashed));
    expect(out.copy.writtenBy).toBe("model");
    expect(out.copy.posterSub).toBe("Thursday 29 October, 19:00 at Cafe Lumen");
    expect(out.copy.social).toBe("Doors 19:00 to 22:00 at Cafe Lumen, free");
  });
});

describe("partner pitch template", () => {
  it("reads like a short note from one neighbour to another", () => {
    const { subject, body } = templateCopy(plan, VENUE).partnerPitch;
    const paragraphs = body.split("\n\n");
    expect(paragraphs[0]).toBe("Hi there,");
    expect(paragraphs[1]).toMatch(/^We run Cafe Lumen, a short walk from you\. On Thursday 29 October from 19:00 to 22:00 we are putting on a listening night around Alice Coltrane\.$/);
    expect(paragraphs[2]).toBe(
      "Qloo's aggregate taste data puts your place among the spots nearby that people who like Cafe Lumen also like, which is why we are writing to you.",
    );
    expect(paragraphs[3]).toMatch(/^Would you cross promote it with us\?/);
    expect(paragraphs.at(-1)).toBe("Thanks,\nCafe Lumen");
    expect(body.split(/\s+/).length).toBeLessThan(120);
    expect(body).not.toMatch(/^Hi,$/m);
    expect(bannedIn(body)).toEqual([]);
    expect(hasDash(body)).toBe(false);
    expect(subject).toBe("Listening night at Cafe Lumen on Thursday 29 October");
  });

  it("names a tasting night with the right article", () => {
    const tasting = planNights(read, VENUE, { preferFormats: ["tasting"] }, NOW, "owner", () => "t1").plan;
    const italian = { ...tasting, themeTags: [{ id: "urn:tag:cuisine:qloo:italian", name: "Italian", namespace: "urn:tag:cuisine:qloo", rank: 1 }] };
    const copy = templateCopy(italian, VENUE);
    expect(copy.partnerPitch.body).toContain("we are putting on an Italian tasting night.");
    expect(copy.eventDescription).toContain("Cafe Lumen hosts an Italian tasting night built around");
  });
});

describe("text rules", () => {
  it("fixes and detects dashes", () => {
    expect(fixDashes(`a \u2014 b \u2013 c${SPACED_HYPHEN}d 10\u201312`)).toBe("a, b, c, d 10 to 12");
    expect(hasDash("Wi-Fi and 2026-10-25")).toBe(false);
    expect(hasDash("a \u2014 b")).toBe(true);
  });

  it("finds banned words", () => {
    expect(bannedIn(`We ${BANNED_WORDS[3]} the street`)).toEqual([BANNED_WORDS[3]]);
    expect(bannedIn(`a ${BANNED_WORDS[9]}`)).toEqual([BANNED_WORDS[9]]);
    expect(bannedIn("a quiet night")).toEqual([]);
  });
});
