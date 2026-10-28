// Models wrap JSON in prose or code fences, so the first balanced object that parses is taken.
// Llama replies often carry raw line breaks inside strings or a trailing comma, which a second, repaired parse accepts.
// A reply cut off after its last value only lacks closing braces, so those are added once before looking further in.

export type JsonFailure = "no_object" | "cut_off" | "unparsed";

// "inside" marks an object found within an outer one that never closed, such as one nested field of a cut off reply.
export type JsonFound = { value: Record<string, unknown>; inside?: true } | { failure: JsonFailure };

export function jsonObjectIn(text: string): JsonFound {
  if (typeof text !== "string") return { failure: "no_object" };
  const unfenced = text.replace(/```(?:json|JSON)?\s*([\s\S]*?)```/g, "$1");
  let sawClosed = false;
  let sawOpen = false;
  let unclosed = false;
  for (let start = unfenced.indexOf("{"); start >= 0; start = unfenced.indexOf("{", start + 1)) {
    sawOpen = true;
    const scan = scanObject(unfenced, start);
    if ("open" in scan) {
      if (!unclosed && !scan.inString) {
        const closed = parseObject(unfenced.slice(start).trimEnd() + "}".repeat(scan.open));
        if (closed) return { value: closed };
      }
      unclosed = true;
      continue;
    }
    sawClosed = true;
    const value = parseObject(unfenced.slice(start, scan.end + 1));
    if (value) return unclosed ? { value, inside: true } : { value };
  }
  const whole = parseObject(unfenced.trim());
  if (whole) return { value: whole };
  return { failure: !sawOpen ? "no_object" : sawClosed ? "unparsed" : "cut_off" };
}

export function extractJson(text: string): unknown {
  const found = jsonObjectIn(text);
  return "value" in found ? found.value : null;
}

// Where the object that opens at start closes, or how many braces are still open when the text runs out.
function scanObject(text: string, start: number): { end: number } | { open: number; inString: boolean } {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return { end: i };
  }
  return { open: depth, inString };
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// A reply can also be a JSON string that holds the object.
function parseObject(candidate: string): Record<string, unknown> | null {
  for (const attempt of [candidate, repairJson(candidate)]) {
    let value = tryParse(attempt);
    if (typeof value === "string" && value.trim().startsWith("{")) value = tryParse(value);
    if (isRecord(value)) return value;
  }
  return null;
}

const CONTROL_ESCAPES: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t" };

export function repairJson(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? "";
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      else if (ch < " ") {
        out += CONTROL_ESCAPES[ch] ?? `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    if (ch === "," && /^\s*[}\]]/.test(text.slice(i + 1))) continue;
    out += ch;
  }
  return out;
}
