import { describe, expect, it } from "vitest";
import { applyRefine, parseRefineFallback, REFINE_TOOL } from "../../src/core/index.ts";
import { extractJson } from "../../src/core/index.ts";
import { makeGenerate, refineInput, responseText, toolArguments } from "../../src/worker/ai.ts";
import type { AiLike } from "../../src/worker/env.ts";

const CORE = { REFINE_TOOL, parseRefineFallback, applyRefine };
const BASE = { weekday: 4 as const, start: "19:00", durationMin: 180 };

function ai(reply: (inputs: Record<string, unknown>) => unknown): AiLike & { inputs: Record<string, unknown>[] } {
  const inputs: Record<string, unknown>[] = [];
  return {
    inputs,
    async run(_model, i) {
      inputs.push(i);
      return reply(i);
    },
  };
}

describe("refine pipeline", () => {
  it("uses the tool call when the model makes one", async () => {
    const model = ai(() => ({ tool_calls: [{ name: REFINE_TOOL.name, arguments: { weekday: 5, maxPeople: 40, noLiveMusic: true } }] }));
    const out = await refineInput({ ai: model, model: "m", generate: null, core: CORE }, BASE, "make it Friday, no live music, under 40 people");
    expect(out.method).toBe("tool");
    expect(out.input).toMatchObject({ weekday: 5, maxPeople: 40, noLiveMusic: true, start: "19:00" });
    const tools = model.inputs[0]?.["tools"] as Array<{ name: string }>;
    expect(tools[0]?.name).toBe(REFINE_TOOL.name);
  });

  it("reads the OpenAI shaped tool call with string arguments", async () => {
    const out = toolArguments({ tool_calls: [{ type: "function", function: { name: "refine_night", arguments: '{"weekday":6}' } }] }, "refine_night");
    expect(out).toEqual({ weekday: 6 });
  });

  it("asks for JSON when the model makes no tool call", async () => {
    const model = ai((i) => (i["tools"] ? { response: "Sure, Friday it is." } : { response: 'Here you go: {"weekday": 5}' }));
    const generate = makeGenerate(model, "m");
    const out = await refineInput({ ai: model, model: "m", generate, core: CORE }, BASE, "make it Friday");
    expect(out.method).toBe("json");
    expect(out.input.weekday).toBe(5);
  });

  it("falls back to keywords when there is no model", async () => {
    const out = await refineInput({ ai: null, model: "m", generate: null, core: CORE }, BASE, "make it Friday, no live music");
    expect(out.method).toBe("keywords");
    expect(out.input.weekday).toBe(5);
    expect(out.input.noLiveMusic).toBe(true);
  });

  it("falls back to keywords when the model fails or times out", async () => {
    const broken: AiLike = { run: () => new Promise((_, reject) => setTimeout(() => reject(new Error("down")), 5)) };
    const out = await refineInput({ ai: broken, model: "m", generate: makeGenerate(broken, "m", 50), core: CORE, timeoutMs: 50 }, BASE, "make it Saturday");
    expect(out.method).toBe("keywords");
    expect(out.input.weekday).toBe(6);
  });

  it("always passes the model's change through applyRefine, so bad fields are dropped", async () => {
    const model = ai(() => ({ tool_calls: [{ name: REFINE_TOOL.name, arguments: { weekday: 99, venue: "Somewhere else", start: "25:99" } }] }));
    const out = await refineInput({ ai: model, model: "m", generate: null, core: CORE }, BASE, "anything");
    expect(out.input.weekday).toBe(4);
    expect(out.input.start).toBe("19:00");
    expect(out.input).not.toHaveProperty("venue");
  });
});

describe("model output helpers", () => {
  it("pull the first JSON object out of prose or a fence", () => {
    expect(extractJson('ok ```json\n{"a": {"b": "}"}}\n``` done')).toEqual({ a: { b: "}" } });
    expect(extractJson('prefix {"weekday": 2} suffix {"x":1}')).toEqual({ weekday: 2 });
    expect(extractJson("no json here")).toBeNull();
  });

  it("read text from the Workers AI and OpenAI response shapes", () => {
    expect(responseText({ response: "hi" })).toBe("hi");
    expect(responseText({ response: { a: 1 } })).toBe('{"a":1}');
    expect(responseText({ choices: [{ message: { content: "yo" } }] })).toBe("yo");
    expect(responseText(42)).toBeNull();
  });

  it("returns no generator without the AI binding", () => {
    expect(makeGenerate(undefined, "m")).toBeNull();
  });

  it("sends system and user messages and a token cap", async () => {
    const model = ai(() => ({ response: "copy" }));
    const generate = makeGenerate(model, "@cf/meta/llama")!;
    expect(await generate("sys", "usr")).toBe("copy");
    expect(model.inputs[0]).toMatchObject({ messages: [{ role: "system", content: "sys" }, { role: "user", content: "usr" }] });
    expect(model.inputs[0]?.["max_tokens"]).toBeGreaterThan(256);
  });
});
