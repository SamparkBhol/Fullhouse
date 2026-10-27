import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  BANNED_WORDS,
  COPY_SYSTEM_PROMPT,
  bannedIn,
  buildBrief,
  copyUserPrompt,
  createQloo,
  extractJson,
  fixDashes,
  hasDash,
  planNights,
  readStreet,
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
  partnerPitch: { subject: "A listening night at Cafe Lumen", body: "Hi, we are hosting a listening night on Thursday. Blue Hour Wine Bar came up in Qloo's aggregate taste data for our street. Would you cross promote it? Thanks, Cafe Lumen" },
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
});

describe("writeCopy", () => {
  it("returns the plan as is without a model", async () => {
    expect(await writeCopy(plan, VENUE, read, null)).toBe(plan);
  });

  it("uses model copy when every name is in the brief", async () => {
    const generate = vi.fn(async () => "```json\n" + JSON.stringify(good) + "\n```");
    const out = await writeCopy(plan, VENUE, read, generate);
    expect(out.copy).toEqual({ ...good, writtenBy: "model" });
    expect(out.checks).toEqual({ claimsVerified: true, unverified: [] });
    const [system, user] = generate.mock.calls[0] as unknown as [string, string];
    expect(system).toBe(COPY_SYSTEM_PROMPT);
    expect(user).toBe(copyUserPrompt(buildBrief(plan, VENUE, read)));
    expect(user).toContain('"name": "Alice Coltrane"');
    expect(user).not.toContain("urn:");
  });

  it("keeps the template copy when the model names something outside the brief", async () => {
    const bad = { ...good, eventDescription: `${good.eventDescription} Special guest Kamasi Washington.` };
    const out = await writeCopy(plan, VENUE, read, async () => JSON.stringify(bad));
    expect(out.copy).toEqual(plan.copy);
    expect(out.copy.writtenBy).toBe("template");
    expect(out.checks).toEqual({ claimsVerified: true, unverified: ["Kamasi Washington"] });
    expect(out.limits.at(-1)).toBe("The model copy named Kamasi Washington, which is not in the Qloo brief, so the copy comes from templates.");
  });

  it("keeps the template copy on failure, bad JSON, missing fields or banned words", async () => {
    const fails = await writeCopy(plan, VENUE, read, async () => {
      throw new Error("down");
    });
    expect(fails.copy).toEqual(plan.copy);
    expect(fails.limits.at(-1)).toBe("The model did not answer, so the copy comes from templates.");

    expect((await writeCopy(plan, VENUE, read, async () => "I cannot help")).limits.at(-1)).toBe("The model reply was not a JSON object, so the copy comes from templates.");
    const missing = await writeCopy(plan, VENUE, read, async () => JSON.stringify({ ...good, social: 4 }));
    expect(missing.limits.at(-1)).toContain("social");
    const long = await writeCopy(plan, VENUE, read, async () => JSON.stringify({ ...good, social: "x ".repeat(200) }));
    expect(long.copy.writtenBy).toBe("template");
    const banned = await writeCopy(plan, VENUE, read, async () => JSON.stringify({ ...good, social: `A night to ${BANNED_WORDS[1]} your Thursday.` }));
    expect(banned.copy.writtenBy).toBe("template");
  });

  it("repairs dashes in model copy instead of rejecting it", async () => {
    const dashed = { ...good, posterSub: "Thursday 29 October \u2014 19:00 at Cafe Lumen", social: `Doors 19:00\u201322:00 at Cafe Lumen${SPACED_HYPHEN}free` };
    const out = await writeCopy(plan, VENUE, read, async () => JSON.stringify(dashed));
    expect(out.copy.writtenBy).toBe("model");
    expect(out.copy.posterSub).toBe("Thursday 29 October, 19:00 at Cafe Lumen");
    expect(out.copy.social).toBe("Doors 19:00 to 22:00 at Cafe Lumen, free");
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
