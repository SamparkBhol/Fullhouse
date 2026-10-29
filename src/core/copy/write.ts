import type { NightCopy, NightPlan, StreetRead, Venue } from "../../shared/contract.ts";
import { listWords } from "../../shared/words.ts";
import { briefNames, buildBrief } from "./brief.ts";
import { checkClaims } from "./claims.ts";
import { settleModelCopy } from "./guard.ts";
import { jsonObjectIn, type JsonFailure } from "./json.ts";
import { COPY_MAX_TOKENS, COPY_SCHEMA, COPY_SYSTEM_PROMPT, copyUserPrompt } from "./prompt.ts";
import { bannedIn, fixDashes, hasDash } from "./text.ts";

export interface GenerateOptions {
  // A JSON Schema the reply must follow, sent as the model's JSON mode where it has one.
  schema?: Record<string, unknown>;
  maxTokens?: number;
}

export type Generate = (system: string, user: string, options?: GenerateOptions) => Promise<string>;

export const COPY_LIMITS: Record<string, number> = {
  eventTitle: 80,
  eventDescription: 1200,
  posterHeadline: 60,
  posterSub: 140,
  social: 280,
  subject: 120,
  body: 1500,
};

// Dashes are rewritten where they can be and refused where they cannot; empty or oversized text is refused.
export function cleanCopyField(key: string, v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = fixDashes(v.trim());
  if (!s || s.length > (COPY_LIMITS[key] ?? 500) || hasDash(s)) return null;
  return s;
}

const JSON_PROBLEM: Record<JsonFailure, string> = {
  no_object: "had no JSON object in it",
  cut_off: "stopped before its JSON object was complete",
  unparsed: "had a JSON object that would not parse",
};

// Some replies nest the fields one level down, under a key such as "copy".
function copyFields(o: Record<string, unknown>): Record<string, unknown> {
  if ("eventTitle" in o) return o;
  const nested = Object.values(o).filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && "eventTitle" in v);
  return nested.length === 1 && nested[0] ? nested[0] : o;
}

export function parseCopy(raw: string): { copy: Omit<NightCopy, "writtenBy"> } | { problem: string } {
  const found = jsonObjectIn(raw);
  if ("failure" in found) return { problem: JSON_PROBLEM[found.failure] };
  const o = copyFields(found.value);
  if (found.inside && !("eventTitle" in o)) return { problem: JSON_PROBLEM.cut_off };
  const pitch = typeof o.partnerPitch === "object" && o.partnerPitch !== null ? (o.partnerPitch as Record<string, unknown>) : {};
  const copy = {
    eventTitle: cleanCopyField("eventTitle", o.eventTitle),
    eventDescription: cleanCopyField("eventDescription", o.eventDescription),
    posterHeadline: cleanCopyField("posterHeadline", o.posterHeadline),
    posterSub: cleanCopyField("posterSub", o.posterSub),
    social: cleanCopyField("social", o.social),
    subject: cleanCopyField("subject", pitch.subject),
    body: cleanCopyField("body", pitch.body),
  };
  const missing = Object.entries(copy).filter(([, v]) => v === null).map(([k]) => k);
  if (missing.length) return { problem: `had missing or oversized fields (${missing.join(", ")})` };
  return {
    copy: {
      eventTitle: copy.eventTitle as string,
      eventDescription: copy.eventDescription as string,
      posterHeadline: copy.posterHeadline as string,
      posterSub: copy.posterSub as string,
      social: copy.social as string,
      partnerPitch: { subject: copy.subject as string, body: copy.body as string },
    },
  };
}

function copyText(c: Omit<NightCopy, "writtenBy">): string {
  return [c.eventTitle, c.eventDescription, c.posterHeadline, c.posterSub, c.social, c.partnerPitch.subject, c.partnerPitch.body].join("\n");
}

function keepTemplate(plan: NightPlan, why: string, unverified: string[] = []): NightPlan {
  return {
    ...plan,
    checks: { claimsVerified: plan.checks.claimsVerified, unverified },
    limits: [...plan.limits, `${why}, so the copy comes from templates.`],
  };
}

// The head of a refused reply goes to the Worker log, so a live run shows what the model actually sent.
function logRefused(problem: string, raw: string): void {
  console.warn("model copy refused", JSON.stringify({ problem, length: raw.length, head: raw.slice(0, 240) }));
}

// A night at the partner's place keeps template copy: the model writes as the venue, and the pitch must come from it.
export async function writeCopy(plan: NightPlan, venue: Venue, read: StreetRead, generate: Generate | null): Promise<NightPlan> {
  if (!generate || plan.match?.host === "partner") return plan;
  const brief = buildBrief(plan, venue, read);
  const allowed = briefNames(brief, plan, read);
  let raw: string;
  try {
    raw = await generate(COPY_SYSTEM_PROMPT, copyUserPrompt(brief, plan.copy), { schema: COPY_SCHEMA, maxTokens: COPY_MAX_TOKENS });
  } catch {
    return keepTemplate(plan, "The model did not answer");
  }
  // The owner gets one plain line; what exactly was wrong with the reply goes to the Worker log.
  const parsed = parseCopy(raw);
  if ("problem" in parsed) {
    logRefused(parsed.problem, raw);
    return keepTemplate(plan, "The model's reply was not usable");
  }
  const text = copyText(parsed.copy);
  const banned = bannedIn(text);
  if (banned.length) return keepTemplate(plan, `The model copy used words from the banned list (${banned.join(", ")})`);
  const check = checkClaims(text, allowed);
  if (!check.ok) {
    return keepTemplate(plan, `The model copy named ${listWords(check.unverified)}, which ${check.unverified.length === 1 ? "is" : "are"} not in the Qloo brief`, check.unverified);
  }
  const settled = settleModelCopy(parsed.copy, plan.copy, plan.feature?.name ?? null, venue.entity.name);
  return {
    ...plan,
    copy: { ...settled, writtenBy: "model" },
    checks: { claimsVerified: true, unverified: [] },
  };
}
