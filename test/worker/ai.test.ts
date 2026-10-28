import { beforeAll, describe, expect, it, vi } from "vitest";
import { COPY_SCHEMA, createQloo, planNights, readStreet, writeCopy } from "../../src/core/index.ts";
import type { NightPlan, StreetRead } from "../../src/shared/contract.ts";
import { makeGenerate, responseText } from "../../src/worker/ai.ts";
import type { AiLike } from "../../src/worker/env.ts";
import { NOW, VENUE, fakeFetch, streetRoute } from "../fixtures/street.ts";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const copy = {
  eventTitle: "Alice Coltrane listening night",
  eventDescription: "On Thursday 29 October from 19:00 to 22:00 we play Alice Coltrane records at Cafe Lumen, side by side, with Sade between. Free entry.",
  posterHeadline: "Alice Coltrane",
  posterSub: "Records played properly, with room to talk.",
  social: "Alice Coltrane on the speakers at Cafe Lumen on Thursday. Free, RSVP at the link.",
  partnerPitch: {
    subject: "Listening night at Cafe Lumen on Thursday 29 October",
    body: "Hi there,\n\nWe run Cafe Lumen, a short walk from you. On Thursday we play Alice Coltrane records.\n\nQloo's aggregate taste data puts your place among the spots nearby that people who like Cafe Lumen also like. Would you cross promote it with us?\n\nThanks,\nCafe Lumen",
  },
};

function binding(reply: (inputs: Record<string, unknown>) => unknown): AiLike & { inputs: Record<string, unknown>[] } {
  const inputs: Record<string, unknown>[] = [];
  return {
    inputs,
    async run(_model, i) {
      inputs.push(i);
      return reply(i);
    },
  };
}

let read: StreetRead;
let plan: NightPlan;

beforeAll(async () => {
  const f = fakeFetch([streetRoute]);
  read = await readStreet(createQloo({ apiKey: "k", fetch: f.fetch, now: () => NOW }), VENUE);
  plan = planNights(read, VENUE, {}, NOW, "owner", () => "p1").plan;
});

describe("Workers AI reply shapes", () => {
  it("reads text, JSON mode objects, the REST wrapper and a reply filed as a tool call", () => {
    expect(responseText({ response: "hi", usage: { completion_tokens: 2 } })).toBe("hi");
    expect(responseText({ response: { a: 1 }, tool_calls: [] })).toBe('{"a":1}');
    expect(responseText({ result: { response: "wrapped" }, success: true })).toBe("wrapped");
    expect(responseText({ response: "", tool_calls: [{ name: "x", arguments: { eventTitle: "t" } }] })).toBe('{"eventTitle":"t"}');
    expect(responseText({ response: null, tool_calls: [{ name: "x", arguments: '{"a":2}' }] })).toBe('{"a":2}');
    expect(responseText("plain")).toBe("plain");
    expect(responseText({ response: "" })).toBe("");
    expect(responseText(null)).toBeNull();
  });
});

describe("makeGenerate", () => {
  it("asks for JSON mode with the schema and the token cap when given one", async () => {
    const ai = binding(() => ({ response: { ok: true } }));
    const generate = makeGenerate(ai, MODEL)!;
    expect(await generate("sys", "usr", { schema: COPY_SCHEMA, maxTokens: 1400 })).toBe('{"ok":true}');
    expect(ai.inputs[0]).toMatchObject({ max_tokens: 1400, response_format: { type: "json_schema", json_schema: COPY_SCHEMA } });
    await generate("sys", "usr");
    expect(ai.inputs[1]).not.toHaveProperty("response_format");
  });

  it("asks again without JSON mode when the platform cannot meet the schema", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ai = binding((i) => {
      if (i["response_format"]) throw new Error("5028: JSON Mode couldn't be met");
      return { response: "plain reply" };
    });
    expect(await makeGenerate(ai, MODEL)!("sys", "usr", { schema: COPY_SCHEMA })).toBe("plain reply");
    expect(ai.inputs).toHaveLength(2);
    warn.mockRestore();
  });

  it("does not ask twice when the first call ran out of time", async () => {
    const ai = binding(() => new Promise(() => undefined));
    await expect(makeGenerate(ai, MODEL, 30)!("sys", "usr", { schema: COPY_SCHEMA })).rejects.toThrow(/longer than/);
    expect(ai.inputs).toHaveLength(1);
  });

  it("logs a reply that used every token it was allowed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ai = binding(() => ({ response: '{"eventTitle": "cut', usage: { completion_tokens: 50 } }));
    await makeGenerate(ai, MODEL)!("sys", "usr", { maxTokens: 50 });
    expect(warn).toHaveBeenCalledWith("model reply reached the token cap", expect.stringContaining('"used":50'));
    warn.mockRestore();
  });
});

describe("model copy through the adapter", () => {
  it("uses the copy when JSON mode returns the object itself", async () => {
    const ai = binding(() => ({ response: copy, usage: { prompt_tokens: 1800, completion_tokens: 420, total_tokens: 2220 } }));
    const out = await writeCopy(plan, VENUE, read, makeGenerate(ai, MODEL));
    expect(out.copy).toEqual({ ...copy, writtenBy: "model" });
    expect(out.limits.some((l) => l.includes("copy comes from templates"))).toBe(false);
  });

  it("uses the copy when the model answers in a fenced block with raw line breaks", async () => {
    const fenced = "Here is the copy.\n```json\n" + JSON.stringify(copy, null, 2).replace(/\\n/g, "\n") + "\n```";
    const ai = binding((i) => (i["response_format"] ? Promise.reject(new Error("JSON mode is not available")) : { response: fenced }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const out = await writeCopy(plan, VENUE, read, makeGenerate(ai, MODEL));
    warn.mockRestore();
    expect(out.copy.writtenBy).toBe("model");
    expect(out.copy.partnerPitch.body).toBe(copy.partnerPitch.body);
  });

  it("keeps the templates and says why when the reply is cut off", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ai = binding(() => ({ response: JSON.stringify(copy).slice(0, 200), usage: { completion_tokens: 1400 } }));
    const out = await writeCopy(plan, VENUE, read, makeGenerate(ai, MODEL));
    warn.mockRestore();
    expect(out.copy.writtenBy).toBe("template");
    expect(out.limits.at(-1)).toBe("The model's reply was not usable, so the copy comes from templates.");
  });
});
