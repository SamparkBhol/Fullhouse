import { extractJson, type Generate } from "../core/index.ts";
import type { PlanInput } from "../shared/contract.ts";
import type { AiLike } from "./env.ts";

export interface RefineCore {
  REFINE_TOOL: { name: string; description: string; parameters: Record<string, unknown> };
  parseRefineFallback(text: string): PlanInput;
  applyRefine(base: PlanInput, change: unknown): PlanInput;
}

export type RefineMethod = "tool" | "json" | "keywords";

export class TimeoutError extends Error {}

export function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} took longer than ${ms} ms`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

// Workers AI answers { response: string }, or { response: object } in JSON mode; the REST API wraps that in
// { result }, and OpenAI compatible models answer { choices }. A reply the platform read as a tool call
// arrives with an empty response and the JSON under tool_calls[0].arguments.
export function responseText(out: unknown): string | null {
  if (typeof out === "string") return out;
  if (!out || typeof out !== "object") return null;
  const o = out as { response?: unknown; result?: unknown; choices?: Array<{ message?: { content?: unknown } }>; tool_calls?: Array<{ arguments?: unknown }> };
  if (typeof o.response === "string" && o.response.trim()) return o.response;
  if (o.response && typeof o.response === "object") return JSON.stringify(o.response);
  if (o.result && typeof o.result === "object") return responseText(o.result);
  const content = o.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  const args = Array.isArray(o.tool_calls) ? o.tool_calls[0]?.arguments : undefined;
  if (args && typeof args === "object") return JSON.stringify(args);
  if (typeof args === "string") return args;
  return typeof o.response === "string" ? o.response : null;
}

function completionTokens(out: unknown): number | null {
  const n = (out as { usage?: { completion_tokens?: unknown } } | null)?.usage?.completion_tokens;
  return typeof n === "number" ? n : null;
}

const DEFAULT_MAX_TOKENS = 1200;
// Below this much time left, a second try without JSON mode would only run into the timeout.
const RETRY_FLOOR_MS = 4000;

export function makeGenerate(ai: AiLike | null | undefined, model: string, timeoutMs = 25000): Generate | null {
  if (!ai) return null;
  return async (system, user, options = {}) => {
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const inputs: Record<string, unknown> = {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    };
    const deadline = Date.now() + timeoutMs;
    const run = (body: Record<string, unknown>) => withTimeout(ai.run(model, body), Math.max(1, deadline - Date.now()), "model call");
    let out: unknown;
    if (options.schema) {
      try {
        out = await run({ ...inputs, response_format: { type: "json_schema", json_schema: options.schema } });
      } catch (err) {
        if (err instanceof TimeoutError || deadline - Date.now() < RETRY_FLOOR_MS) throw err;
        console.warn("JSON mode call failed, asking again without it", err instanceof Error ? err.message : String(err));
        out = await run(inputs);
      }
    } else {
      out = await run(inputs);
    }
    const used = completionTokens(out);
    if (used !== null && used >= maxTokens) console.warn("model reply reached the token cap", JSON.stringify({ used, maxTokens }));
    const text = responseText(out);
    if (!text || !text.trim()) throw new Error("model returned no text");
    return text;
  };
}

function parseArgs(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }
  return raw;
}

// Workers AI returns either [{ name, arguments }] or the OpenAI shape [{ function: { name, arguments } }].
export function toolArguments(out: unknown, toolName: string): unknown {
  if (!out || typeof out !== "object") return undefined;
  const calls = (out as { tool_calls?: unknown }).tool_calls ?? (out as { choices?: Array<{ message?: { tool_calls?: unknown } }> }).choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(calls)) return undefined;
  for (const call of calls) {
    if (!call || typeof call !== "object") continue;
    const flat = call as { name?: unknown; arguments?: unknown; function?: { name?: unknown; arguments?: unknown } };
    const name = flat.name ?? flat.function?.name;
    if (name !== toolName) continue;
    const args = parseArgs(flat.arguments ?? flat.function?.arguments);
    if (args && typeof args === "object") return args;
  }
  return undefined;
}

const REFINE_SYSTEM =
  "You turn a small venue owner's change request for a planned night into changes to the plan settings. " +
  "Set only the fields the request asks to change and leave every other field out. " +
  "Follow the field descriptions for units and allowed values. Never add names, places or facts.";

function refineUser(base: PlanInput, request: string): string {
  return `Current settings as JSON: ${JSON.stringify(base)}\nOwner request: ${request}`;
}

export interface RefineDeps {
  ai: AiLike | null;
  model: string;
  generate: Generate | null;
  core: RefineCore;
  timeoutMs?: number;
}

export async function refineInput(
  deps: RefineDeps,
  base: PlanInput,
  request: string,
): Promise<{ input: PlanInput; method: RefineMethod }> {
  const tool = deps.core.REFINE_TOOL;
  if (deps.ai) {
    try {
      const out = await withTimeout(
        deps.ai.run(deps.model, {
          messages: [
            { role: "system", content: REFINE_SYSTEM },
            { role: "user", content: refineUser(base, request) },
          ],
          tools: [{ name: tool.name, description: tool.description, parameters: tool.parameters }],
          max_tokens: 400,
          temperature: 0,
        }),
        deps.timeoutMs ?? 20000,
        "refine tool call",
      );
      const args = toolArguments(out, tool.name);
      if (args !== undefined) return { input: deps.core.applyRefine(base, args), method: "tool" };
    } catch (err) {
      console.warn("refine tool call failed", err instanceof Error ? err.message : String(err));
    }
  }
  if (deps.generate) {
    try {
      const system = `${REFINE_SYSTEM} Reply with one JSON object and nothing else. Its fields follow this JSON Schema: ${JSON.stringify(tool.parameters)}`;
      const text = await deps.generate(system, refineUser(base, request), { schema: tool.parameters, maxTokens: 400 });
      const parsed = extractJson(text);
      if (parsed && typeof parsed === "object") return { input: deps.core.applyRefine(base, parsed), method: "json" };
    } catch (err) {
      console.warn("refine json call failed", err instanceof Error ? err.message : String(err));
    }
  }
  return { input: deps.core.applyRefine(base, deps.core.parseRefineFallback(request)), method: "keywords" };
}
