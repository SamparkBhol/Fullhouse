import type { Generate } from "../core/index.ts";
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

export function responseText(out: unknown): string | null {
  if (typeof out === "string") return out;
  if (!out || typeof out !== "object") return null;
  const r = (out as { response?: unknown }).response;
  if (typeof r === "string") return r;
  if (r && typeof r === "object") return JSON.stringify(r);
  const choices = (out as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" ? content : null;
}

export function makeGenerate(ai: AiLike | null | undefined, model: string, timeoutMs = 25000): Generate | null {
  if (!ai) return null;
  return async (system: string, user: string) => {
    const out = await withTimeout(
      ai.run(model, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 1200,
        temperature: 0.4,
      }),
      timeoutMs,
      "model call",
    );
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

export function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(body.slice(start, i + 1)) as unknown;
        } catch {
          return undefined;
        }
      }
    }
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
      const text = await deps.generate(system, refineUser(base, request));
      const parsed = extractJsonObject(text);
      if (parsed && typeof parsed === "object") return { input: deps.core.applyRefine(base, parsed), method: "json" };
    } catch (err) {
      console.warn("refine json call failed", err instanceof Error ? err.message : String(err));
    }
  }
  return { input: deps.core.applyRefine(base, deps.core.parseRefineFallback(request)), method: "keywords" };
}
